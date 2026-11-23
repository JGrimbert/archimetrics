// LE GRAPHE DES DÉPENDANCES : chaque import résolu vers un fichier du projet (relatif, alias, paquet d'un workspace, paquet
// Python sous une `pythonRoots`), sinon compté comme dépendance externe (le nom du paquet).

import { dirOf } from './files.mjs'

const JS_EXTS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.vue', '.json']

const norm = (p) => {
  const out = []
  for (const s of p.split('/')) {
    if (s === '' || s === '.') continue
    if (s === '..') out.pop()
    else out.push(s)
  }
  return out.join('/')
}

function resolveJs(target, known) {
  if (known.has(target)) return target
  // TypeScript : `./x.js` désigne `./x.ts`.
  const m = target.match(/^(.*)\.(m|c)?js$/)
  if (m) for (const e of ['.ts', '.mts', '.cts', '.tsx']) if (known.has(m[1] + e)) return m[1] + e
  for (const e of JS_EXTS) if (known.has(target + e)) return target + e
  for (const e of JS_EXTS) if (known.has(target + '/index' + e)) return target + '/index' + e
  return null
}

export const externalName = (spec) => {
  if (spec.startsWith('node:')) return 'node:' + spec.slice(5).split('/')[0]
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

export function makeResolver(cfg, allFiles) {
  const known = new Set(allFiles)
  const aliases = Object.entries(cfg.aliases).sort((a, b) => b[0].length - a[0].length)
  const packages = Object.entries(cfg.packages).sort((a, b) => b[0].length - a[0].length)
  const pyRoots = cfg.pythonRoots.map((r) => norm(r))

  function resolvePy(from, imp) {
    const parts = imp.spec ? imp.spec.split('.') : []
    const tryMod = (base) => {
      const p = norm(base)
      if (known.has(p + '.py')) return p + '.py'
      if (known.has(p + '/__init__.py')) return p + '/__init__.py'
      return null
    }
    let bases
    if (imp.level > 0) {
      let d = dirOf(from)
      for (let i = 1; i < imp.level; i++) d = dirOf(d)
      bases = [d === '.' ? '' : d]
    } else bases = [...pyRoots, dirOf(from) === '.' ? '' : dirOf(from)]
    for (const b of bases) {
      const base = [b, ...parts].filter(Boolean).join('/')
      // `from paquet import module` : le nom importé peut être un sous-module.
      const out = []
      for (const n of imp.names) {
        if (n === '*') continue
        const sub = tryMod(base + '/' + n)
        if (sub) out.push(sub)
      }
      const mod = tryMod(base)
      if (out.length) return out
      if (mod) return [mod]
    }
    return null
  }

  return function resolve(from, imp, lang) {
    if (lang === 'py') {
      const r = resolvePy(from, imp)
      return r ? { files: r } : { external: imp.level > 0 ? null : imp.spec.split('.')[0] }
    }
    const spec = imp.spec
    let target = null
    if (spec.startsWith('.')) target = norm(dirOf(from) + '/' + spec)
    else if (spec.startsWith('/')) target = norm(spec)
    else {
      for (const [a, p] of aliases) if (spec === a || spec.startsWith(a + '/')) { target = norm(p + spec.slice(a.length)); break }
      if (target == null) for (const [n, p] of packages) if (spec === n || spec.startsWith(n + '/')) { target = norm(p + spec.slice(n.length)); break }
    }
    if (target == null) return { external: externalName(spec) }
    const f = resolveJs(target, known)
    return f ? { files: [f] } : { unresolved: spec }
  }
}

// { edges: [{ from, to, names, typeOnly, dynamic }], external: Map(fichier → Set(paquets)), unresolved: [{ from, spec }] }
export function buildGraph(cfg, analyzed, allFiles) {
  const resolve = makeResolver(cfg, allFiles)
  const edges = []
  const external = new Map()
  const unresolved = []
  for (const f of analyzed) {
    for (const imp of f.imports) {
      const r = resolve(f.rel, imp, f.lang)
      if (r.files) for (const to of r.files) { if (to !== f.rel) edges.push({ from: f.rel, to, names: imp.names, typeOnly: !!imp.typeOnly, dynamic: !!imp.dynamic, reexport: !!imp.reexport }) }
      else if (r.external) {
        if (!external.has(f.rel)) external.set(f.rel, new Set())
        external.get(f.rel).add(r.external)
      } else if (r.unresolved) unresolved.push({ from: f.rel, spec: r.unresolved })
    }
  }
  return { edges, external, unresolved }
}

// Les composantes fortement connexes de plus d'un fichier (Tarjan, itératif) : les cycles d'imports. Les imports de type
// seul et les imports dynamiques sont exclus (ils ne lient rien au chargement).
export function cycles(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, []]))
  for (const e of edges) if (!e.typeOnly && !e.dynamic && adj.has(e.from) && adj.has(e.to)) adj.get(e.from).push(e.to)
  let index = 0
  const idx = new Map()
  const low = new Map()
  const onStack = new Set()
  const stack = []
  const out = []
  for (const start of nodes) {
    if (idx.has(start)) continue
    const work = [[start, 0]]
    idx.set(start, index); low.set(start, index); index++
    stack.push(start); onStack.add(start)
    while (work.length) {
      const top = work[work.length - 1]
      const [v, i] = top
      const next = adj.get(v)
      if (i < next.length) {
        top[1]++
        const w = next[i]
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++
          stack.push(w); onStack.add(w)
          work.push([w, 0])
        } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)))
      } else {
        work.pop()
        if (work.length) {
          const u = work[work.length - 1][0]
          low.set(u, Math.min(low.get(u), low.get(v)))
        }
        if (low.get(v) === idx.get(v)) {
          const comp = []
          let w
          do { w = stack.pop(); onStack.delete(w); comp.push(w) } while (w !== v)
          if (comp.length > 1) out.push(comp.sort())
        }
      }
    }
  }
  return out.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}
