// LA BASELINE : les violations tolérées, par règle (`archimetrics.baseline.json`, versionné dans le projet analysé).
// Le garde-fou échoue sur une violation NOUVELLE ; en mode strict, aussi sur une violation tolérée qui a disparu (elle doit
// sortir de la liste : la liste ne fait que rétrécir). `archimetrics baseline` la réécrit d'après l'état présent.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function readBaseline(cfg) {
  const p = resolve(cfg.root, cfg.baseline)
  if (!existsSync(p)) return { path: p, exists: false, rules: {} }
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  return { path: p, exists: true, rules: raw.rules ?? {} }
}

export function writeBaseline(cfg, violations) {
  const p = resolve(cfg.root, cfg.baseline)
  const rules = {}
  for (const [rule, list] of Object.entries(violations)) if (list.length) rules[rule] = list.map((v) => v.key).sort()
  const body = {
    note: 'Violations tolérées par archimetrics (une clé par violation). La liste ne fait que rétrécir : une violation corrigée en sort, une nouvelle ne s’y ajoute que par décision (archimetrics baseline).',
    rules,
  }
  writeFileSync(p, JSON.stringify(body, null, 2) + '\n')
  return p
}

// { added: { règle: [violations] }, resolved: { règle: [clés] }, tolerated: n, ok }
export function compare(cfg, violations, baseline) {
  const added = {}
  const resolved = {}
  let tolerated = 0
  for (const [rule, list] of Object.entries(violations)) {
    const known = new Set(baseline.rules[rule] ?? [])
    const now = new Set(list.map((v) => v.key))
    const a = list.filter((v) => !known.has(v.key))
    const r = [...known].filter((k) => !now.has(k))
    tolerated += list.length - a.length
    if (a.length) added[rule] = a
    if (r.length) resolved[rule] = r
  }
  for (const [rule, keys] of Object.entries(baseline.rules)) if (!(rule in violations) && keys.length) resolved[rule] = keys
  const nAdded = Object.values(added).reduce((s, l) => s + l.length, 0)
  const nResolved = Object.values(resolved).reduce((s, l) => s + l.length, 0)
  return { added, resolved, tolerated, nAdded, nResolved, ok: nAdded === 0 && (!cfg.strictBaseline || nResolved === 0) }
}
