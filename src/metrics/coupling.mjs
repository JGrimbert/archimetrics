// COUPLAGE ET COHÉSION :
// - par dossier (le « module ») : Ca (modules qui dépendent de lui), Ce (modules dont il dépend), instabilité I = Ce / (Ca + Ce)
//   (Robert C. Martin), cohésion = part de ses imports qui restent dans le dossier ;
// - par fichier : importeurs (fan-in), imports internes (fan-out), paquets externes ;
// - entre groupes : la matrice des imports ;
// - cycles d'imports (Tarjan, hors imports de type seul et dynamiques) ;
// - classes : LCOM4 (Hitz & Montazeri) et injections du constructeur ; modules Nest ;
// - exports jamais importés et fichiers sans importeur (indicatifs : une entrée, un import dynamique calculé y échappent).
// Les fichiers de test n'entrent pas dans le couplage (ils importent tout), mais leurs imports comptent pour les exports morts.

import { cycles } from '../graph.mjs'
import { dirOf } from '../files.mjs'

const ENTRY = [/(^|\/)(main|index|app|server|cli)\.[a-z]+$/, /\.config\.[a-z]+$/, /(^|\/)bin\//, /(^|\/)__main__\.py$/, /(^|\/)__init__\.py$/, /\.d\.ts$/]

export function couplingMetrics(cfg, files, graph, groupOf) {
  const src = new Map(files.filter((f) => !f.test).map((f) => [f.rel, f]))
  const srcEdges = graph.edges.filter((e) => src.has(e.from) && src.has(e.to))

  // Par fichier.
  const fanIn = new Map()
  const fanOut = new Map()
  for (const e of srcEdges) {
    if (!fanIn.has(e.to)) fanIn.set(e.to, new Set())
    fanIn.get(e.to).add(e.from)
    if (!fanOut.has(e.from)) fanOut.set(e.from, new Set())
    fanOut.get(e.from).add(e.to)
  }
  const top = (m, n = 15) => [...m].map(([file, s]) => ({ file, n: s.size })).sort((a, b) => b.n - a.n).slice(0, n)

  // Par dossier.
  const mods = new Map()
  const mod = (d) => {
    if (!mods.has(d)) mods.set(d, { dir: d, files: 0, ca: new Set(), ce: new Set(), internal: 0, outgoing: 0, incoming: 0 })
    return mods.get(d)
  }
  for (const f of src.values()) mod(dirOf(f.rel)).files++
  for (const e of srcEdges) {
    const a = dirOf(e.from)
    const b = dirOf(e.to)
    if (a === b) mod(a).internal++
    else {
      mod(a).outgoing++
      mod(a).ce.add(b)
      mod(b).incoming++
      mod(b).ca.add(a)
    }
  }
  const modules = [...mods.values()].map((m) => {
    const ca = m.ca.size
    const ce = m.ce.size
    const total = m.internal + m.outgoing
    return { dir: m.dir, group: groupOf(m.dir + '/x'), files: m.files, ca, ce, instability: ca + ce ? Math.round((ce / (ca + ce)) * 100) / 100 : 0, cohesion: total ? Math.round((m.internal / total) * 100) / 100 : null }
  })

  // Entre groupes.
  const matrix = {}
  for (const e of srcEdges) {
    const a = groupOf(e.from)
    const b = groupOf(e.to)
    if (a === b) continue
    matrix[a] ??= {}
    matrix[a][b] = (matrix[a][b] ?? 0) + 1
  }

  // Cycles.
  const cyc = cycles([...src.keys()], srcEdges)

  // Exports morts et fichiers sans importeur (imports des tests compris).
  const used = new Map()
  const importedAtAll = new Set()
  for (const e of graph.edges) {
    importedAtAll.add(e.to)
    if (!used.has(e.to)) used.set(e.to, new Set())
    for (const n of e.names.length ? e.names : ['*side']) used.get(e.to).add(n)
  }
  const deadExports = []
  for (const f of src.values()) {
    const u = used.get(f.rel)
    if (!u || u.has('*')) continue
    for (const ex of f.exports) {
      if (ex === '*' || (ex === 'default' && f.lang === 'vue')) continue
      if (!u.has(ex)) deadExports.push({ file: f.rel, name: ex })
    }
  }
  const orphans = [...src.keys()].filter((r) => !importedAtAll.has(r) && !ENTRY.some((re) => re.test(r)) && !(cfg.entries ?? []).some((s) => new RegExp(s).test(r)))

  // Classes.
  const classes = []
  for (const f of src.values()) for (const c of f.classes) classes.push({ file: f.rel, ...c })
  const L = cfg.limits
  const violations = { cycles: [], lcom: [] }
  if (L.cycles) for (const c of cyc) violations.cycles.push({ key: c.join(' ↔ '), value: c.length })
  if (L.lcom) for (const c of classes) if (c.methods.length >= 3 && c.lcom4 > L.lcom) violations.lcom.push({ key: `${c.file}#${c.name}`, value: c.lcom4, limit: L.lcom })

  const external = new Map()
  for (const [file, set] of graph.external) {
    if (!src.has(file)) continue
    for (const p of set) {
      if (!external.has(p)) external.set(p, new Set())
      external.get(p).add(file)
    }
  }

  return {
    edges: srcEdges.length,
    unresolved: graph.unresolved.filter((u) => src.has(u.from)).slice(0, 50),
    fanIn: top(fanIn),
    fanOut: top(fanOut),
    modules: modules.sort((a, b) => b.ca + b.ce - (a.ca + a.ce)),
    matrix,
    cycles: cyc,
    deadExports,
    orphans,
    classes: {
      count: classes.length,
      lowCohesion: classes.filter((c) => c.methods.length >= 3 && c.lcom4 > 1).sort((a, b) => b.lcom4 - a.lcom4).slice(0, 20).map((c) => ({ file: c.file, name: c.name, lcom4: c.lcom4, methods: c.methods.length })),
      mostInjected: classes.filter((c) => c.injections.length).sort((a, b) => b.injections.length - a.injections.length).slice(0, 10).map((c) => ({ file: c.file, name: c.name, injections: c.injections.length })),
    },
    external: [...external].map(([name, s]) => ({ name, files: s.size })).sort((a, b) => b.files - a.files),
    violations,
  }
}
