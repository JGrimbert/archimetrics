// LE CODE GÉNÉRÉ, écarté des mesures (il n'est ni écrit ni relu par l'équipe) :
// - dossiers connus (`__generated__`, `generated`, `.nuxt`, `.next`, `.output`, `.svelte-kit`) : inféré, confiance 0,7 ;
// - en-tête d'un fichier de code (ses 600 premiers caractères) dont une ligne de commentaire COMMENCE par une marque
//   (`@generated`, `auto-generated`, `Code generated … DO NOT EDIT`, `DO NOT EDIT`, `This file was automatically
//   generated`) : observé, confiance 0,9 ; fichier minifié (`.min.js`) : inféré, confiance 0,7.
// Le test s'insère dans `cfg.excludeRes` (même interface qu'une expression régulière : `test(rel)`), et ne lit un en-tête
// qu'au moment où la liste des fichiers est filtrée ; il note les fichiers de code qu'il écarte.

import { closeSync, openSync, readSync } from 'node:fs'
import { extname, join } from 'node:path'

const DIRS = new Set(['__generated__', 'generated', '.nuxt', '.next', '.output', '.svelte-kit'])
const HEAD = 600
// Une marque compte en tête de ligne de commentaire seulement (un commentaire qui PARLE de code généré n'en est pas).
const COMMENT = String.raw`^\s*(?:\/\/+|\/\*+|\*|#+|<!--)\s*`
const MARKS = [
  new RegExp(COMMENT + String.raw`(@generated\b)`),
  new RegExp(COMMENT + String.raw`((?:this file (?:was|is|has been) )?(?:auto-?|automatically )generated\b)`, 'i'),
  new RegExp(COMMENT + String.raw`(code generated\b.*\bdo not edit\b)`, 'i'),
  new RegExp(COMMENT + String.raw`(do not edit\b)`, 'i'),
]

/**
 * Un testeur `{ test(rel) }` pour `cfg.excludeRes`, et la liste (remplie au fil des tests) de ce qu'il a écarté.
 * @param {string} root
 * @param {Set<string>} extensions extensions de code (seuls ces fichiers ont leur en-tête lu)
 */
export function generatedFilter(root, extensions) {
  const found = []
  const cache = new Map()
  const judge = (rel) => {
    const dir = rel.split('/').slice(0, -1).find((s) => DIRS.has(s))
    if (dir) return { origine: 'inféré', confiance: 0.7, indice: `dossier ${dir}/` }
    if (/\.min\.[cm]?js$/.test(rel)) return { origine: 'inféré', confiance: 0.7, indice: 'fichier minifié' }
    if (!extensions.has(extname(rel))) return null
    const mark = headerMark(join(root, rel))
    return mark ? { origine: 'observé', confiance: 0.9, indice: `en-tête : « ${mark} »` } : null
  }
  const filter = {
    test(rel) {
      if (!cache.has(rel)) {
        const j = judge(rel)
        cache.set(rel, !!j)
        if (j && extensions.has(extname(rel))) found.push({ path: rel, origine: j.origine, confiance: j.confiance, indices: [j.indice] })
      }
      return cache.get(rel)
    },
    toString: () => '(code généré)',
  }
  return { filter, found }
}

/** La marque de génération trouvée dans les premiers caractères d'un fichier, ou null. */
function headerMark(abs) {
  let text
  try {
    const fd = openSync(abs, 'r')
    try {
      const buf = Buffer.alloc(HEAD)
      text = buf.toString('utf8', 0, readSync(fd, buf, 0, HEAD, 0))
    } finally { closeSync(fd) }
  } catch { return null }
  return markIn(text)
}

/** La marque de génération d'un en-tête (texte), en tête d'une ligne de commentaire ; null sinon. */
export function markIn(text) {
  for (const line of text.split(/\r?\n/)) {
    for (const re of MARKS) {
      const m = line.match(re)
      if (m) return m[1]
    }
  }
  return null
}
