// LES FICHIERS LUS : ceux que Git suit ou n'ignore pas (`git ls-files -co --exclude-standard`), sinon un parcours du disque
// (liens symboliques et jonctions jamais suivis). Chemins relatifs en barres obliques, quel que soit le système.

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

export const toPosix = (p) => p.replace(/\\/g, '/')

const LANG = { '.vue': 'vue', '.py': 'py', '.ts': 'ts', '.mts': 'ts', '.cts': 'ts', '.tsx': 'ts' }
export const langOf = (ext) => LANG[ext] ?? 'js'

function gitFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
    return out.split('\0').filter(Boolean)
  } catch {
    return null
  }
}

function walkFiles(root, dir, out) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isSymbolicLink()) continue
    if (ent.isDirectory()) {
      // Une jonction Windows se lit comme un dossier : lstat la démasque.
      if (lstatSync(p).isSymbolicLink()) continue
      walkFiles(root, p, out)
    } else if (ent.isFile()) out.push(toPosix(relative(root, p)))
  }
  return out
}

export function isExcluded(rel, cfg) {
  const parts = rel.split('/')
  if (parts.some((s) => cfg.excludeNames.has(s))) return true
  return cfg.excludeRes.some((re) => re.test(rel))
}

export const isTest = (rel, cfg) => cfg.testRes.some((re) => re.test(rel))

// Tous les fichiers du projet (code ou non), filtrés par `include` / `exclude`.
export function listAll(cfg) {
  const all = gitFiles(cfg.root) ?? walkFiles(cfg.root, cfg.root, [])
  const roots = cfg.include.map((r) => toPosix(r).replace(/^\.\/?/, '').replace(/\/$/, ''))
  return all
    .map(toPosix)
    .filter((f) => roots.some((r) => r === '' || f === r || f.startsWith(r + '/')))
    .filter((f) => !isExcluded(f, cfg))
    .filter((f) => existsSync(join(cfg.root, f)))
}

// Les fichiers de code : { rel, abs, ext, lang, test }.
export function listCode(cfg, all = listAll(cfg)) {
  const exts = new Set(cfg.extensions)
  return all
    .filter((f) => exts.has(extname(f)) && !f.endsWith('.d.ts'))
    .map((rel) => {
      const ext = extname(rel)
      return { rel, abs: join(cfg.root, rel), ext, lang: langOf(ext), test: isTest(rel, cfg) }
    })
}

export const dirOf = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.')
