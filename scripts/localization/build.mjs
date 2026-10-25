import fs from 'node:fs'
const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'))
const ui = read('ui-source.json')
const content = read('content-source.json')
const uiRows = fs.readFileSync(new URL('ui-authored.txt', import.meta.url), 'utf8').trim().split('\n').map(row => row.split('|'))
const contentRows = fs.existsSync(new URL('content-authored.txt', import.meta.url)) ? fs.readFileSync(new URL('content-authored.txt', import.meta.url), 'utf8').trim().split('\n').filter(Boolean).map(row => row.split('|')) : []
const entries = Object.entries(content)
for (const [locale, column] of [['en',0],['ceb',1],['fil',2]]) {
  const translatedUI = Object.fromEntries(ui.map(source => [source,source]))
  const translatedContent = locale === 'en' ? content : {}
  if (locale !== 'en') {
    for (const row of uiRows) { if (row.length !== 3 || !ui[+row[0]]) throw new Error('Invalid UI row '+row[0]); translatedUI[ui[+row[0]]] = row[column] }
    for (const row of contentRows) { if (row.length !== 3 || !entries[+row[0]]) throw new Error('Invalid content row '+row[0]); translatedContent[entries[+row[0]][0]] = row[column] === '=' ? entries[+row[0]][1] : row[column] }
  }
  const dir = new URL(`../../src/i18n/locales/${locale}/`, import.meta.url)
  fs.mkdirSync(dir,{recursive:true})
  fs.writeFileSync(new URL('ui.json',dir),JSON.stringify(translatedUI,null,2)+'\n')
  fs.writeFileSync(new URL('content.json',dir),JSON.stringify(translatedContent,null,2)+'\n')
}
