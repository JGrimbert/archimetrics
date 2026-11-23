// LE RELEVÉ DES FICHIERS DE CODE : chaque fichier analysé selon sa langue, en un modèle commun
// { rel, lang, test, lines, codeLines, code: Set, imports, exports, functions, classes, tokens, tokenLines, blocks?, vue?, error? }.

import { readFileSync } from 'node:fs'
import { analyzePython } from './python.mjs'
import { analyzeScript } from './script.mjs'
import { analyzeVue } from './vue.mjs'

export function analyzeFiles(cfg, files) {
  const warnings = []
  const py = analyzePython(cfg.root, files.filter((f) => f.lang === 'py').map((f) => f.rel))
  if (py.warning) warnings.push(py.warning)
  const out = []
  for (const f of files) {
    let text
    try {
      text = readFileSync(f.abs, 'utf8')
    } catch (e) {
      warnings.push(`${f.rel} : illisible (${e.code ?? e.message})`)
      continue
    }
    const base = { rel: f.rel, ext: f.ext, lang: f.lang, test: f.test }
    try {
      if (f.lang === 'py') {
        const r = py.results[f.rel]
        if (!r || r.error) {
          if (r?.error) warnings.push(`${f.rel} : ${r.error}`)
          const lines = text.split(/\r?\n/)
          const code = new Set(lines.map((l, i) => (l.trim() && !l.trim().startsWith('#') ? i + 1 : 0)).filter(Boolean))
          out.push({ ...base, lines: lines.length, codeLines: code.size, code, imports: [], exports: [], functions: [], classes: [], tokens: [], tokenLines: [], error: r?.error ?? 'non analysé' })
        } else out.push({ ...base, ...r, code: new Set(r.code) })
      } else if (f.lang === 'vue') {
        out.push({ ...base, ...analyzeVue(text, f.rel) })
      } else {
        const r = analyzeScript(text, { ext: f.ext, fileName: f.rel })
        delete r.sf
        out.push({ ...base, ...r, codeLines: r.code.size })
      }
    } catch (e) {
      warnings.push(`${f.rel} : analyse en échec (${e.message})`)
    }
  }
  return { files: out, warnings }
}
