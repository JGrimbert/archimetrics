#!/usr/bin/env node
// LE BANC EN UNE COMMANDE (AM-3) :
//   node bench/run.mjs [--provider ollama|openai-compatible] [--model <nom>] [--base-url <url>] [--api-key-env <VAR>]
//                      [--allow-remote] [--repo <nom>=<chemin>]… [--case <id>[,<id>…]] [--retries <n>] [--no-write]
//                      [--mode brut|revue] [--contexte diff|fichier] [--num-ctx <n>]
// --contexte fichier (AM-4b, mode revue) : les passes voient aussi le fichier après le changement ; --num-ctx : la fenêtre
// de contexte d'Ollama (`options.num_ctx`). Le contexte entre dans l'empreinte ; num_ctx est imprimé en tête du passage.
// --mode brut (défaut) : la question unique d'AM-3 (diff seul). --mode revue (AM-4) : chaque cas passe par
// `archimetrics review` (src/review : segmentation, examen, filtre de la preuve, contre-vérification) ; autre empreinte.
// Par défaut : Ollama local (http://127.0.0.1:11434) et qwen3:4b-instruct-2507-q4_K_M, la référence de D-007. Une adresse
// qui n'est pas locale est refusée sans --allow-remote (src/llm/provider.mjs). Écrit une ligne dans bench/resultats.md et
// le détail dans bench/resultats/ (sauf --no-write) ; imprime le tableau du passage. Les cas de scribe sont extraits du
// dépôt local (--repo scribe=<chemin>, ou bench/depots.local.json) ; sans lui, ils sont sautés et le passage est « partiel ».

import { parseArgs } from 'node:util'
import { createProvider } from '../src/llm/index.mjs'
import { BENCH_DIR, loadBench, runBench, TABLE_HEADER, tableRow, writeResults } from './lib.mjs'
import { reviewCase, reviewPrompt } from './revue.mjs'

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
  contexte: { type: 'string', default: 'diff' },
  'num-ctx': { type: 'string' },
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

/** Le fournisseur des options (après la garde de `createProvider`). */
function providerOf(o) {
  const spec = { type: o.provider, model: o.model, apiKeyEnv: o['api-key-env'] }
  if (o['base-url']) spec.baseUrl = o['base-url']
  if (o['num-ctx']) spec.options = { num_ctx: Number(o['num-ctx']) }
  return createProvider(spec, { allowRemote: o['allow-remote'] })
}

/** Le mode et le contexte, vérifiés : `{ revue, fichier }`. */
function modeOf(o) {
  if (!['brut', 'revue'].includes(o.mode)) throw new Error(`--mode ${o.mode} : attendu brut ou revue`)
  if (!['diff', 'fichier'].includes(o.contexte)) throw new Error(`--contexte ${o.contexte} : attendu diff ou fichier`)
  if (o.contexte !== 'diff' && o.mode !== 'revue') throw new Error('--contexte fichier : seulement avec --mode revue')
  return { revue: o.mode === 'revue', fichier: o.contexte === 'fichier' }
}

async function main() {
  const { values: o } = parseArgs({ options: OPTIONS, strict: true })
  const provider = providerOf(o)
  const { revue, fichier } = modeOf(o)
  const bench = loadBench(BENCH_DIR, { repos: parseRepos(o.repo), ...(revue ? { prompt: reviewPrompt(o.contexte), apres: fichier } : {}) })
  const only = o.case ? o.case.split(',').map((s) => s.trim()) : undefined
  const nofile = fichier ? bench.cas.filter((c) => c.diffText && !Object.keys(c.fichiersApres ?? {}).length).map((c) => c.id) : []
  const extra = `${revue ? ` · contexte ${o.contexte}` : ''}${o['num-ctx'] ? ` · num_ctx ${o['num-ctx']}` : ''}`
  out(`banc ${bench.empreinte} · mode ${o.mode}${extra} · ${provider.name} · ${provider.model} · ${provider.baseUrl}`)
  if (nofile.length) out(`sans fichier après le changement : ${nofile.join(', ')}`)
  const run = await runBench({
    provider: revue ? { ...provider, name: `${provider.name} (revue${fichier ? ', fichier' : ''})` } : provider, bench, retries: Number(o.retries), only,
    ...(revue ? { review: (p, c, d, r) => reviewCase(p, c, d, r, { contexte: o.contexte }) } : {}),
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
