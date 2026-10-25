import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MAX_OUTPUT_BYTES, ServiceError, validateExecution } from '../validation.mjs'

export const WALL_MS = 12000
const IMAGE_PATTERNS = {
  python: /^(?:docker\.io\/library\/)?python:[0-9][a-zA-Z0-9._-]*@sha256:[a-f0-9]{64}$/,
  php: /^(?:docker\.io\/library\/)?php:[0-9][a-zA-Z0-9._-]*@sha256:[a-f0-9]{64}$/,
  csharp: /^mcr\.microsoft\.com\/dotnet\/sdk:8\.0(?:[.-][a-zA-Z0-9._-]+)?@sha256:[a-f0-9]{64}$/,
}
const IMAGE_ENVS = { python: 'RUNNER_PYTHON_IMAGE', php: 'RUNNER_PHP_IMAGE', csharp: 'RUNNER_CSHARP_IMAGE' }
const FILE_NAMES = { python: 'main.py', php: 'main.php', csharp: 'Program.cs' }
const PROJECT = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><UseAppHost>false</UseAppHost><EnableNETAnalyzers>false</EnableNETAnalyzers><NuGetAudit>false</NuGetAudit><RestoreIgnoreFailedSources>false</RestoreIgnoreFailedSources></PropertyGroup></Project>`
const NUGET = '<configuration><packageSources><clear /></packageSources></configuration>'
// This script is a constant, never interpolated with code, input or other request fields.
export const CSHARP_COMMAND = 'cp /source/Program.cs /source/Devly.csproj /source/NuGet.Config /work/ && cd /work && dotnet restore Devly.csproj --configfile NuGet.Config --verbosity quiet >&2 && dotnet build Devly.csproj --no-restore --configuration Release --output /work/out --verbosity quiet --disable-build-servers -p:UseSharedCompilation=false -maxcpucount:1 >&2 && exec dotnet /work/out/Devly.dll'

export function configuredImage(language, env = process.env) {
  if (!Object.hasOwn(IMAGE_PATTERNS, language)) throw new ServiceError(400, 'Unsupported language.')
  const value = env[IMAGE_ENVS[language]]?.trim()
  if (!value || !IMAGE_PATTERNS[language].test(value)) {
    throw new ServiceError(503, `${IMAGE_ENVS[language]} must name a digest-pinned official image, pre-pulled on the runner host.`)
  }
  return value
}

export function containerArgs(language, image, directory, name) {
  if (!Object.hasOwn(IMAGE_PATTERNS, language) || !IMAGE_PATTERNS[language].test(image)) {
    throw new ServiceError(503, 'Invalid runner image configuration.')
  }
  if (!/^devly-[a-f0-9-]{36}$/.test(name) || !path.isAbsolute(directory) || /[,\r\n]/.test(directory)) {
    throw new ServiceError(503, 'Invalid runner job configuration.')
  }
  const args = [
    'create', '--name', name, '--label', 'devly.runner=true', '--pull=never',
    '--interactive', '--network=none', '--read-only', '--user=65534:65534',
    '--cap-drop=ALL', '--security-opt=no-new-privileges=true',
    '--memory=512m', '--memory-swap=512m', '--cpus=1', '--pids-limit=64',
    '--ulimit', 'nofile=128:128', '--ulimit', 'core=0:0',
    '--log-driver=none', '--init', '--workdir=/work',
    '--mount', `type=bind,src=${directory},dst=/source,readonly`,
    '--tmpfs', '/work:rw,nosuid,nodev,size=134217728,mode=1777',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=33554432,mode=1777',
    '--env', 'HOME=/tmp', '--env', 'TMPDIR=/tmp',
  ]
  if (language === 'python') return [...args, '--entrypoint=python3', image, '-I', '-B', '/source/main.py']
  if (language === 'php') return [...args, '--entrypoint=php', image, '-n', '/source/main.php']
  return [...args,
    '--env', 'DOTNET_CLI_HOME=/tmp', '--env', 'DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1',
    '--env', 'DOTNET_CLI_TELEMETRY_OPTOUT=1', '--env', 'DOTNET_NOLOGO=1',
    '--env', 'DOTNET_PROCESSOR_COUNT=1', '--env', 'DOTNET_GCHeapHardLimit=0x10000000',
    '--env', 'NUGET_PACKAGES=/tmp/nuget', '--env', 'DOTNET_EnableDiagnostics=0',
    '--entrypoint=/bin/sh', image, '-c', CSHARP_COMMAND,
  ]
}

// No shell on the host. Only Docker receives fixed operations and validated args.
export function dockerCommand(args, { input = '', signal, timeoutMs = 5000, maxBytes = 8192 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new ServiceError(499, 'Execution cancelled.')); return }
    const child = spawn('docker', args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let count = 0
    const out = []
    const err = []
    let timedOut = false
    let truncated = false
    let cancelled = false
    let settled = false
    const stop = () => { child.kill('SIGKILL') }
    const timer = setTimeout(() => { timedOut = true; stop() }, timeoutMs)
    const abort = () => { cancelled = true; stop() }
    signal?.addEventListener('abort', abort, { once: true })
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    const collect = (destination) => (chunk) => {
      const remaining = Math.max(0, maxBytes - count)
      if (remaining) destination.push(chunk.subarray(0, remaining))
      count += chunk.length
      if (count > maxBytes && !truncated) { truncated = true; stop() }
    }
    child.stdout.on('data', collect(out))
    child.stderr.on('data', collect(err))
    child.stdin.on('error', () => {}) // Early program exit can close stdin before it is written.
    child.once('error', () => {
      if (settled) return
      settled = true; clean()
      reject(new ServiceError(503, 'Docker is unavailable. Install and start Docker on the dedicated runner host.'))
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true; clean()
      resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'),
        exitCode: timedOut ? 124 : cancelled || truncated ? 137 : code ?? 137,
        truncated, timedOut, cancelled })
    })
    child.stdin.end(input)
    if (signal?.aborted) abort()
  })
}

export function createDockerRunner({ env = process.env, command = dockerCommand, temporaryRoot = tmpdir() } = {}) {
  let busy = false
  let unhealthy = false
  return async function run(value, signal) {
    const body = validateExecution(value)
    const image = configuredImage(body.language, env)
    if (busy || unhealthy) throw new ServiceError(503, unhealthy ? 'Runner requires cleanup and restart.' : 'Runner is busy. Retry later.')
    signal?.throwIfAborted()
    busy = true
    const name = `devly-${randomUUID()}`
    let directory
    let attemptedCreate = false
    let created = false
    try {
      // Inspect does not pull. Validate availability before writing source to disk.
      const inspected = await command(['image', 'inspect', '--format', '{{.Id}}', image], { signal })
      if (inspected.exitCode !== 0) throw new ServiceError(503, 'Configured image is unavailable; pre-pull it on the runner host.')
      directory = await mkdtemp(path.join(temporaryRoot, 'devly-run-'))
      // Keep the outer host directory private; only its readable child is mounted.
      const source = path.join(directory, 'source')
      await mkdir(source, { mode: 0o755 })
      await writeFile(path.join(source, FILE_NAMES[body.language]), body.code, { mode: 0o444 })
      if (body.language === 'csharp') {
        await writeFile(path.join(source, 'Devly.csproj'), PROJECT, { mode: 0o444 })
        await writeFile(path.join(source, 'NuGet.Config'), NUGET, { mode: 0o444 })
      }
      signal?.throwIfAborted()
      attemptedCreate = true
      const container = await command(containerArgs(body.language, image, source, name), { signal })
      if (container.exitCode !== 0) throw new ServiceError(503, 'Could not create an isolated Docker container.')
      created = true
      const result = await command(['start', '--attach', '--interactive', name], {
        input: body.input, signal, timeoutMs: WALL_MS, maxBytes: MAX_OUTPUT_BYTES,
      })
      if (result.cancelled) throw new ServiceError(499, 'Execution cancelled.')
      // Docker start does not reliably propagate the program exit status on every
      // Docker version. Read the container state after a normal attached exit.
      let exitCode = result.exitCode
      if (!result.timedOut && !result.truncated) {
        const state = await command(['inspect', '--format', '{{.State.Running}} {{.State.ExitCode}}', name], { signal })
        const match = /^false (\d{1,3})\s*$/.exec(state.stdout)
        if (state.exitCode !== 0 || !match || Number(match[1]) > 255) throw new ServiceError(503, 'Unable to verify container completion.')
        exitCode = Number(match[1])
      }
      return { stdout: result.stdout, stderr: result.stderr, exitCode, truncated: result.truncated }
    } finally {
      try {
        if (attemptedCreate) {
          // Independent of the cancelled request signal: forced removal kills all
          // container processes, including children detached from the attached CLI.
          const removed = await command(['rm', '--force', '--volumes', name])
          if (removed.exitCode !== 0) {
            // A failed create can legitimately leave no container. Prove absence.
            const remaining = await command(['container', 'ls', '--all', '--quiet', '--filter', `name=^/${name}$`])
            if (created || remaining.exitCode !== 0 || remaining.stdout.trim()) {
              unhealthy = true
              throw new ServiceError(503, 'Runner cleanup failed; operator intervention is required.')
            }
          }
        }
      } catch {
        unhealthy = true
        throw new ServiceError(503, 'Runner cleanup failed; operator intervention is required.')
      } finally {
        // Only remove the concrete directory returned by mkdtemp, never a request path.
        if (directory) {
          try { await rm(directory, { recursive: true, force: true, maxRetries: 3 }) }
          catch { unhealthy = true }
        }
        busy = false
      }
    }
  }
}
