#!/usr/bin/env node
// archimetrics — métriques et garde-fous d'architecture.
//
//   archimetrics check     [--root .] [--config f]            garde-fous : code 1 sur une violation nouvelle (ou résorbée, mode strict)
//   archimetrics report    [--root .] [--out .archimetrics] [--history f]   écrit le rapport (pages, diagrammes, images, JSON)
//   archimetrics all       …                                   report + check (code de sortie du check)
//   archimetrics baseline  [--root .]                          écrit la baseline d'après l'état présent
//   archimetrics readme    [--root .] [--write README.md]      le bloc à poser dans le README du projet (ou l'y écrit, entre marqueurs)
//   archimetrics diff      <avant.json> <après.json> [--out d]  compare deux relevés → metrics-diff.json + .md (code 0)
//   archimetrics diff      --base <ref> [--head <ref>] [--root .] [--config f] [--out d]   idem entre une révision (git archive vers un
//                          dossier temporaire) et l'arbre de travail ou une autre révision ; le dépôt n'est pas touché
//   archimetrics review    [<commit>|<a>..<b>] [--root .] [--out d] [--no-llm] [--allow-remote] …   revue d'un changement →
//                          review.json (archimetrics.review/1) + review.md ; LLM local facultatif (src/review/cli.mjs)
// Options : --no-git (sans points chauds) ; --summary <fichier> (compte rendu Markdown du check, ex. $GITHUB_STEP_SUMMARY).

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compare, readBaseline, writeBaseline } from '../src/baseline.mjs'
import { loadConfig } from '../src/config.mjs'
import { runDiff } from '../src/diff-cli.mjs'
import { runReview } from '../src/review/cli.mjs'
import { collect } from '../src/metrics/index.mjs'
import { checkMarkdown } from '../src/report/markdown.mjs'
import { writeReport } from '../src/report/index.mjs'
import { readmeBlock, updateReadme } from '../src/readme.mjs'

const argv = process.argv.slice(2)
const cmd = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'all'
const opt = (name, fallback = null) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const flag = (name) => argv.includes('--' + name)

if (cmd === 'help' || flag('help')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'))
  process.exit(0)
}

if (cmd === 'diff') process.exit(runDiff(argv, opt))
if (cmd === 'review') process.exit(await runReview(argv))

const root = resolve(opt('root', '.'))
const cfg = loadConfig(root, opt('config'))

if (cmd === 'readme') {
  const target = opt('write')
  if (target) {
    const p = resolve(root, target)
    writeFileSync(p, updateReadme(existsSync(p) ? readFileSync(p, 'utf8') : '', readmeBlock(cfg)))
    console.log(`Bloc archimetrics écrit dans ${p}`)
  } else console.log(readmeBlock(cfg))
  process.exit(0)
}

const t0 = Date.now()
const { result, model } = collect(cfg, { hotspots: !flag('no-git') })
for (const w of result.warnings) console.warn('⚠ ' + w)

if (cmd === 'baseline') {
  const p = writeBaseline(cfg, result.violations)
  console.log(`Baseline écrite : ${p} (${result.summary.violations} violation(s) tolérée(s)).`)
  process.exit(0)
}

const baseline = readBaseline(cfg)
const check = baseline.exists ? compare(cfg, result.violations, baseline) : null
result.baselinePath = cfg.baseline

if (cmd === 'report' || cmd === 'all') {
  const out = resolve(root, opt('out', '.archimetrics'))
  writeReport(cfg, result, model, check, { out, historyIn: opt('history') ? resolve(opt('history')) : null })
  console.log(`Rapport écrit dans ${out} (${((Date.now() - t0) / 1000).toFixed(1)} s).`)
}

const md = checkMarkdown(result, check)
const summary = opt('summary')
if (summary) appendFileSync(summary, md)
if (cmd === 'check' || cmd === 'all') {
  console.log(md)
  const s = result.summary
  console.log(`${s.files} fichiers · ${s.codeLines} lignes de code · ${s.functions} fonctions · duplication ${s.duplicationPercent} % · ${s.violations} violation(s) — ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  if (check && !check.ok) process.exit(1)
}
