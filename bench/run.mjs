#!/usr/bin/env node
// LE BANC EN UNE COMMANDE (AM-3) :
//   node bench/run.mjs [--provider ollama|openai-compatible] [--model <nom>] [--base-url <url>] [--api-key-env <VAR>]
//                      [--allow-remote] [--repo <nom>=<chemin>]… [--case <id>[,<id>…]] [--retries <n>] [--no-write]
//                      [--mode brut|revue]
// --mode brut (défaut) : la question unique d'AM-3 (diff seul). --mode revue (AM-4) : chaque cas passe par
// `archimetrics review` (src/review : segmentation, examen, filtre de la preuve, contre-vérification) ; autre empreinte.
// Par défaut : Ollama local (http://127.0.0.1:11434) et qwen3:4b-instruct-2507-q4_K_M, la référence de D-007. Une adresse
// qui n'est pas locale est refusée sans --allow-remote (src/llm/provider.mjs). Écrit une ligne dans bench/resultats.md et
// le détail dans bench/resultats/ (sauf --no-write) ; imprime le tableau du passage. Les cas de scribe sont extraits du
// dépôt local (--repo scribe=<chemin>, ou bench/depots.local.json) ; sans lui, ils sont sautés et le passage est « partiel ».

import { parseArgs } from 'node:util'
import { createProvider } from '../src/llm/index.mjs'
import { BENCH_DIR, loadBench, runBench, TABLE_HEADER, tableRow, writeResults } from './lib.mjs'
import { REVIEW_PROMPT, reviewCase } from './revue.mjs'

const DEFAULT_MODEL = 'qwen3:4b-instruct-2507-q4_K_M'

const OPTIONS = {
  provider: { type: 'string', default: 'ollama' },
  model: { type: 'string', default: DEFAULT_MODEL },
  'base-url': { type: 'string' },
  'api-key-env': { type: 'string' },
  'allow-remote': { type: 'boolean', default: false },
  repo: { type: 'string', multiple: true, default: [] },
  case: { type: 'string' },
  retries: { type: 'string', default: '2' },
  'no-write': { type: 'boolean', default: false },
  mode: { type: 'string', default: 'brut' },
}

const line = (s) => `${s.id.padEnd(22)} ${s.formatFinal ? `format ok (${s.essais} essai${s.essais > 1 ? 's' : ''})` : 'format KO'}`
  + ` · ${s.attendu === 'défaut' ? `trouvé ${s.trouves}/${s.attendus}` : (s.rien ? 'rien : juste' : 'rien : non')}`
  + ` · faux ${s.faux} · ${(s.ms / 1000).toFixed(1)} s${s.erreur ? ` · ${s.erreur}` : ''}`

/** `--repo nom=chemin` (répétable) → `{ nom: chemin }`. */
function parseRepos(list) {
  return Object.fromEntries(list.map((r) => {
    const i = r.indexOf('=')
    if (i < 1) throw new Error(`--repo ${r} : attendu <nom>=<chemin>`)
    return [r.slice(0, i), r.slice(i + 1)]
  }))
}

const out = (s) => process.stdout.write(`${s}\n`)

async function main() {
  const { values: o } = parseArgs({ options: OPTIONS, strict: true })
  const spec = { type: o.provider, model: o.model, apiKeyEnv: o['api-key-env'] }
  if (o['base-url']) spec.baseUrl = o['base-url']
  const provider = createProvider(spec, { allowRemote: o['allow-remote'] })
  if (!['brut', 'revue'].includes(o.mode)) throw new Error(`--mode ${o.mode} : attendu brut ou revue`)
  const revue = o.mode === 'revue'
  const bench = loadBench(BENCH_DIR, { repos: parseRepos(o.repo), ...(revue ? { prompt: REVIEW_PROMPT } : {}) })
  const only = o.case ? o.case.split(',').map((s) => s.trim()) : undefined
  out(`banc ${bench.empreinte} · mode ${o.mode} · ${provider.name} · ${provider.model} · ${provider.baseUrl}`)
  const run = await runBench({
    provider: revue ? { ...provider, name: `${provider.name} (revue)` } : provider, bench, retries: Number(o.retries), only,
    ...(revue ? { review: reviewCase } : {}),
    onCase: (s) => out(line(s)),
    onSkip: (c) => out(`${c.id.padEnd(22)} sauté : ${c.indisponible}`),
  })
  out(`\n${TABLE_HEADER}\n${tableRow(run.summary)}`)
  if (!o['no-write']) out(`\ndétail : ${writeResults(BENCH_DIR, run)}`)
}

main().catch((e) => {
  process.stderr.write(`bench : ${e.message}\n`)
  process.exit(1)
})
