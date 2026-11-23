// LE RELEVÉ COMPLET : fichiers → analyse → graphe → métriques. Rend un objet sérialisable (aucun texte de code), plus le
// modèle interne (`model`) dont les diagrammes ont besoin.

import { execFileSync } from 'node:child_process'
import { analyzeFiles } from '../analyze/index.mjs'
import { listAll, listCode } from '../files.mjs'
import { buildGraph } from '../graph.mjs'
import { couplingMetrics } from './coupling.mjs'
import { duplicationMetrics } from './duplication.mjs'
import { resolveGroups } from './groups.mjs'
import { hotspotMetrics } from './hotspots.mjs'
import { organisationMetrics } from './organisation.mjs'
import { functionMetrics, sizeMetrics } from './sizes.mjs'

// Les règles qui ont une liste de violations, et leur libellé.
export const RULES = {
  fileCodeLines: 'Fichiers trop longs (lignes de code)',
  functionLines: 'Fonctions trop longues',
  params: 'Fonctions à trop de paramètres',
  cyclomatic: 'Complexité cyclomatique',
  cognitive: 'Complexité cognitive',
  nesting: 'Imbrication trop profonde',
  filesPerDir: 'Dossiers trop peuplés',
  docMaxLines: 'Docs de dossier trop longues',
  docRequired: 'Dossiers sans doc',
  docLinks: 'Chemins morts dans les docs',
  cycles: "Cycles d'imports",
  lcom: 'Classes peu cohésives (LCOM4)',
  duplication: 'Taux de duplication',
}

export function collect(cfg, { hotspots = true } = {}) {
  const t0 = Date.now()
  const all = listAll(cfg)
  const code = listCode(cfg, all)
  const { files, warnings } = analyzeFiles(cfg, code)
  const graph = buildGraph(cfg, files, all)
  const { groups, groupOf } = resolveGroups(cfg, files)
  const sizes = sizeMetrics(files, cfg.limits)
  const functions = functionMetrics(files, cfg.limits)
  const organisation = organisationMetrics(cfg, files, all)
  const coupling = couplingMetrics(cfg, files, graph, groupOf)
  const duplication = duplicationMetrics(files, cfg.duplication)
  const history = hotspots ? hotspotMetrics(cfg, files, graph, functions.perFile) : { available: false, hotspots: [], temporal: [] }

  const violations = {
    ...sizes.violations,
    ...functions.violations,
    ...organisation.violations,
    ...coupling.violations,
    ...duplication.violations,
  }
  delete sizes.violations
  delete functions.violations
  delete organisation.violations
  delete coupling.violations
  delete duplication.violations
  const perFile = functions.perFile
  delete functions.perFile

  const groupStats = groups.map((g) => {
    const fs = files.filter((f) => !f.test && groupOf(f.rel) === g.name)
    return { ...g, files: fs.length, codeLines: fs.reduce((s, f) => s + f.codeLines, 0), functions: fs.reduce((s, f) => s + f.functions.length, 0), complexity: fs.reduce((s, f) => s + (perFile[f.rel] ?? 0), 0) }
  })

  const result = {
    tool: 'archimetrics',
    name: cfg.name,
    date: new Date().toISOString(),
    commit: gitHead(cfg.root),
    limits: cfg.limits,
    summary: {
      files: sizes.files,
      testFiles: sizes.testFiles,
      codeLines: sizes.codeLines,
      testCodeLines: sizes.testCodeLines,
      functions: functions.count,
      cyclomaticAvg: functions.average.cyclomatic,
      cognitiveAvg: functions.average.cognitive,
      duplicationPercent: duplication.percent,
      cycles: coupling.cycles.length,
      deadExports: coupling.deadExports.length,
      docs: organisation.docs.count,
      violations: Object.values(violations).reduce((s, v) => s + v.length, 0),
    },
    groups: groupStats,
    sizes,
    functions,
    organisation,
    coupling,
    duplication,
    history,
    violations,
    warnings,
    durationMs: Date.now() - t0,
  }
  return { result, model: { files, graph, groups, groupOf, all } }
}

function gitHead(root) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}
