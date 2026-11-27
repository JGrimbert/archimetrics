// LA PARTIE CALCULÉE DU `CLAUDE.md` D'UN DOSSIER (`archimetrics claude-md`, AM-8) : ses fichiers de code directs, le
// rôle de chacun (tiré de son commentaire d'en-tête), ses exports, ses dépendances sortantes (fichiers du projet et
// paquets) et entrantes. Le bloc est posé entre `<!-- archimetrics:debut -->` et `<!-- archimetrics:fin -->` ; le
// texte écrit à la main hors des balises est gardé. Aucune date : deux passages sur le même code rendent le même bloc.

import { END, START, updateReadme } from '../readme.mjs'
import { exportsOf } from './model.mjs'

const MAX_ROLE = 200
const dirOfRel = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')
const base = (rel) => rel.slice(rel.lastIndexOf('/') + 1)

// Le commentaire d'en-tête (`//`, `/* */`, `#`, ou docstring Python), réduit à sa première phrase.
export function headerRole(text) {
  const lines = text.replace(/^#!.*\n/, '').split('\n')
  const out = []
  let block = null
  for (const raw of lines) {
    const l = raw.trim()
    if (block) {
      const endAt = l.indexOf(block)
      out.push(l.slice(0, endAt >= 0 ? endAt : undefined).replace(/^\*\s?/, ''))
      if (endAt >= 0) break
    } else if (l.startsWith('//') || (l.startsWith('#') && !l.startsWith('#!'))) out.push(l.replace(/^(\/\/+|#+)\s?/, ''))
    else if (l.startsWith('/*') || l.startsWith('"""') || l.startsWith("'''")) {
      block = l.startsWith('/*') ? '*/' : l.slice(0, 3)
      const rest = l.slice(block === '*/' ? 2 : 3).replace(/^\*+\s?/, '')
      const endAt = rest.indexOf(block)
      out.push(endAt >= 0 ? rest.slice(0, endAt) : rest)
      if (endAt >= 0) break
    } else if (l === '' && !out.length) continue
    else break
  }
  const joined = out.join(' ').replace(/\s+/g, ' ').trim()
  if (!joined) return null
  const m = joined.match(/^(.+?[.!?])(\s|$)/)
  const first = m ? m[1] : joined
  return first.length > MAX_ROLE ? first.slice(0, MAX_ROLE - 1) + '…' : first
}

const code = (s) => '`' + s + '`'
const list = (xs) => xs.map(code).join(', ')

function fileEntry(model, f) {
  const role = headerRole(model.read(f.rel))
  const names = [...new Set(exportsOf(f).map((e) => e.name))]
  const outs = [...(model.out.get(f.rel)?.keys() ?? [])].sort()
  const ext = [...(model.graph.external.get(f.rel) ?? [])].sort()
  const ins = [...(model.inc.get(f.rel)?.keys() ?? [])].sort()
  const lines = [`- ${code(base(f.rel))}${f.test ? ' (test)' : ''}${role ? ' — ' + role : ''}`]
  if (names.length) lines.push(`  - exports : ${list(names)}`)
  if (outs.length || ext.length) lines.push(`  - importe : ${[outs.length ? list(outs) : null, ext.length ? 'paquets ' + list(ext) : null].filter(Boolean).join(' ; ')}`)
  if (ins.length) lines.push(`  - importé par : ${list(ins)}`)
  return lines.join('\n')
}

/**
 * Le bloc calculé du dossier `dir` (relatif à la racine, '' pour la racine), balises comprises.
 * @param {any} model `loadModel(...)`
 * @param {string} dir
 */
export function claudeMdBlock(model, dir) {
  const files = model.files.filter((f) => dirOfRel(f.rel) === dir).sort((a, b) => a.rel.localeCompare(b.rel))
  const titre = dir ? code(dir) : 'la racine'
  return [
    START,
    `## Fichiers de ${titre} (partie calculée par archimetrics, régénérée par \`archimetrics claude-md\`)`,
    '',
    'Chemins des dépendances relatifs à la racine du projet.',
    '',
    ...(files.length ? files.map((f) => fileEntry(model, f)) : ['Aucun fichier de code direct.']),
    END,
  ].join('\n')
}

// Le texte du `CLAUDE.md` après pose du bloc : celui entre balises remplacé, le reste intact (bloc ajouté à la fin
// s'il n'y avait pas de balises).
export function updateClaudeMd(text, block) {
  return updateReadme(text, block)
}
