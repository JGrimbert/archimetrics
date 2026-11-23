// LES ALIAS D'IMPORTS :
// - `tsconfig*.json` / `jsconfig.json` : `compilerOptions.paths` (`"@/*": ["./src/*"]`), relatifs à `baseUrl` (ou au
//   fichier), en suivant `extends` relatif ; observé, confiance 0,9 ;
// - `vite.config.*` : `resolve.alias`, LU SANS ÊTRE EXÉCUTÉ. Seules les formes littérales sont reconnues : chaîne
//   (`'/src'`, `'./src'`), `fileURLToPath(new URL('./src', import.meta.url))`, `path.resolve(__dirname, 'src')` (ou
//   `resolve`, `join`), en objet (`{ '@': … }`) ou en liste (`[{ find: '@', replacement: … }]`) ; observé, confiance 0,7.
// Deux sources qui donnent le même alias vers des dossiers différents : on garde la plus sûre, l'autre devient un indice.

import { dirName, joinRel, readJsonc, readText } from './scan.mjs'

const MAX_EXTENDS = 4

/**
 * @param {string} root
 * @param {string[]} hintFiles
 * @returns {{ alias: string, path: string, origine: string, confiance: number, indices: string[] }[]}
 */
export function discoverAliases(root, hintFiles) {
  const found = []
  for (const f of hintFiles) {
    const base = f.split('/').pop()
    if (/^(tsconfig(\.[\w-]+)?|jsconfig)\.json$/.test(base)) found.push(...tsconfigAliases(root, f))
    else if (/^vite\.config\.[cm]?[jt]s$/.test(base)) found.push(...viteAliases(f, readText(root, f) ?? ''))
  }
  return mergeAliases(found)
}

function mergeAliases(found) {
  const byAlias = new Map()
  for (const a of found.sort((x, y) => y.confiance - x.confiance)) {
    const prev = byAlias.get(a.alias)
    if (!prev) byAlias.set(a.alias, { ...a, indices: [...a.indices] })
    else if (prev.path === a.path) prev.indices.push(...a.indices.filter((i) => !prev.indices.includes(i)))
    else {
      prev.indices.push(`en conflit : ${a.indices.join(', ')} → ${a.path} (écarté)`)
      prev.confiance = Math.min(prev.confiance, 0.5)
    }
  }
  return [...byAlias.values()].sort((a, b) => (a.alias < b.alias ? -1 : 1))
}

// --- tsconfig / jsconfig ---

/** `compilerOptions` fusionnées le long de la chaîne `extends` (relative seulement : un paquet npm n'est pas lu). */
function compilerOptions(root, file, depth = 0) {
  const json = readJsonc(root, file)
  if (!json) return null
  let parent = {}
  const ext = typeof json.extends === 'string' && json.extends.startsWith('.') ? joinRel(dirName(file), json.extends) : null
  if (ext && depth < MAX_EXTENDS) parent = compilerOptions(root, ext.endsWith('.json') ? ext : ext + '.json', depth + 1)?.options ?? {}
  const own = json.compilerOptions ?? {}
  // `baseUrl` et `paths` se lisent par rapport au fichier qui les déclare.
  const anchor = (o, from) => ({ ...o, ...(o.baseUrl !== undefined || o.paths ? { _dir: from } : {}) })
  const options = { ...anchor(parent, parent._dir), ...anchor(own, dirName(file)) }
  return { options }
}

export function tsconfigAliases(root, file) {
  const o = compilerOptions(root, file)?.options
  if (!o?.paths) return []
  const dir = o._dir ?? dirName(file)
  const base = joinRel(dir, o.baseUrl ?? '.') ?? dir
  const out = []
  for (const [key, targets] of Object.entries(o.paths)) {
    const target = Array.isArray(targets) ? targets[0] : null
    const alias = key.replace(/\/\*$/, '')
    if (typeof target !== 'string' || !alias || alias === '*') continue
    const path = joinRel(base, target.replace(/\/\*$/, '').replace(/\*$/, ''))
    if (path === null) continue
    out.push({ alias, path, origine: 'observé', confiance: 0.9, indices: [`${file} : compilerOptions.paths « ${key} »`] })
  }
  return out
}

// --- vite.config (lecture statique) ---

const STR = String.raw`(['"\x60])([^'"\x60]*)\1`
const VALUE_FORMS = [
  // fileURLToPath(new URL('./src', import.meta.url))
  new RegExp(String.raw`^fileURLToPath\(\s*new\s+URL\(\s*${STR}\s*,\s*import\.meta\.url\s*\)\s*\)`),
  // path.resolve(__dirname, 'src') · resolve(__dirname, './src') · path.join(__dirname, 'src')
  new RegExp(String.raw`^(?:path\.)?(?:resolve|join)\(\s*(?:__dirname|process\.cwd\(\))\s*,\s*${STR}\s*\)`),
  // 'src' · '/src' · './src'
  new RegExp(String.raw`^${STR}`),
]

/** Les alias littéraux d'un `vite.config` (texte), relatifs à la racine du projet analysé. */
export function viteAliases(file, text) {
  const body = aliasBlock(text)
  if (!body) return []
  const dir = dirName(file)
  const out = []
  for (const { key, expr } of aliasEntries(body)) {
    const target = literalTarget(expr)
    const path = target === null ? null : joinRel(dir, target.replace(/^\//, ''))
    if (!key || path === null) continue
    out.push({ alias: key.replace(/\/$/, ''), path, origine: 'observé', confiance: 0.7, indices: [`${file} : resolve.alias « ${key} » (lu sans exécuter)`] })
  }
  return out
}

function literalTarget(expr) {
  for (const re of VALUE_FORMS) {
    const m = expr.match(re)
    if (m) return m[2]
  }
  return null
}

/** Le texte entre les accolades (ou crochets) qui suivent `alias:`, ou null. */
function aliasBlock(text) {
  const m = /\balias\s*:\s*([{[])/.exec(text)
  if (!m) return null
  const open = m.index + m[0].length - 1
  const close = matching(text, open)
  return close < 0 ? null : text.slice(open + 1, close)
}

function matching(text, open) {
  const pairs = { '{': '}', '[': ']', '(': ')' }
  const stack = [pairs[text[open]]]
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') i = text.indexOf(c, i + 1)
    else if (c === '/' && text[i + 1] === '/') i = text.indexOf('\n', i)
    else if (c === '/' && text[i + 1] === '*') i = text.indexOf('*/', i)
    else if (pairs[c]) stack.push(pairs[c])
    else if (c === stack[stack.length - 1] && stack.pop() && !stack.length) return i
    if (i < 0) return -1
  }
  return -1
}

/** Les couples (clé, expression) d'un bloc d'alias, en objet (`'@': expr`) ou en liste (`{ find, replacement }`). */
export function aliasEntries(body) {
  const out = []
  const listItem = /\{\s*find\s*:\s*(['"])([^'"]+)\1\s*,\s*replacement\s*:\s*/g
  let m
  while ((m = listItem.exec(body))) out.push({ key: m[2], expr: body.slice(m.index + m[0].length) })
  if (out.length) return out
  const objItem = /(?:^|[,{\s])(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*:\s*/g
  while ((m = objItem.exec(body))) out.push({ key: m[2] ?? m[3], expr: body.slice(m.index + m[0].length) })
  return out
}
