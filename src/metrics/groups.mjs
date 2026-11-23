// LES GROUPES : le premier découpage du projet (front, back, paquet commun, service…), pour le couplage et les diagrammes.
// Configurés (`groups: [{ name, path }]` ; origine « déclaré »), sinon les workspaces npm (« observé », lus dans le
// `package.json`), puis les dossiers de premier niveau qui portent du code source (« inféré » ; un dossier qui ne porte que
// des tests, comme `test/`, n'est pas un groupe). Chaque groupe porte `origine`, `confiance` et `indices`.

import { detectWorkspaces } from '../config.mjs'

const cleanPath = (p) => p.replace(/\\/g, '/').replace(/^\.\/?/, '').replace(/\/$/, '')

function declaredGroups(cfg) {
  const indices = [cfg.configPath ? 'archimetrics.config.json : groups' : 'configuration : groups']
  return cfg.groups.map((g) => ({ name: g.name ?? g.path, path: cleanPath(g.path), origine: 'déclaré', confiance: 1, indices }))
}

function inferredGroups(cfg, files) {
  const ws = cfg.discovery?.workspaces ?? Object.entries(detectWorkspaces(cfg.root)).map(([name, path]) => ({ name, path, origine: 'observé', confiance: 1, indices: ['package.json workspaces'] }))
  const groups = ws.map((w) => ({ name: w.path.split('/').pop(), path: w.path, origine: w.origine, confiance: w.confiance, indices: [...w.indices, `paquet ${w.name}`] }))
  const tops = new Map()
  for (const f of files) if (!f.test && f.rel.includes('/')) tops.set(f.rel.split('/')[0], (tops.get(f.rel.split('/')[0]) ?? 0) + 1)
  for (const [t, n] of [...tops].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (groups.some((g) => g.path === t || g.path.startsWith(t + '/'))) continue
    groups.push({ name: t, path: t, origine: 'inféré', confiance: 0.6, indices: [`dossier de premier niveau (${n} fichier${n > 1 ? 's' : ''} source)`] })
  }
  return groups
}

export function resolveGroups(cfg, files) {
  const groups = cfg.groups.length ? declaredGroups(cfg) : inferredGroups(cfg, files)
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
