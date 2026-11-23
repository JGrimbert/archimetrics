// LA COMMANDE `archimetrics review` (AM-4) :
//   archimetrics review [<commit>|<a>..<b>|<a>...<b>] [--root .] [--out <dossier>] [--no-llm] [--no-metrics]
//                       [--provider ollama|openai-compatible] [--model <nom>] [--base-url <url>] [--api-key-env <VAR>]
//                       [--allow-remote] [--max-segments <n>] [--max-chars <n>] [--retries <n>] [--contexte diff|fichier]
//                       [--num-ctx <n>]
// --contexte fichier (AM-4b) : les passes voient aussi le fichier après le changement (fenêtre bornée) ; --num-ctx : la
// fenêtre de contexte d'Ollama (`options.num_ctx`), à élargir avec --contexte fichier.
// Écrit `review.json` (archimetrics.review/1) et `review.md` (par défaut dans `<root>/.archimetrics/review`) et affiche le
// Markdown. LLM par défaut : Ollama local et qwen3:4b-instruct-2507-q4_K_M (D-007) ; s'il ne répond pas, la revue reste
// déterministe (le document le dit). Une adresse qui n'est pas locale est refusée sans --allow-remote : code 1, rien lu.
// Code 0 : la revue informe, `check` juge (1 seulement sur une erreur).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createProvider } from '../llm/index.mjs'
import { reviewRepo } from './collect.mjs'
import { reviewMarkdown } from './markdown.mjs'

export const DEFAULT_MODEL = 'qwen3:4b-instruct-2507-q4_K_M'

const OPTIONS = {
  root: { type: 'string', default: '.' },
  out: { type: 'string' },
  'no-llm': { type: 'boolean', default: false },
  'no-metrics': { type: 'boolean', default: false },
  provider: { type: 'string', default: 'ollama' },
  model: { type: 'string', default: DEFAULT_MODEL },
  'base-url': { type: 'string' },
  'api-key-env': { type: 'string' },
  'allow-remote': { type: 'boolean', default: false },
  'max-segments': { type: 'string', default: '40' },
  'max-chars': { type: 'string', default: '6000' },
  retries: { type: 'string', default: '2' },
  contexte: { type: 'string', default: 'diff' },
  'num-ctx': { type: 'string' },
}

/** Le fournisseur des options, après la garde (lève `RemoteRefusedError`) ; null avec --no-llm. */
export function providerFrom(o, deps = {}) {
  if (o['no-llm']) return null
  const spec = { type: o.provider, model: o.model, apiKeyEnv: o['api-key-env'] }
  if (o['base-url']) spec.baseUrl = o['base-url']
  if (o['num-ctx']) spec.options = { num_ctx: Number(o['num-ctx']) }
  return createProvider(spec, { allowRemote: o['allow-remote'], ...deps })
}

/**
 * Exécute `archimetrics review` ; rend le code de sortie.
 * @param {string[]} argv arguments après `review`
 * @param {{ fetch?: typeof fetch, log?: (l: string) => void, print?: (s: string) => void }} [deps]
 */
export async function runReview(argv, { print = (s) => process.stdout.write(`${s}\n`), ...deps } = {}) {
  try {
    const { values: o, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true })
    if (positionals.length > 1) throw new Error('Usage : archimetrics review [<commit>|<a>..<b>] [--root .] [--out d] [--no-llm]')
    const provider = providerFrom(o, deps)
    const root = resolve(o.root)
    const doc = await reviewRepo({
      root, range: positionals[0], provider, metrics: !o['no-metrics'],
      maxSegments: Number(o['max-segments']), maxChars: Number(o['max-chars']), retries: Number(o.retries),
      contexte: o.contexte,
    })
    const out = resolve(o.out ?? join(root, '.archimetrics', 'review'))
    mkdirSync(out, { recursive: true })
    const md = reviewMarkdown(doc)
    writeFileSync(join(out, 'review.json'), `${JSON.stringify(doc, null, 1)}\n`)
    writeFileSync(join(out, 'review.md'), md)
    print(md)
    print(`Revue écrite dans ${out}.`)
    return 0
  } catch (e) {
    process.stderr.write(`✖ ${e.message}\n`)
    return 1
  }
}
