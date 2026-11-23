// UN LECTEUR TAR MINIMAL, sans dépendance : de quoi extraire la sortie de `git archive --format=tar` (ustar + en-têtes pax
// de `git archive` : `g` global ignoré, `x` pour les chemins longs). Fichiers et dossiers seulement ; liens ignorés.
// Un chemin absolu ou qui remonte (`..`) est refusé : rien ne s'écrit hors du dossier cible.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

const BLOCK = 512

const text = (buf, start, len) => {
  const raw = buf.subarray(start, start + len)
  const end = raw.indexOf(0)
  return raw.subarray(0, end < 0 ? raw.length : end).toString('utf8')
}

// Les enregistrements pax : « <longueur> <clé>=<valeur>\n ».
function paxPath(body) {
  const m = body.toString('utf8').match(/(?:^|\n)\d+ path=([^\n]*)\n/)
  return m ? m[1] : null
}

function readHeader(buf, off) {
  const h = buf.subarray(off, off + BLOCK)
  if (h.length < BLOCK || h.every((b) => b === 0)) return null
  const size = parseInt(text(h, 124, 12).trim() || '0', 8)
  const prefix = text(h, 345, 155)
  const name = text(h, 0, 100)
  return { type: String.fromCharCode(h[156] || 48), size, name: prefix ? `${prefix}/${name}` : name }
}

function safeTarget(dir, name) {
  const target = resolve(dir, name)
  const rel = relative(dir, target)
  if (!rel || /^\.\.([\\/]|$)/.test(rel) || isAbsolute(rel)) throw new Error(`archive : chemin refusé « ${name} »`)
  return target
}

function writeEntry(dir, type, name, body) {
  if (type === '5') return mkdirSync(safeTarget(dir, name), { recursive: true })
  if (type !== '0' && type !== '7') return
  const target = safeTarget(dir, name)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, body)
}

/**
 * Extrait une archive tar (en mémoire) dans `dir` ; rend le nombre de fichiers écrits.
 * @param {Buffer} buf
 * @param {string} dir
 */
export function untar(buf, dir) {
  const root = resolve(dir)
  let off = 0
  let longName = null
  let count = 0
  for (let h = readHeader(buf, off); h; h = readHeader(buf, off)) {
    const body = buf.subarray(off + BLOCK, off + BLOCK + h.size)
    off += BLOCK + Math.ceil(h.size / BLOCK) * BLOCK
    if (h.type === 'x') longName = paxPath(body)
    if (h.type === 'x' || h.type === 'g') continue
    const name = longName ?? h.name
    longName = null
    writeEntry(root, h.type, name, body)
    if (h.type === '0' || h.type === '7') count++
  }
  return count
}
