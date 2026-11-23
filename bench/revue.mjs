// LE BANC EN MODE « REVUE » (AM-4) : chaque cas passe par `archimetrics review` (`reviewChange` de `src/review/` :
// exclusions, constats déterministes, segmentation, examen, filtre de la preuve, contre-vérification), sur le même diff que
// le mode « brut » d'AM-3 et sans le message du commit (il décrirait le correctif renversé). La notation reste celle
// d'AM-3 (`scoreCase` : mots-clés sur la description des constats avérés ou risqués). L'empreinte change avec la consigne
// (`REVIEW_PROMPT`) : mêmes cas, mêmes diffs, autre mesure.

import { reviewChange } from '../src/review/index.mjs'
import { promptVersion, SYSTEM_EXAMEN, SYSTEM_VERIF } from '../src/review/passes.mjs'

/** La consigne du mode « revue » pour un contexte (`diff`, ou `fichier` d'AM-4b), pour l'empreinte (`loadBench(dir, { prompt })`). */
export const reviewPrompt = (contexte = 'diff') => ({ version: promptVersion(contexte), text: `${SYSTEM_EXAMEN}\n---\n${SYSTEM_VERIF}` })
export const REVIEW_PROMPT = reviewPrompt()

/**
 * La revue d'un cas par `archimetrics review`, rendue dans la forme que note le banc. Le format compte « au 1er essai »
 * quand tous les appels de la revue l'ont été, « final » quand le fournisseur a répondu (un segment resté illisible après
 * réessais n'apporte aucun constat ; `document.llm.echecsFormat` les compte).
 * @returns {Promise<{ ok: boolean, value: object | null, attempts: object[], durationMs: number, usage: object, document?: object, error?: string }>}
 */
export async function reviewCase(provider, cas, depots, retries, { contexte = 'diff' } = {}) {
  const t0 = performance.now()
  const doc = await reviewChange({
    diffText: cas.diffText, label: cas.id, depot: depots[cas.depot] ?? cas.depot, provider, retries, contexte, fichiers: cas.fichiersApres,
  })
  const durationMs = Math.round(performance.now() - t0)
  const l = doc.llm
  if (l.statut !== 'actif') return { ok: false, value: null, attempts: [{ ms: durationMs, errors: [l.raison] }], durationMs, usage: { output: 0 }, document: doc, error: l.raison }
  const first = l.premierEssai === l.appels
  return {
    ok: true,
    value: { conclusion: doc.conclusion, constats: doc.constats },
    attempts: first ? [{ ms: durationMs, errors: [] }] : [{ ms: 0, errors: ['un appel au moins a demandé un réessai'] }, { ms: durationMs, errors: [] }],
    durationMs,
    usage: { input: l.jetons.entree, output: l.jetons.sortie },
    document: doc,
  }
}
