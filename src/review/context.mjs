// LE CONTEXTE MESURÉ d'une revue (AM-4) : les deux révisions sont extraites (`git archive`, comme `archimetrics diff
// --base`) dans un dossier temporaire supprimé ensuite, puis relevées sans Git ; on en tire, pour chaque fichier touché,
// ses VOISINS par le graphe d'imports de la révision d'arrivée (qui l'importe, ce qu'il importe), ses lignes de code
// avant/après, et les VIOLATIONS qui le touchent (nouvelles, existantes, résorbées). Le dépôt n'est pas touché.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../config.mjs'
import { extractCommit } from '../git-base.mjs'
import { collect } from '../metrics/index.mjs'
import { EMPTY_TREE } from './git.mjs'

const MAX_NEIGHBOURS = 10
const keyOf = (v) => (typeof v === 'string' ? v : v?.key)

/** Le relevé et le graphe d'une révision extraite sous `tmp`. */
function measureSha(root, sha, tmp) {
  const dir = join(tmp, sha.slice(0, 12))
  extractCommit(root, sha, dir, tmp)
  const cfg = loadConfig(dir)
  cfg.useGit = false
  const { result, model } = collect(cfg, { hotspots: false })
  return { result, edges: model.graph.edges }
}

/** Les voisins de `path` dans `edges` : importeurs et imports, uniques, bornés. */
export function neighboursOf(path, edges) {
  const uniq = (xs) => [...new Set(xs)].sort().slice(0, MAX_NEIGHBOURS)
  return {
    importeurs: uniq(edges.filter((e) => e.to === path && e.from !== path).map((e) => e.from)),
    imports: uniq(edges.filter((e) => e.from === path && e.to !== path).map((e) => e.to)),
  }
}

// Une clé de violation nomme son fichier (`src/a.mjs`, `src/a.mjs#f`, `src/a.mjs ↔ src/b.mjs`, `src/` pour un dossier).
const touches = (key, paths) => paths.some((p) => key.includes(p))

/** Les violations qui touchent `paths` : `{ regle, cle, valeur, limite, etat }`, état nouvelle | existante | résorbée. */
export function touchedViolations(before = {}, after = {}, paths) {
  const rules = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return rules.flatMap((rule) => ruleViolations(rule, before[rule] ?? [], after[rule] ?? []).filter((v) => touches(v.cle, paths)))
}

const entry = (regle, k, v, etat) => ({ regle, cle: k, valeur: v?.value ?? null, limite: v?.limit ?? null, etat })

/** Les violations d'une règle, avec leur état entre les deux relevés. */
function ruleViolations(rule, before, after) {
  const b = new Map(before.map((v) => [keyOf(v), v]))
  const a = new Map(after.map((v) => [keyOf(v), v]))
  return [
    ...[...a].map(([k, v]) => entry(rule, k, v, b.has(k) ? 'existante' : 'nouvelle')),
    ...[...b].filter(([k]) => !a.has(k)).map(([k, v]) => entry(rule, k, v, 'résorbée')),
  ]
}

const linesOf = (result, path) => result?.files?.find((f) => f.path === path)?.codeLines ?? null

/**
 * Le contexte mesuré d'un changement de `root`, ou `{ disponible: false, raison }` si la mesure échoue.
 * @param {string} root
 * @param {{ base: string, head: string }} range
 * @param {string[]} paths fichiers touchés et lus
 */
export function measuredContext(root, { base, head }, paths) {
  const tmp = mkdtempSync(join(tmpdir(), 'archimetrics-revue-'))
  try {
    const after = measureSha(root, head, tmp)
    const before = base === EMPTY_TREE ? null : measureSha(root, base, tmp)
    const fichiers = Object.fromEntries(paths.map((p) => [p, {
      ...neighboursOf(p, after.edges),
      lignesAvant: linesOf(before?.result, p),
      lignesApres: linesOf(after.result, p),
    }]))
    const resume = Object.fromEntries(['files', 'codeLines', 'functions', 'cycles', 'deadExports', 'violations']
      .map((k) => [k, { avant: before?.result.summary[k] ?? null, apres: after.result.summary[k] }]))
    return { disponible: true, resume, fichiers, violations: touchedViolations(before?.result.violations, after.result.violations, paths) }
  } catch (e) {
    return { disponible: false, raison: e.message, fichiers: {}, violations: [] }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
