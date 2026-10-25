# Devly isolated execution runner

This is a separate Node service on a dedicated Docker host. It is **not** a Vercel function. The Vercel `/api/execute` function authenticates the Supabase owner, consumes the database budget, and calls this runner over HTTPS. The runner itself authenticates the server-only shared token. Never call it directly from the browser or put its token in a `VITE_` variable.

If Docker is unavailable, code cannot execute. The service returns 503; it never falls back to executing Python, PHP, C#, JavaScript, or a shell on the host. Docker was unavailable in the implementation environment, so the included tests mock every Docker process; actual image smoke tests remain an operator step.

## Start

Use Node 22.18+ and Linux containers on a dedicated host with a local Docker daemon. Docker Desktop Linux-container mode can be used for local development with the temporary directory shared into its VM. Remote Docker daemons are unsupported: source bind mounts must refer to the runner host's own filesystem. The production host needs working memory/CPU/PID cgroup enforcement. Keep Docker's default seccomp profile enabled.

Set these environment variables privately on that host:

| Variable | Value |
| --- | --- |
| `RUNNER_TOKEN` | A random secret, at least 32 printable non-space characters; identical to the API server's token |
| `RUNNER_PYTHON_IMAGE` | `python:<version-and-variant>@sha256:<64-lowercase-hex-digest>` |
| `RUNNER_PHP_IMAGE` | `php:<version>-cli@sha256:<64-lowercase-hex-digest>` |
| `RUNNER_CSHARP_IMAGE` | `mcr.microsoft.com/dotnet/sdk:8.0@sha256:<64-lowercase-hex-digest>` (a versioned `8.0.*` tag is also accepted) |
| `RUNNER_HOST` | Optional; defaults to `127.0.0.1` |
| `RUNNER_PORT` | Optional; defaults to `8787` |

Choose and review the image versions and real digests yourself. These templates are not usable image references. Python/PHP allow only official Docker Library repositories (`docker.io/library/` is optional); C# allows only the official .NET 8 SDK repository. Tags alone, unpinned images, arbitrary registries, and runtime-only C# images are rejected.

Pre-pull each chosen tag, inspect its `RepoDigests`, combine the chosen tag with that immutable digest, then pre-pull that exact configured reference. For example, `docker image inspect --format '{{json .RepoDigests}}' <chosen-tag>` displays the available digests. No image is pulled by a job (`--pull=never`). You may configure only the languages you use; other languages return a clear 503.

Start from the repository root with environment variables already supplied:

```sh
node server/runner/index.mjs
```

Alternatively, use Node's `--env-file=/private/path/runner.env` option. Keep secret files outside the repository. Put a TLS reverse proxy in front of the loopback listener. The API's `RUNNER_URL` must be the dedicated HTTPS origin (or `/execute` URL); plain HTTP is deliberately rejected even by the local API. For local end-to-end development, use a trusted local TLS proxy. Do not disable TLS certificate verification. Do not expose the Docker socket, source directories, or this service on an unauthenticated public port. The proxy should propagate client disconnects and enforce a 16 KiB request limit. Disable body and Authorization-header logging.

## Protocol and limits

`POST /execute`, `Content-Type: application/json`, `Authorization: Bearer <RUNNER_TOKEN>`:

```json
{"language":"python","code":"print(input())","input":"hello\n"}
```

Returns `{ "stdout": "hello\n", "stderr": "", "exitCode": 0, "truncated": false }`.

Only `python`, `php`, and `csharp` are supported. PHP input must include `<?php` to execute as PHP. C# accepts a single `Program.cs` using top-level statements or a `Main` entry point. The runner generates a fixed .NET 8 project and a NuGet configuration with no sources, restores against SDK-provided framework packs offline, builds without a second restore, then executes the generated DLL and its SDK-generated runtime configuration. There are no package dependencies, arbitrary project uploads, or user-controlled build flags. Build diagnostics go to stderr.

| Limit | Value |
| --- | --- |
| Full JSON body | 16 KiB, uncompressed |
| Code / stdin | 12,000 / 2,000 UTF-8 bytes |
| Concurrent jobs | 1 per runner process; no queue, busy returns 503 |
| Upload / request deadline | 5 seconds / 25 seconds |
| Container wall time | 12 seconds including C# restore/build/start |
| Docker management operation | 5 seconds each |
| Combined stdout + stderr | 64 KiB before UTF-8 decoding; overflow kills job |
| Memory / CPU / PIDs | 512 MiB, no extra swap / 1 CPU / 64 |
| Writable temporary storage | `/work`: 128 MiB; `/tmp`: 32 MiB |

Containers run as UID/GID 65534, with no network, a read-only root, no capabilities, `no-new-privileges`, default seccomp, no host services, no Docker socket, no injected secrets, and a read-only mount of one ephemeral source directory. The host launches only `docker` with argv arrays and `shell:false`. C# uses one fixed shell script **inside** its container; submitted code never becomes a command argument or interpolated script.

Normal program failures return their container exit code; timeouts use 124, output-limit termination uses 137 plus `truncated:true`. Timeout is a completed execution result, not an HTTP error. Docker/configuration failures return 503. Output is untrusted text: render it as text, never as HTML.

On completion, timeout, output overflow, disconnect, SIGINT, or SIGTERM, the runner force-removes the named container (killing its child processes) and deletes its temporary files. A container cleanup failure disables subsequent jobs until operator cleanup and process restart. Host SIGKILL/power loss cannot run application cleanup: supervise the service and reconcile containers labeled `devly.runner=true` and stale `devly-run-*` temporary directories after a crash before restarting. Run exactly one service process per dedicated runner host; multiple workers would each permit a job. Containers share the host kernel, so use a dedicated low-trust host/VM, with no application database or cloud credentials on it.

## Verify on the Docker host

After configuring and pre-pulling real images, test Python `print(input())`, PHP `<?php echo fgets(STDIN);`, and C# `Console.WriteLine(Console.ReadLine());` with `hello\n`. Each should return stdout `hello\n`, exit code 0, and `truncated:false`. Then verify a syntax error, an infinite loop (124), excess output (137 and truncated), and a client disconnect. Check that `docker container ls --all --filter label=devly.runner=true` has no remaining job containers. Do not mark a deployment ready until these pass on its actual host.

See [service integration](../../docs/services.md) for the owner-only API, migration, and mock test commands. Container flags follow the [official Docker run reference](https://docs.docker.com/reference/cli/docker/container/run/); the offline restore/build sequence follows [Microsoft's dotnet restore documentation](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-restore).
