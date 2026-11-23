// L'ORGANISATION : fichiers de code par dossier, fichiers de doc de dossier (`docName`, par défaut CLAUDE.md) — longueur,
// présence exigée à partir d'un nombre de fichiers, chemins cités qui n'existent plus.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dirOf } from '../files.mjs'

const CITED_EXT = /\.(md|js|mjs|cjs|ts|tsx|vue|py|json|ya?ml|prisma|css|scss|html|sh|ps1|toml|txt|sql)$/i

// Les chemins cités : entre accents graves, ou cible d'un lien Markdown. Filtrés pour ne garder que ce qui a l'air d'un chemin.
export function citedPaths(text) {
  const out = new Set()
  const add = (raw) => {
    let s = raw.trim().replace(/^\.\//, '')
    s = s.replace(/#.*$/, '').replace(/:\d+(-\d+)?$/, '').replace(/[),.;]+$/, '')
    if (!s || s.length > 200 || /^\.[a-z0-9]+$/i.test(s) || s.includes('…')) return
    if (/[\s*<>{}$|?'"`=,()]/.test(s) || /^[a-z]+:/i.test(s) || s.startsWith('/') || s.startsWith('@') || s.startsWith('~')) return
    if (!(s.includes('/') || CITED_EXT.test(s))) return
    if (s.includes('/') && !CITED_EXT.test(s) && !s.endsWith('/')) return
    out.add(s)
  }
  for (const m of text.matchAll(/`([^`\n]+)`/g)) add(m[1])
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) add(m[1])
  return [...out]
}

const normPath = (p) => {
  const out = []
  for (const s of p.split('/')) {
    if (!s || s === '.') continue
    if (s === '..') { if (!out.length) return null; out.pop() } else out.push(s)
  }
  return out.join('/')
}

export function organisationMetrics(cfg, codeFiles, allFiles) {
  const L = cfg.limits
  const perDir = new Map()
  for (const f of codeFiles) {
    if (f.test) continue
    const d = dirOf(f.rel)
    perDir.set(d, (perDir.get(d) ?? 0) + 1)
  }
  const known = new Set(allFiles)
  const dirs = new Set()
  for (const f of allFiles) for (let d = dirOf(f); d !== '.'; d = dirOf(d)) { if (dirs.has(d)) break; dirs.add(d) }
  const suffixIndex = (s) => {
    const t = s.replace(/^(\.\.\/)+/, '').replace(/\/$/, '')
    if (known.has(t) || dirs.has(t)) return true
    for (const f of known) if (f.endsWith('/' + t)) return true
    for (const d of dirs) if (d.endsWith('/' + t)) return true
    return false
  }

  const violations = { filesPerDir: [], docMaxLines: [], docRequired: [], docLinks: [] }
  if (L.filesPerDir) for (const [d, n] of perDir) if (n > L.filesPerDir) violations.filesPerDir.push({ key: d, value: n, limit: L.filesPerDir })

  const docs = cfg.docName ? allFiles.filter((f) => f.split('/').pop() === cfg.docName) : []
  const docDirs = new Set(docs.map(dirOf))
  const docStats = []
  for (const doc of docs) {
    const text = readFileSync(join(cfg.root, doc), 'utf8')
    const lines = text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0)
    docStats.push({ file: doc, lines })
    if (L.docMaxLines && lines > L.docMaxLines) violations.docMaxLines.push({ key: doc, value: lines, limit: L.docMaxLines })
    if (L.docLinks) {
      const base = dirOf(doc)
      const ignore = (cfg.docLinksIgnore ?? []).map((s) => new RegExp(s))
      for (const c of citedPaths(text)) {
        if (ignore.some((re) => re.test(c))) continue
        const ancestors = []
        for (let d = base; ; d = dirOf(d)) { ancestors.push(d === '.' ? '' : d); if (d === '.') break }
        const ok = ancestors.some((a) => {
          const p = normPath((a ? a + '/' : '') + c)
          return p != null && (known.has(p) || dirs.has(p.replace(/\/$/, '')) || existsSync(join(cfg.root, p)))
        }) || suffixIndex(c)
        if (!ok) violations.docLinks.push({ key: `${doc} → ${c}` })
      }
    }
  }
  if (L.docRequiredFrom) for (const [d, n] of perDir) if (n >= L.docRequiredFrom && !docDirs.has(d)) violations.docRequired.push({ key: d, value: n, limit: L.docRequiredFrom })
  for (const k of Object.keys(violations)) violations[k].sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.key.localeCompare(b.key))

  const counts = [...perDir.values()]
  return {
    dirs: perDir.size,
    maxFilesPerDir: counts.length ? Math.max(...counts) : 0,
    crowded: [...perDir].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([dir, n]) => ({ dir, files: n })),
    docs: { count: docs.length, totalLines: docStats.reduce((s, d) => s + d.lines, 0), longest: docStats.sort((a, b) => b.lines - a.lines).slice(0, 10) },
    violations,
  }
}
