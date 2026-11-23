// LE REPÉRAGE DES FICHIERS-INDICES : un parcours borné du disque (profondeur `MAX_DEPTH`, dossiers exclus et dossiers
// cachés sautés, liens jamais suivis) qui ne retient que les fichiers dont la découverte tire des indices : manifestes
// (`package.json`, `pyproject.toml`…), configurations d'outils (`tsconfig*.json`, `vite.config.*`), `__init__.py`,
// `index.html`. Indépendant de Git : il sert aussi aux révisions extraites dans un dossier temporaire.

import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_DEPTH = 5
const WANTED = /^(package\.json|pnpm-workspace\.yaml|tsconfig(\.[\w-]+)?\.json|jsconfig\.json|vite\.config\.[cm]?[jt]s|pyproject\.toml|setup\.cfg|setup\.py|__init__\.py|index\.html|nuxt\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|svelte\.config\.[cm]?js)$/
// Dossiers cachés qui portent des indices.
const DOT_KEPT = new Set(['.storybook'])

/**
 * Les fichiers-indices sous `root` : chemins relatifs en barres obliques, triés ; plus les dossiers rencontrés.
 * @param {string} root
 * @param {(name: string) => boolean} skip nom de dossier à ne pas parcourir
 * @returns {{ files: string[], dirs: string[] }}
 */
export function scanHints(root, skip) {
  const files = []
  const dirs = []
  const visit = (abs, rel, depth) => {
    let ents
    try { ents = readdirSync(abs, { withFileTypes: true }) } catch { return }
    for (const ent of ents) {
      const r = rel ? `${rel}/${ent.name}` : ent.name
      if (ent.isFile() && WANTED.test(ent.name)) files.push(r)
      else if (ent.isDirectory() && depth < MAX_DEPTH && !skipDir(ent.name, skip) && !isLink(join(abs, ent.name))) {
        dirs.push(r)
        visit(join(abs, ent.name), r, depth + 1)
      }
    }
  }
  visit(root, '', 0)
  return { files: files.sort(), dirs: dirs.sort() }
}

function skipDir(name, skip) {
  return skip(name) || (name.startsWith('.') && !DOT_KEPT.has(name))
}

// Une jonction Windows se lit comme un dossier : lstat la démasque.
function isLink(abs) {
  try { return lstatSync(abs).isSymbolicLink() } catch { return true }
}

/** Le texte d'un fichier, ou null. */
export function readText(root, rel) {
  try { return readFileSync(join(root, rel), 'utf8') } catch { return null }
}

/** Un JSON, commentaires et virgules finales tolérés (tsconfig, jsconfig) ; null s'il est illisible. */
export function readJsonc(root, rel) {
  const text = readText(root, rel)
  if (text === null) return null
  try { return JSON.parse(text) } catch { /* JSONC : on retire commentaires et virgules finales */ }
  try { return JSON.parse(stripJsonComments(text)) } catch { return null }
}

/** Retire les commentaires `//` et `/* *\/` hors des chaînes, et les virgules qui précèdent `}` ou `]`. */
export function stripJsonComments(text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      const end = stringEnd(text, i)
      out += text.slice(i, end)
      i = end
    } else if (c === '/' && text[i + 1] === '/') i = lineEnd(text, i)
    else if (c === '/' && text[i + 1] === '*') i = text.indexOf('*/', i + 2) < 0 ? text.length : text.indexOf('*/', i + 2) + 2
    else { out += c; i++ }
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

function stringEnd(text, start) {
  let i = start + 1
  while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1
  return i + 1
}

function lineEnd(text, start) {
  const n = text.indexOf('\n', start)
  return n < 0 ? text.length : n
}

/** Le dossier d'un chemin relatif (`''` à la racine). */
export const dirName = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')

/** Joint et normalise des segments relatifs (`a/./b/../c` → `a/c`) ; `null` si le chemin sort de la racine. */
export function joinRel(...parts) {
  const out = []
  for (const s of parts.join('/').replace(/\\/g, '/').split('/')) {
    if (s === '' || s === '.') continue
    if (s === '..') { if (!out.length) return null; out.pop() } else out.push(s)
  }
  return out.join('/')
}
