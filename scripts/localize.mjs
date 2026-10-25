// One-time migration helper. Uses the TypeScript parser; never rewrites code strings.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
const files = walk('src').filter(file => file.endsWith('.tsx') && !file.includes('.test.') && !file.includes('i18n') && !file.endsWith('Editor.tsx'))
const ui = new Set()
const human = value => /[a-zA-Z]/.test(value) && !/^(?:[.\/#]|https?:|[a-z]+-[a-z-]+$|[a-z]+\/[a-z])/.test(value)
const displayAttrs = new Set(['title', 'subtitle', 'description', 'action', 'placeholder', 'aria-label'])
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []
  const add = (start, end, value) => edits.push({ start, end, value })
  const insideCode = node => {
    for (let parent = node.parent; parent; parent = parent.parent) if (ts.isJsxElement(parent) && ['code', 'pre'].includes(parent.openingElement.tagName.getText(tree))) return true
    return false
  }
  const rawValue = /^(?:children|code|answer|message|context|initials|name|query|response|source|draft|notes|track.symbol|state.profile.display_name|session.answers.*|activeAnswer.*)$/
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (human(node.text) && (/[A-Z ]/.test(node.text) || ['problem','editor','results','days','min','light','dark','system'].includes(node.text))) ui.add(node.text)
    }
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text) && node.body) add(node.body.getStart(tree) + 1, node.body.getStart(tree) + 1, '\n  useTranslation()\n')
    if (ts.isJsxText(node) && !insideCode(node)) {
      const value = node.text.replace(/\s+/g, ' ')
      const trimmed = value.trim()
      if (trimmed && /[a-zA-Z]/.test(trimmed)) {
        ui.add(trimmed)
        add(node.getStart(tree), node.end, `{tr(${JSON.stringify(trimmed)})}${value.endsWith(' ') ? "{' '}" : ''}`)
      }
    }
    if (ts.isJsxAttribute(node) && displayAttrs.has(node.name.getText(tree)) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) add(node.initializer.getStart(tree), node.initializer.end, `{tr(${JSON.stringify(node.initializer.text)})}`)
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        const expression = node.initializer.expression
        add(expression.getStart(tree), expression.getStart(tree), 'tr(')
        add(expression.end, expression.end, ')')
      }
    }
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent) && !insideCode(node)) {
      const expression = node.expression
      if (!rawValue.test(expression.getText(tree))) {
        add(expression.getStart(tree), expression.getStart(tree), 'tx(')
        add(expression.end, expression.end, ')')
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (process.argv.includes('--apply')) {
    let changed = source
    for (const edit of edits.sort((a,b) => b.start-a.start || b.end-a.end)) changed = changed.slice(0, edit.start) + edit.value + changed.slice(edit.end)
    const relative = path.relative(path.dirname(file), 'src/i18n/text').replaceAll('\\', '/')
    fs.writeFileSync(file, `import { useTranslation } from 'react-i18next'\nimport { tr, tx } from '${relative.startsWith('.') ? relative : './'+relative}'\n` + changed)
  }
}
// Also catalog app-authored errors (provider diagnostics remain original text).
for (const file of walk('src').filter(file => file.endsWith('.ts') && !file.includes('.test.') && !file.includes('i18n') && !file.includes('content.ts') && !file.endsWith('challenges.ts'))) {
  const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const visit = node => { if (ts.isStringLiteral(node) && /^[A-Z]/.test(node.text) && node.text.includes(' ')) ui.add(node.text); ts.forEachChild(node, visit) }; visit(tree)
}
const content = {}
const fields = new Set(['title','subtitle','objective','prerequisites','concept','scenario','mistakes','exercise','prompt','options','explanation','summary','next','description','requirements','hints','actual','expected','topic','topics','roadmap','name','signals','sample','architecture','tasks','acceptance','tests','review','testScenarios','acceptanceCriteria','reviewChecklist','label'])
function flatten(value, key, enabled = false) {
  if (typeof value === 'string' && enabled) content[key] = value
  else if (Array.isArray(value)) value.forEach((entry, index) => flatten(entry, `${key}.${entry.id ?? index}`, enabled))
  else if (value && typeof value === 'object') for (const [field, entry] of Object.entries(value)) {
    if (['tests'].includes(field) && key.startsWith('challenges.')) { entry.forEach((test, index) => { content[`${key}.tests.${index}.name`] = test.name }); continue }
    if (['code','starter','typescript','reference','language','id','trackId','source','logs','args','expected','category','symbol','color'].includes(field) && !(field === 'expected' && key.endsWith('.bug'))) continue
    flatten(entry, `${key}.${field}`, fields.has(field))
  }
}
for (const [name, file, exports] of [
  ['curriculum','src/features/curriculum/content.ts',['lessons','tracks']],
  ['challenges','src/features/coding/challenges.ts',['challenges']],
  ['interviews','src/features/interviews/content.ts',['questions']],
  ['projects','src/features/projects/content.ts',['projects']],
  ['assessment','src/features/assessment/content.ts',['diagnostics']],
]) {
  const output = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  const mod = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))
  for (const exported of exports) if (mod[exported]) flatten(mod[exported], `${name}.${exported}`)
  if (name === 'assessment' && !mod.diagnostics) { console.log('Assessment exports:',Object.keys(mod)); for (const [key,value] of Object.entries(mod)) if (typeof value === 'object') flatten(value, `${name}.${key}`) }
}
const contentText = new Set(Object.values(content))
const strings = [...ui].filter(value => !contentText.has(value)).sort()
fs.mkdirSync('scripts/localization', {recursive:true})
fs.writeFileSync('scripts/localization/ui-source.json', JSON.stringify(strings,null,2))
fs.writeFileSync('scripts/localization/content-source.json', JSON.stringify(content,null,2))
console.log({ui:strings.length,content:Object.keys(content).length,files:files.length})
