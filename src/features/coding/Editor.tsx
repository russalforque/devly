import MonacoEditor, { loader, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import 'monaco-editor/language/typescript/monaco.contribution'
import 'monaco-editor/languages/definitions/typescript/register'
import 'monaco-editor/languages/definitions/javascript/register'
import 'monaco-editor/editor/contrib/suggest/browser/suggestController'
import 'monaco-editor/editor/contrib/format/browser/formatActions'

self.MonacoEnvironment = {
  getWorker(_moduleId, label) { return label === 'typescript' || label === 'javascript' ? new TypeScriptWorker() : new EditorWorker() },
}
loader.config({ monaco })

export default function Editor({ code, language, onChange, onMount, dark }: { code: string; language: string; onChange: (value: string) => void; onMount: OnMount; dark: boolean }) {
  return <MonacoEditor height="400px" language={language} value={code} onChange={value => onChange(value ?? '')} onMount={onMount} theme={dark ? 'vs-dark' : 'vs'} loading={<p className="editor-loading">Loading the editor…</p>} options={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, padding: { top: 15 }, wordWrap: 'on', ariaLabel: 'Challenge code editor', fixedOverflowWidgets: true }} />
}
