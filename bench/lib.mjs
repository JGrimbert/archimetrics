// LE BANC DE REVUE (AM-3) : 10 diffs annotés (`cas.json` ; figés sous `cas/` pour ArchiMetrics, extraits à la volée du
// dépôt local pour scribe : `extract.mjs`, D-034), une revue par diff demandée au fournisseur (`src/llm/`), notée sans
// LLM : respect du format (au 1er essai, après réessai), défauts attendus trouvés, constats faux, cas sains conclus
// « rien de significatif », latence. Une ligne par passage dans `resultats.md` (versionné : des chiffres, aucun code), le
// détail dans `resultats/<horodatage>-<modèle>.json` (ignoré par Git : les revues citent le code des cas).
// L'empreinte (cas, diffs, prompt) dit quels passages se comparent.

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { completeJson } from '../src/llm/index.mjs'
import { caseAfterFiles, caseDiff, repoPaths } from './extract.mjs'

export const BENCH_DIR = fileURLToPath(new URL('.', import.meta.url))
export const PROMPT_VERSION = 'revue-1'

export const REVIEW_SCHEMA = {
  type: 'object',
  required: ['conclusion', 'constats'],
  additionalProperties: false,
  properties: {
    conclusion: { type: 'string', enum: ['rien de significatif', 'constats'] },
    constats: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fichier', 'nature', 'gravite', 'description'],
        additionalProperties: false,
        properties: {
          fichier: { type: 'string' },
          ligne: { type: ['integer', 'null'] },
          nature: { type: 'string', enum: ['avéré', 'risque', 'suggestion'] },
          gravite: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
          description: { type: 'string' },
        },
      },
    },
  },
}

const SYSTEM = [
  'Tu es relecteur de code. On te donne un diff unifié : les lignes « - » sont retirées, les lignes « + » ajoutées.',
  'Signale seulement les défauts que ce diff INTRODUIT : bogue, régression, cas oublié, test fragile ou faux, faille.',
  'Pas de remarque de style, de nommage ni de documentation. Nature : « avéré » (défaut certain), « risque » (défaut',
  'probable), « suggestion » (amélioration sans défaut). Si le diff n\'introduit aucun défaut, réponds',
  '{"conclusion": "rien de significatif", "constats": []} : c\'est une réponse normale et attendue.',
  'Sinon, conclusion « constats » et un constat par défaut : fichier, ligne (ou null), nature, gravité, description',
  'courte en français qui dit le mécanisme du défaut. Réponds UNIQUEMENT par un objet JSON.',
].join('\n')

/**
 * Le banc lu depuis `dir` : cas (avec le texte de leur diff, figé ou extrait à la volée ; sinon `indisponible`), dépôts,
 * empreinte. L'empreinte couvre ce qui est montré au modèle et noté (dépôts, cas, attendus, mots-clés, diffs, consigne),
 * pas la forme de `cas.json` ; `prompt` : la consigne (celle du banc d'AM-3 par défaut ; celle d'`archimetrics review` en mode
 * « revue », qui donne donc une autre empreinte sur les mêmes cas et les mêmes diffs) ; fins de ligne ramenées à LF (un checkout `core.autocrlf` ne la change pas). Un banc dont un
 * cas manque a une empreinte suffixée `-partiel` : il ne se compare à aucun autre.
 * @param {string} [dir]
 * @param {{ repos?: Record<string, string>, run?: Function }} [o]
 */
export function loadBench(dir = BENCH_DIR, { repos, run, prompt = { version: PROMPT_VERSION, text: SYSTEM }, apres = false } = {}) {
  const bench = JSON.parse(readFileSync(join(dir, 'cas.json'), 'utf8'))
  const paths = repoPaths(dir, repos)
  const hash = createHash('sha256').update(prompt.version).update(prompt.text).update(JSON.stringify(bench.depots))
  const cas = bench.cas.map((c) => {
    const got = caseDiff(c, { dir, repos: paths, run })
    hash.update(JSON.stringify([c.id, c.depot, c.attendu, c.constats])).update(got.diffText ?? `(indisponible ${c.id})`)
    // `apres` (AM-4b, --contexte fichier) : les fichiers après le changement, qui entrent aussi dans l'empreinte.
    const fichiersApres = apres && got.diffText ? caseAfterFiles(c, got.diffText, { repos: paths, self: join(dir, '..'), run }) : undefined
    if (fichiersApres) hash.update(JSON.stringify(Object.entries(fichiersApres).sort()))
    return { ...c, diffText: got.diffText ?? null, indisponible: got.indisponible ?? null, ...(fichiersApres ? { fichiersApres } : {}) }
  })
  const partiel = cas.some((c) => c.indisponible) ? '-partiel' : ''
  return { depots: bench.depots, cas, empreinte: hash.digest('hex').slice(0, 8) + partiel }
}

/** Les messages d'une revue : consigne, puis le dépôt et le diff (jamais le message du commit, trompeur pour un inverse). */
export function messagesFor(cas, depots) {
  const user = `Dépôt : ${depots[cas.depot] ?? cas.depot}\n\nDiff :\n\`\`\`diff\n${cas.diffText}\`\`\``
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }]
}

const pertinent = (c) => c.nature !== 'suggestion'

/** Cohérence d'une revue, au-delà du schéma. */
export function checkReview(v) {
  if (v.conclusion === 'constats' && !v.constats.length) return ['conclusion « constats » sans aucun constat']
  if (v.conclusion === 'rien de significatif' && v.constats.some(pertinent)) return ['conclusion « rien de significatif » avec des constats avérés ou risqués']
  return []
}

/** Minuscules, sans accents, apostrophes droites. */
export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase()

const matches = (constat, expected) => expected.motsCles.some((k) => norm(constat.description).includes(norm(k)))

/**
 * La note d'un cas, sans LLM.
 * @param {{ id: string, attendu: string, constats: { motsCles: string[] }[] }} cas
 * @param {{ ok: boolean, value: any, attempts: { ms: number, errors: string[] }[], durationMs: number, usage?: object, error?: string }} res
 */
export function scoreCase(cas, res) {
  const found = res.ok ? res.value.constats.filter(pertinent) : []
  const trouves = cas.constats.filter((e) => found.some((c) => matches(c, e))).length
  const faux = found.filter((c) => !cas.constats.some((e) => matches(c, e))).length
  return {
    id: cas.id,
    attendu: cas.attendu,
    formatPremier: res.ok && res.attempts.length === 1,
    formatFinal: res.ok,
    essais: res.attempts.length,
    ms: res.durationMs,
    sortie: res.usage?.output ?? null,
    attendus: cas.constats.length,
    trouves,
    pertinents: found.length,
    faux,
    rien: res.ok && found.length === 0,
    erreur: res.error ?? null,
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}
const sum = (xs) => xs.reduce((a, b) => a + b, 0)

/** Le résumé d'un passage : ce que la ligne du tableau montre. */
export function summarize(scores, meta) {
  const defauts = scores.filter((s) => s.attendu === 'défaut')
  const sains = scores.filter((s) => s.attendu === 'rien')
  const ms = scores.map((s) => s.ms)
  return {
    ...meta,
    cas: scores.length,
    formatPremier: scores.filter((s) => s.formatPremier).length,
    formatFinal: scores.filter((s) => s.formatFinal).length,
    trouves: sum(defauts.map((s) => s.trouves)),
    attendus: sum(defauts.map((s) => s.attendus)),
    sainsRien: sains.filter((s) => s.rien).length,
    sains: sains.length,
    faux: sum(scores.map((s) => s.faux)),
    pertinents: sum(scores.map((s) => s.pertinents)),
    latenceMedianeS: Math.round(median(ms) / 100) / 10,
    latenceMaxS: Math.round(Math.max(0, ...ms) / 100) / 10,
    dureeTotaleS: Math.round(sum(ms) / 100) / 10,
    jetonsSortie: sum(scores.map((s) => s.sortie ?? 0)),
  }
}

export const TABLE_HEADER = [
  '| Date (UTC) | Banc | Fournisseur | Modèle | Format 1er essai | Format final | Défauts trouvés | Sains « rien » | Constats faux / émis | Latence médiane | Latence max | Total | Jetons sortie |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
].join('\n')

/** La ligne du tableau d'un résumé. */
export function tableRow(s) {
  return `| ${s.date} | ${s.empreinte} | ${s.fournisseur} | ${s.modele} | ${s.formatPremier}/${s.cas} | ${s.formatFinal}/${s.cas} `
    + `| ${s.trouves}/${s.attendus} | ${s.sainsRien}/${s.sains} | ${s.faux}/${s.pertinents} | ${s.latenceMedianeS} s `
    + `| ${s.latenceMaxS} s | ${s.dureeTotaleS} s | ${s.jetonsSortie} |`
}

/** Une revue, sans jamais lever : une erreur du fournisseur devient un cas en échec de format. */
async function reviewOne(provider, cas, depots, retries) {
  try {
    return await completeJson(provider, messagesFor(cas, depots), { schema: REVIEW_SCHEMA, check: checkReview, retries })
  } catch (e) {
    return { ok: false, value: null, attempts: [{ ms: 0, errors: [e.message] }], durationMs: 0, error: e.message }
  }
}

/**
 * Passe le banc : une revue par cas, dans l'ordre, notée. `review` : la revue d'un cas (par défaut la question unique
 * d'AM-3 ; `reviewCase` de `revue.mjs` pour `archimetrics review`), qui rend `{ ok, value, attempts, durationMs, usage }`.
 * @param {{ provider: import('../src/llm/provider.mjs').Provider, bench: ReturnType<typeof loadBench>, retries?: number, only?: string[], onCase?: (s: object) => void, review?: Function }} o
 */
export async function runBench({ provider, bench, retries = 2, only, onCase = () => {}, onSkip = () => {}, review = reviewOne }) {
  const chosen = only?.length ? bench.cas.filter((c) => only.includes(c.id)) : bench.cas
  const cas = chosen.filter((c) => !c.indisponible)
  for (const c of chosen) if (c.indisponible) onSkip(c)
  const details = []
  for (const c of cas) {
    const res = await review(provider, c, bench.depots, retries)
    const score = scoreCase(c, res)
    details.push({ score, revue: res.value, essais: res.attempts, ...(res.document ? { document: res.document } : {}) })
    onCase(score)
  }
  // Un passage sur une partie du banc (--case, ou cas indisponibles) ne se compare pas au banc entier.
  const empreinte = cas.length < bench.cas.length && !bench.empreinte.endsWith('-partiel') ? `${bench.empreinte}-partiel` : bench.empreinte
  const meta = { date: new Date().toISOString().slice(0, 16).replace('T', ' '), empreinte, fournisseur: provider.name, modele: provider.model }
  return { summary: summarize(details.map((d) => d.score), meta), details }
}

/** Ajoute la ligne à `resultats.md` (créé avec son en-tête) et écrit le détail ; rend le chemin du détail. */
export function writeResults(dir, { summary, details }) {
  const table = join(dir, 'resultats.md')
  if (!existsSync(table)) writeFileSync(table, `# Banc de revue — résultats\n\nUne ligne par passage (\`node bench/run.mjs\`). Les lignes ne se comparent qu'à banc (empreinte) égal.\n\n${TABLE_HEADER}\n`)
  appendFileSync(table, `${tableRow(summary)}\n`)
  mkdirSync(join(dir, 'resultats'), { recursive: true })
  const stamp = summary.date.replace(/[: ]/g, '').replace(/-/g, '')
  const file = join(dir, 'resultats', `${stamp}-${summary.modele.replace(/[^\w.-]+/g, '_')}.json`)
  writeFileSync(file, `${JSON.stringify({ format: 'archimetrics.bench-result/1', summary, details }, null, 2)}\n`)
  return file
}
