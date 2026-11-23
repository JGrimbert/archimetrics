// LES POINTS D'ENTRÉE (un fichier sans importeur qui en est un n'est pas orphelin), rendus en expressions régulières :
// - `package.json` (racine et paquets) : `bin`, `main`, `module`, `exports`, et les fichiers lancés par `scripts`
//   (`node x.mjs`, `tsx x.ts`, `python x.py`…) ; observé, confiance 0,9 (0,6 quand une sortie `dist/x.js` est ramenée à
//   sa source `src/x.ts`) ;
// - `index.html` : `<script src>` ; observé, confiance 0,9 ;
// - routes de frameworks, par convention, quand le framework est une dépendance du paquet : pages et serveur de Nuxt,
//   `app/` et `pages/` de Next, `src/routes/` de SvelteKit ; `.storybook/` ; inféré, confiance 0,6.

import { dirName, joinRel, readJsonc, readText } from './scan.mjs'

const CODE = /\.(m|c)?[jt]sx?$|\.vue$|\.py$/
const RUNNERS = /(?:^|[\s;&|(])(?:node|tsx|ts-node|bun|deno run|python3?|py(?: -3)?|vite-node)\s+(?:--?[\w-]+(?:=\S+)?\s+)*([\w./@-]+\.(?:m|c)?[jt]sx?|[\w./@-]+\.py)\b/g

const FRAMEWORKS = [
  { dep: 'nuxt', dirs: ['pages', 'layouts', 'middleware', 'plugins', 'server', 'app'] },
  { dep: 'next', dirs: ['app', 'pages', 'src/app', 'src/pages'] },
  { dep: '@sveltejs/kit', dirs: ['src/routes'] },
]

const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
const exact = (path) => `^${escapeRe(path)}$`
const under = (dir) => `^${escapeRe(dir ? dir + '/' : '')}`

/**
 * @param {string} root
 * @param {string[]} hintFiles
 * @param {string[]} hintDirs
 * @returns {{ pattern: string, origine: string, confiance: number, indices: string[] }[]}
 */
export function discoverEntries(root, hintFiles, hintDirs) {
  const out = new Map()
  const add = (pattern, origine, confiance, indice) => {
    const prev = out.get(pattern)
    if (prev) prev.indices.push(indice)
    else out.set(pattern, { pattern, origine, confiance, indices: [indice] })
  }
  for (const f of hintFiles) {
    const name = f.split('/').pop()
    if (name === 'package.json') packageEntries(root, f, hintDirs, add)
    else if (name === 'index.html') for (const p of htmlScripts(readText(root, f) ?? '', dirName(f))) add(exact(p), 'observé', 0.9, `${f} : <script src>`)
  }
  for (const d of hintDirs) if (d.split('/').pop() === '.storybook') add(under(d), 'inféré', 0.6, `${d}/ (Storybook)`)
  return [...out.values()].sort((a, b) => (a.pattern < b.pattern ? -1 : 1))
}

function packageEntries(root, file, hintDirs, add) {
  const pkg = readJsonc(root, file)
  if (!pkg) return
  const dir = dirName(file)
  for (const { path, field } of manifestTargets(pkg)) manifestEntry(file, dir, path, field, add)
  for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
    for (const path of scriptFiles(String(cmd)).map((p) => joinRel(dir, p)).filter(Boolean)) add(exact(path), 'observé', 0.9, `${file} : scripts.${name}`)
  }
  frameworkEntries(pkg, file, dir, hintDirs, add)
}

function manifestEntry(file, dir, path, field, add) {
  const src = sourceOf(joinRel(dir, path))
  if (!src) return
  if (src.mapped) add(`^${escapeRe(src.path)}\\.[cm]?[jt]sx?$`, 'observé', 0.6, `${file} : ${field} (${path} ramené à sa source)`)
  else add(exact(src.path), 'observé', 0.9, `${file} : ${field}`)
}

function frameworkEntries(pkg, file, dir, hintDirs, add) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const fw of FRAMEWORKS.filter((f) => f.dep in deps)) {
    for (const d of fw.dirs.map((x) => joinRel(dir, x)).filter((x) => hintDirs.includes(x))) add(under(d), 'inféré', 0.6, `${file} : dépendance ${fw.dep}, convention ${d}/`)
  }
}

/** Les chemins de `bin`, `main`, `module` et `exports` (toutes conditions) d'un manifeste. */
export function manifestTargets(pkg) {
  const out = []
  const push = (v, field) => { if (typeof v === 'string' && !v.includes('*')) out.push({ path: v, field }) }
  if (typeof pkg.bin === 'string') push(pkg.bin, 'bin')
  else for (const [k, v] of Object.entries(pkg.bin ?? {})) push(v, `bin.${k}`)
  push(pkg.main, 'main')
  push(pkg.module, 'module')
  const walk = (v, field) => {
    if (typeof v === 'string') push(v, field)
    else if (v && typeof v === 'object') for (const [k, sub] of Object.entries(v)) walk(sub, `${field}[${k}]`)
  }
  walk(pkg.exports, 'exports')
  return out
}

/**
 * Le fichier source d'une cible de manifeste : elle-même si c'est du code, sinon une sortie de build (`dist/`, `build/`,
 * `lib/`, `out/`) ramenée à `src/`, sans extension (JS ou TS). Rend `{ path, mapped }` ou null (le fichier n'est pas
 * vérifié ici : une expression qui ne répond à aucun fichier est sans effet).
 */
export function sourceOf(path) {
  if (!path || !CODE.test(path) || path.endsWith('.d.ts')) return null
  const m = path.match(/^(.*?)(?:^|\/)(?:dist|build|lib|out)\/(.*)\.(m|c)?js$/)
  if (!m) return { path, mapped: false }
  return { path: `${m[1] ? m[1] + '/' : ''}src/${m[2]}`, mapped: true }
}

/** Les fichiers de code lancés par une commande de `scripts`. */
export function scriptFiles(cmd) {
  return [...cmd.matchAll(RUNNERS)].map((m) => m[1]).filter((p) => !p.includes('node_modules'))
}

/** Les `src` locaux des `<script>` d'une page HTML, relatifs à la racine du projet analysé. */
export function htmlScripts(html, dir) {
  const out = []
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const src = m[1]
    if (/^(https?:)?\/\//.test(src) || !CODE.test(src)) continue
    const p = joinRel(dir, src.replace(/^\//, ''))
    if (p) out.push(p)
  }
  return out
}
