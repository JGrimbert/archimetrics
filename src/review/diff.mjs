// LE DIFF UNIFIÉ d'une revue (AM-4) : découpé par fichier (`diff --git a/… b/…`), puis par bloc (`@@ -a,b +c,d @@`), avec le
// numéro de chaque ligne (ancien côté pour « - », nouveau côté pour « + » et le contexte). La SEGMENTATION regroupe les
// blocs d'un fichier en segments d'au plus `maxChars` caractères (un bloc plus long est coupé en morceaux) : une passe LLM
// lit un segment, jamais tout un diff.

/**
 * @typedef {{ kind: '+' | '-' | ' ', text: string, oldLine: number | null, newLine: number | null, at?: number }} DiffLine
 * @typedef {{ header: string, lines: DiffLine[] }} Hunk
 * @typedef {{ path: string, oldPath: string, header: string[], binary: boolean, hunks: Hunk[] }} FileDiff
 * @typedef {{ path: string, index: number, of: number, hunks: Hunk[], text: string }} Segment
 */

const FILE_RE = /^diff --git a\/(.+?) b\/(.+)$/
const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

function newFile(m) {
  return { path: m[2], oldPath: m[1], header: [], binary: false, hunks: [] }
}

/** Ajoute une ligne de bloc à `hunk`, avec ses numéros ; rend vrai si c'en était une. */
function pushLine(hunk, line, pos) {
  const kind = line[0]
  if (kind !== '+' && kind !== '-' && kind !== ' ') return false
  const text = line.slice(1)
  // Une ligne retirée est située, côté nouveau fichier, là où elle manque (`at`) : le « fichier:ligne » d'un constat.
  if (kind === '-') hunk.lines.push({ kind, text, oldLine: pos.old++, newLine: null, at: pos.new })
  else if (kind === '+') hunk.lines.push({ kind, text, oldLine: null, newLine: pos.new++ })
  else hunk.lines.push({ kind, text, oldLine: pos.old++, newLine: pos.new++ })
  return true
}

/**
 * Lit un diff unifié (sortie de `git diff`) ; fins de ligne LF ou CRLF.
 * @param {string} text
 * @returns {FileDiff[]}
 */
export function parseDiff(text) {
  const files = []
  let file = null
  let hunk = null
  const pos = { old: 0, new: 0 }
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const fm = line.match(FILE_RE)
    if (fm) {
      file = newFile(fm)
      files.push(file)
      hunk = null
      continue
    }
    if (!file) continue
    const hm = line.match(HUNK_RE)
    if (hm) {
      hunk = { header: line, lines: [] }
      file.hunks.push(hunk)
      pos.old = Number(hm[1])
      pos.new = Number(hm[2])
      continue
    }
    if (hunk && pushLine(hunk, line, pos)) continue
    if (line.startsWith('Binary files ') || line === 'GIT binary patch') file.binary = true
    if (!hunk) file.header.push(line)
  }
  return files
}

/** Le texte d'un bloc, tel qu'un diff unifié l'écrit. */
export const hunkText = (h) => [h.header, ...h.lines.map((l) => l.kind + l.text)].join('\n')

/** Le texte d'un fichier du diff (en-têtes compris), pour une passe ou pour l'empreinte. */
export function fileText(f, hunks = f.hunks) {
  return [`diff --git a/${f.oldPath} b/${f.path}`, ...f.header, ...hunks.map(hunkText)].join('\n') + '\n'
}

/** Coupe un bloc trop long en morceaux d'au plus `maxChars`, chacun avec l'en-tête du bloc. */
function splitHunk(h, maxChars) {
  const parts = []
  let cur = { header: h.header, lines: [] }
  let size = h.header.length
  for (const l of h.lines) {
    if (size + l.text.length + 2 > maxChars && cur.lines.length) {
      parts.push(cur)
      cur = { header: `${h.header} (suite)`, lines: [] }
      size = cur.header.length
    }
    cur.lines.push(l)
    size += l.text.length + 2
  }
  if (cur.lines.length) parts.push(cur)
  return parts
}

/**
 * Les segments d'un fichier : ses blocs regroupés, au plus `maxChars` caractères chacun.
 * @param {FileDiff} f
 * @param {{ maxChars?: number }} [o]
 * @returns {Segment[]}
 */
export function segmentFile(f, { maxChars = 6000 } = {}) {
  const groups = []
  let cur = []
  let size = 0
  for (const h of f.hunks.flatMap((x) => (hunkText(x).length > maxChars ? splitHunk(x, maxChars) : [x]))) {
    const n = hunkText(h).length
    if (cur.length && size + n > maxChars) {
      groups.push(cur)
      cur = []
      size = 0
    }
    cur.push(h)
    size += n
  }
  if (cur.length) groups.push(cur)
  return groups.map((hunks, i) => ({ path: f.path, index: i + 1, of: groups.length, hunks, text: fileText(f, hunks) }))
}

/** Les lignes changées (« + » et « - ») d'un ensemble de blocs. */
export const changedLines = (hunks) => hunks.flatMap((h) => h.lines.filter((l) => l.kind !== ' '))
