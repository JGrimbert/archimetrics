// LA PARTIE CALCULÉE DU `CLAUDE.md` D'UN DOSSIER (`archimetrics claude-md`, AM-8) : ses fichiers de code directs, le
// rôle de chacun (tiré de son commentaire d'en-tête), ses exports, ses dépendances sortantes (fichiers du projet et
// paquets) et entrantes. Le bloc est posé entre `<!-- archimetrics:debut -->` et `<!-- archimetrics:fin -->` ; le
// texte écrit à la main hors des balises est gardé. Aucune date : deux passages sur le même code rendent le même bloc.

import { END, START, updateReadme } from '../readme.mjs'
import { exportsOf } from './model.mjs'

const MAX_ROLE = 200
const dirOfRel = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')
const base = (rel) => rel.slice(rel.lastIndexOf('/') + 1)

// Le commentaire d'en-tête (`//`, `/* */`, `#`, ou docstring Python) → ses lignes de texte.
function headerLines(text) {
  const t = text.replace(/^#!.*\n/, '').trimStart()
  const block = t.match(/^\/\*+([\s\S]*?)\*\//)
  if (block) return block[1].split('\n').map((l) => l.trim().replace(/^\*+\s?/, ''))
  const doc = t.match(/^("""|''')([\s\S]*?)\1/)
  if (doc) return doc[2].split('\n')
  const lines = []
  for (const l of t.split('\n')) {
    if (!/^\s*(\/\/|#)/.test(l)) break
    lines.push(l.trim().replace(/^(\/\/+|#+)\s?/, ''))
  }
  return lines
}

// Le rôle d'un fichier : la première phrase de son commentaire d'en-tête (`null` s'il n'en a pas).
export function headerRole(text) {
  const joined = headerLines(text).join(' ').replace(/\s+/g, ' ').trim()
  if (!joined) return null
  const first = joined.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? joined
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
