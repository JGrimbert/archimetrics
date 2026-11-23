// LES WORKSPACES : `workspaces` du `package.json` racine (liste, ou `{ packages: [...] }`) et `pnpm-workspace.yaml`.
// Motifs suivis : `*` vaut un segment, `**` un nombre quelconque de segments, `!motif` exclut. Un workspace est un dossier
// qui a son `package.json` ; son nom de paquet sert à résoudre les imports (`@moi/commun/x` → `packages/commun/x`).

import { dirName, joinRel, readJsonc, readText } from './scan.mjs'

/**
 * @param {string} root
 * @param {string[]} hintFiles fichiers-indices (voir `scanHints`)
 * @returns {{ name: string, path: string, origine: string, confiance: number, indices: string[] }[]}
 */
export function discoverWorkspaces(root, hintFiles) {
  const { patterns, source } = workspacePatterns(root, hintFiles)
  if (!patterns.length) return []
  const pkgDirs = hintFiles.filter((f) => f.endsWith('package.json') && f !== 'package.json').map(dirName)
  const keep = patterns.filter((p) => !p.startsWith('!')).map((p) => ({ p, re: globRe(p) }))
  const drop = patterns.filter((p) => p.startsWith('!')).map((p) => globRe(p.slice(1)))
  const out = []
  for (const dir of pkgDirs) {
    const hit = keep.find((k) => k.re.test(dir))
    if (!hit || drop.some((re) => re.test(dir))) continue
    const name = readJsonc(root, `${dir}/package.json`)?.name
    if (typeof name !== 'string') continue
    const exact = !/[*?]/.test(hit.p)
    out.push({ name, path: dir, origine: 'observé', confiance: exact ? 1 : 0.9, indices: [`${source} : « ${hit.p} »`] })
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : 1))
}

function workspacePatterns(root, hintFiles) {
  const pkg = readJsonc(root, 'package.json')
  const ws = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages
  if (Array.isArray(ws) && ws.length) return { patterns: ws.map(cleanPattern).filter(Boolean), source: 'package.json workspaces' }
  if (hintFiles.includes('pnpm-workspace.yaml')) return { patterns: pnpmPatterns(readText(root, 'pnpm-workspace.yaml') ?? ''), source: 'pnpm-workspace.yaml' }
  return { patterns: [], source: null }
}

const cleanPattern = (p) => {
  if (typeof p !== 'string') return null
  const neg = p.startsWith('!')
  const body = joinRel(neg ? p.slice(1) : p)
  return body ? (neg ? '!' : '') + body : null
}

/** Les motifs de `packages:` d'un `pnpm-workspace.yaml` (lecture ligne à ligne : `- 'motif'`). */
export function pnpmPatterns(text) {
  const out = []
  let inPackages = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) inPackages = /^packages\s*:/.test(line)
    const m = inPackages && line.match(/^\s+-\s*['"]?([^'"#]+?)['"]?\s*(#.*)?$/)
    if (m) out.push(cleanPattern(m[1]))
  }
  return out.filter(Boolean)
}

/** Un motif de workspace en expression régulière sur un chemin de dossier. */
export function globRe(pattern) {
  const re = pattern
    .split('**')
    .map((part) => part.split('*').map(escapeRe).join('[^/]*'))
    .join('\u0000')
    .replace(/\/\u0000$/, '(?:/[^/]+)*')
    .replace(/\u0000\//g, '(?:[^/]+/)*')
    .replace(/\u0000/g, '.*')
  return new RegExp('^' + re + '$')
}

const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
