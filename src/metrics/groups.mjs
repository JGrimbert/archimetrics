// LES GROUPES : le premier découpage du projet (front, back, paquet commun, service…), pour le couplage et les diagrammes.
// Configurés (`groups: [{ name, path }]`), sinon les workspaces npm, puis les dossiers de premier niveau qui portent du code.

import { workspaceDirs } from '../config.mjs'

export function resolveGroups(cfg, files) {
  let groups = cfg.groups.map((g) => ({ name: g.name ?? g.path, path: g.path.replace(/\\/g, '/').replace(/^\.\/?/, '').replace(/\/$/, '') }))
  if (!groups.length) {
    const ws = workspaceDirs(cfg.root)
    groups = ws.map((p) => ({ name: p.split('/').pop(), path: p }))
    const tops = new Set(files.filter((f) => f.rel.includes('/')).map((f) => f.rel.split('/')[0]))
    for (const t of [...tops].sort()) if (!groups.some((g) => g.path === t || g.path.startsWith(t + '/'))) groups.push({ name: t, path: t })
  }
  const sorted = [...groups].sort((a, b) => b.path.length - a.path.length)
  const groupOf = (rel) => sorted.find((g) => g.path === '' || rel === g.path || rel.startsWith(g.path + '/'))?.name ?? '(racine)'
  return { groups, groupOf }
}

// Un dossier qui n'est qu'une enveloppe (`frontend/` ≈ `frontend/src/`) : on descend dans le sous-dossier qui tient au moins
// 90 % des fichiers (tests exclus), tant qu'il y en a un.
export function effectiveRoot(path, srcFiles) {
  const under = (rel, p) => p === '' || rel === p || rel.startsWith(p + '/')
  let p = path
  for (;;) {
    const inScope = srcFiles.filter((f) => under(f.rel, p))
    const counts = new Map()
    for (const f of inScope) {
      const inner = p ? f.rel.slice(p.length + 1) : f.rel
      if (inner.includes('/')) counts.set(inner.split('/')[0], (counts.get(inner.split('/')[0]) ?? 0) + 1)
    }
    const [best] = [...counts].sort((a, b) => b[1] - a[1])
    if (!best || best[1] < inScope.length * 0.9 || inScope.length < 2) return p
    p = (p ? p + '/' : '') + best[0]
  }
}

// Le chemin d'un fichier sous son groupe, coupé à `depth` dossiers : le « module » à cette profondeur.
export function moduleAt(rel, groupPath, depth) {
  const inner = groupPath ? rel.slice(groupPath.length + 1) : rel
  const parts = inner.split('/').slice(0, -1)
  return parts.slice(0, depth).join('/') || '(racine)'
}
