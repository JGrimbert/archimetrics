// LE MODÈLE LU PAR `contexte` ET `claude-md` : la configuration, les fichiers de code analysés (signatures comprises),
// le graphe des imports résolus vers le projet, rangé dans les deux sens. Rien n'est écrit.

import { readFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { analyzeFiles } from '../analyze/index.mjs'
import { loadConfig } from '../config.mjs'
import { listAll, listCode, toPosix } from '../files.mjs'
import { buildGraph } from '../graph.mjs'

// L'estimation en jetons : ≈ 4 caractères par jeton (aucun tokeniseur, aucun appel).
export const tokens = (s) => Math.ceil(s.length / 4)

const link = (map, a, b, names) => {
  if (!map.has(a)) map.set(a, new Map())
  const m = map.get(a)
  m.set(b, [...new Set([...(m.get(b) ?? []), ...names])])
}

/**
 * @param {string} root dossier du projet (absolu)
 * @param {string | null} [configPath]
 */
export function loadModel(root, configPath = null) {
  const cfg = loadConfig(root, configPath)
  const all = listAll(cfg)
  const { files, warnings } = analyzeFiles(cfg, listCode(cfg, all))
  const graph = buildGraph(cfg, files, all)
  const byRel = new Map(files.map((f) => [f.rel, f]))
  const out = new Map()
  const inc = new Map()
  for (const e of graph.edges) {
    if (!byRel.has(e.from) || !byRel.has(e.to)) continue
    link(out, e.from, e.to, e.names)
    link(inc, e.to, e.from, e.names)
  }
  return { cfg, files, byRel, graph, out, inc, warnings, read: (rel) => readFileSync(join(cfg.root, rel), 'utf8').replace(/\r\n/g, '\n') }
}

// Un chemin donné en argument (absolu, ou relatif à la racine) → chemin relatif en barres obliques.
export function relPath(root, p) {
  const r = isAbsolute(p) ? relative(root, p) : p
  return toPosix(r).replace(/^\.\//, '').replace(/\/$/, '')
}

// Les exports d'un fichier, sous une forme commune : les signatures d'un script, les seuls noms sinon (Python, Vue).
export function exportsOf(f) {
  if (f.signatures) return f.signatures
  return (f.exports ?? []).map((name) => ({ name, kind: 'export', signature: name, jsdoc: null, comment: null }))
}
