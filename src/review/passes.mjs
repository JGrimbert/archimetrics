// LES PASSES LLM d'une revue (AM-4), par `src/llm` (`completeJson`, sortie validée et réessai) :
// 1. EXAMEN de chaque segment (un fichier, quelques blocs ; contexte : voisins, métriques) : constats avec une PREUVE,
//    une ligne changée du diff copiée telle quelle ;
// 2. FILTRE sans LLM : une preuve qui n'est pas une ligne changée du segment écarte le constat (il parle d'autre chose) ;
//    la preuve donne le « fichier:ligne » ;
// 3. CONTRE-VÉRIFICATION de chaque constat avéré ou risqué restant, par une seconde question, sceptique : seul
//    « confirmé » le garde. Les écartés restent dans `ecartes`, avec la raison.
// Mesuré sur le banc d'AM-3 (bench/resultats.md) : un modèle de 4 B émet surtout des constats faux ; ces deux filtres
// sont ce qui ramène les faux sous le critère.

import { completeJson } from '../llm/index.mjs'
import { changedLines } from './diff.mjs'

// La version de la chaîne des passes (consigne et filtres) : elle entre dans l'empreinte du banc. `revue-am4-3` : fin
// d'AM-4 ; `revue-am4b-1` : même consigne, preuve découpée aussi sur les « \n » littéraux (AM-4b).
export const REVIEW_PROMPT_VERSION = 'revue-am4b-1'

/**
 * Le CONTEXTE des passes (AM-4b) : « diff » (AM-4 : le segment seul) ou « fichier » (le fichier après le changement, en
 * plus du diff : entier s'il tient dans `MAX_FICHIER` caractères, sinon une fenêtre autour des lignes du segment).
 */
export const CONTEXTES = ['diff', 'fichier']
export const MAX_FICHIER = 12000

/** La version de la consigne pour un contexte : elle entre dans `review.json` (`llm.consigne`) et l'empreinte du banc. */
export const promptVersion = (contexte = 'diff') => (contexte === 'fichier' ? `${REVIEW_PROMPT_VERSION}+fichier-1` : REVIEW_PROMPT_VERSION)

const GRAVITE = { type: 'string', enum: ['haute', 'moyenne', 'basse'] }

// Pas de champ « conclusion » : mesuré sur le banc, un modèle de 4 B dont la sortie est contrainte par le schéma écrit
// d'abord la conclusion, et conclut alors « rien » sur les 10 cas. La conclusion se déduit des constats gardés.
export const EXAMEN_SCHEMA = {
  type: 'object',
  required: ['constats'],
  additionalProperties: false,
  properties: {
    constats: {
      type: 'array',
      items: {
        type: 'object',
        required: ['nature', 'gravite', 'preuve', 'description', 'consequence', 'correction'],
        additionalProperties: false,
        properties: {
          nature: { type: 'string', enum: ['avéré', 'risque', 'suggestion'] },
          gravite: GRAVITE,
          preuve: { type: 'string' },
          description: { type: 'string' },
          consequence: { type: 'string' },
          correction: { type: 'string' },
        },
      },
    },
  },
}

// La justification AVANT le verdict : la sortie suit l'ordre du schéma, et un verdict écrit d'abord contredit souvent la
// justification qui le suit (mesuré : « confirmé » suivi de « Le constat est réfuté »).
export const VERIF_SCHEMA = {
  type: 'object',
  required: ['justification', 'verdict'],
  additionalProperties: false,
  properties: {
    justification: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmé', 'réfuté', 'incertain'] },
  },
}

export const SYSTEM_EXAMEN = [
  'Tu es relecteur de code. On te montre UN segment d\'un changement : le diff unifié d\'un fichier (lignes « - » retirées,',
  'lignes « + » ajoutées), et parfois du contexte (voisins par les imports, métriques).',
  'Signale les défauts que ce changement INTRODUIT : bogue, régression, cas oublié, test fragile ou faux, faille.',
  'Pas de remarque de style, de nommage ni de documentation. Si le changement n\'introduit aucun défaut, réponds',
  '{"constats": []} : c\'est une réponse normale et attendue.',
  'Pour chaque défaut : preuve = UNE ligne changée du diff, copiée telle quelle avec son « + » ou son « - » ; description =',
  'le mécanisme du défaut ; consequence = ce qui casse ; correction = la correction minimale ; nature : « avéré » (défaut',
  'certain), « risque » (probable), « suggestion » (amélioration sans défaut) ; gravité : haute, moyenne, basse.',
  'Réponds UNIQUEMENT par un objet JSON, en français.',
].join('\n')

export const SYSTEM_VERIF = [
  'Tu contre-vérifies le constat d\'un autre relecteur sur un changement de code. On te montre le changement (le code',
  'AVANT et APRÈS, ou son diff unifié), puis le constat.',
  'Les constats proposés sont souvent faux : confusion entre l\'avant et l\'après, défaut supposé dans du code qu\'on ne voit',
  'pas, comportement inchangé décrit comme un défaut, mécanisme mal compris, simple préférence.',
  'Commence la justification par ce que le changement fait réellement (avant → après), puis dis si le constat décrit un',
  'défaut que ce changement introduit, avec le bon mécanisme. Verdict « confirmé » seulement dans ce cas ; « réfuté » si le',
  'constat est faux, hors du changement, ou affaire de style ; « incertain » si le code montré ne permet pas de trancher.',
  'Réponds UNIQUEMENT par {"justification": "…", "verdict": "…"}, en français.',
].join('\n')

const squash = (s) => String(s).replace(/\s+/g, ' ').trim()

/** La ligne changée que cite une ligne de preuve, ou null. */
function locateOne(text, lines) {
  const p = squash(String(text).replace(/^\s*[+-](?![+-])/, ''))
  if (!p) return null
  return lines.find((l) => squash(l.text) === p)
    ?? (p.length >= 12 ? lines.find((l) => squash(l.text).includes(p)) : null)
    ?? null
}

/**
 * La ligne changée que cite une preuve, ou null : égale (sans le « + »/« - » ni les blancs), ou, pour 12 caractères au
 * moins, contenue dans une ligne changée. Une preuve de plusieurs lignes (un modèle recopie souvent tout le bloc) désigne
 * sa première ligne ajoutée retrouvée, sinon sa première ligne retirée retrouvée.
 * @param {string} preuve
 * @param {import('./diff.mjs').Hunk[]} hunks
 */
export function locateProof(preuve, hunks) {
  const lines = changedLines(hunks).filter((l) => squash(l.text))
  // Fins de ligne CRLF : `locateOne` ramène les blancs (dont \r) à rien. Un modèle écrit souvent un bloc avec des « \n »
  // LITTÉRAUX (échappés deux fois dans le JSON) : ils séparent aussi les lignes (mesuré sur le banc, s1, AM-4b).
  const found = String(preuve).split(/\n|\\n/).map((t) => locateOne(t, lines)).filter(Boolean)
  return found.find((l) => l.kind === '+') ?? found[0] ?? null
}

const contextBlock = (ctx = {}) => {
  const parts = []
  if (ctx.depot) parts.push(`Dépôt : ${ctx.depot}`)
  if (ctx.message) parts.push(`Message du commit :\n${ctx.message.slice(0, 800)}`)
  const v = ctx.voisins
  if (v?.importeurs?.length) parts.push(`Fichiers qui importent ce fichier : ${v.importeurs.join(', ')}`)
  if (v?.imports?.length) parts.push(`Fichiers que ce fichier importe : ${v.imports.join(', ')}`)
  if (ctx.metriques) parts.push(`Métriques : ${ctx.metriques}`)
  return parts.join('\n')
}

/**
 * La fenêtre du fichier après le changement montrée avec un segment : les lignes numérotées, entières si elles tiennent
 * dans `max` caractères, sinon élargies autour des lignes du segment (côté nouveau fichier) jusqu'à `max`. Null sans texte.
 * @param {string | null | undefined} text
 * @param {import('./diff.mjs').Segment} segment
 */
export function fileWindow(text, segment, max = MAX_FICHIER) {
  if (typeof text !== 'string' || !text) return null
  const numbered = text.replace(/\r\n/g, '\n').split('\n').map((l, i) => `${String(i + 1).padStart(5)}| ${l}`)
  const cost = (i) => numbered[i].length + 1
  if (numbered.reduce((n, l) => n + l.length + 1, 0) <= max) return { texte: numbered.join('\n'), entier: true }
  const nums = segment.hunks.flatMap((h) => h.lines.map((l) => l.newLine ?? l.at)).filter(Number.isInteger)
  const last = numbered.length - 1
  let lo = Math.min(Math.max(0, Math.min(...nums) - 1), last)
  let hi = lo
  let size = cost(lo)
  // D'abord jusqu'à la dernière ligne du segment, puis des deux côtés tour à tour, tant que `max` le permet.
  const end = Math.min(last, Math.max(...nums) - 1)
  while (hi < end && size + cost(hi + 1) <= max) size += cost(++hi)
  for (let grew = true; grew;) {
    const up = hi < last && size + cost(hi + 1) <= max
    if (up) size += cost(++hi)
    const down = lo > 0 && size + cost(lo - 1) <= max
    if (down) size += cost(--lo)
    grew = up || down
  }
  return { texte: numbered.slice(lo, hi + 1).join('\n'), entier: false, de: lo + 1, a: hi + 1, total: numbered.length }
}

/** Le bloc « fichier après le changement » d'un message, ou null. */
function fileBlock(ctx, segment) {
  const w = fileWindow(ctx?.fichier, segment)
  if (!w) return null
  const title = w.entier ? `Fichier ${segment.path} APRÈS le changement (entier, lignes numérotées ; pour le contexte)`
    : `Fichier ${segment.path} APRÈS le changement (lignes ${w.de} à ${w.a} sur ${w.total}, numérotées ; pour le contexte)`
  return block(title, w.texte)
}

/** Les messages de l'examen d'un segment. */
export function examenMessages(segment, ctx) {
  const part = segment.of > 1 ? ` (segment ${segment.index}/${segment.of})` : ''
  // Le diff seul : montrer aussi l'avant et l'après à l'examen (consigne revue-am4-4, banc 5801ea3f) a fait taire le
  // modèle (0 constat émis sur 10 cas) ; la vue avant / après sert à la contre-vérification.
  // Contexte « fichier » (AM-4b) : le fichier après le changement, avant le diff.
  const file = fileBlock(ctx, segment)
  const user = `${contextBlock(ctx)}${file ? `\n\n${file}` : ''}\n\nFichier : ${segment.path}${part}\n\nDiff :\n\`\`\`diff\n${segment.text}\`\`\``
  return [{ role: 'system', content: SYSTEM_EXAMEN }, { role: 'user', content: user.trim() }]
}

/** Les blocs d'un segment vus d'un côté : « avant » (contexte et lignes retirées) ou « après » (contexte et ajoutées). */
export function sideText(hunks, side) {
  const skip = side === 'avant' ? '+' : '-'
  return hunks.map((h) => h.lines.filter((l) => l.kind !== skip).map((l) => l.text).join('\n')).join('\n…\n')
}

const block = (title, text) => `${title} :\n\`\`\`\n${text}\n\`\`\``

/** Les deux vues de la contre-vérification. */
export const VIEWS = ['avant-après', 'diff']

/**
 * Les messages de la contre-vérification sous une vue : « avant-après » (les deux côtés des blocs, un petit modèle
 * confondant « - » et « + ») ou « diff » (le diff unifié du segment).
 */
export function verifMessages(segment, c, view = 'avant-après', ctx = {}) {
  const claim = `Constat proposé (${c.nature}, ${c.gravite}) : ${c.description}\nConséquence annoncée : ${c.consequence}\nLigne citée : ${c.preuve}`
  const code = view === 'diff'
    ? [block('Diff unifié du changement (« - » : avant ; « + » : après)', segment.text.trimEnd())]
    : [block('AVANT le changement', sideText(segment.hunks, 'avant')), block('APRÈS le changement', sideText(segment.hunks, 'après'))]
  const file = fileBlock(ctx, segment)
  const user = [`Fichier : ${segment.path}`, ...(file ? [file] : []), ...code, claim].join('\n\n')
  return [{ role: 'system', content: SYSTEM_VERIF }, { role: 'user', content: user }]
}

/** Cohérence d'un examen, au-delà du schéma : chaque constat cite une preuve et décrit un mécanisme. */
export function checkExamen(v) {
  return v.constats.flatMap((c, i) => (!String(c.preuve).trim() || !String(c.description).trim() ? [`constats[${i}] : preuve ou description vide`] : []))
}

/** Le compteur des appels LLM d'une revue. */
export function newStats() {
  return { appels: 0, premierEssai: 0, echecsFormat: 0, dureeMs: 0, jetons: { entree: 0, sortie: 0 } }
}

/** Un appel validé ; compte dans `stats` ; rend la valeur, ou null si le format reste faux. Lève sur erreur fournisseur. */
async function ask(provider, messages, { schema, check, stats, retries }) {
  const res = await completeJson(provider, messages, { schema, check, retries })
  stats.appels++
  stats.dureeMs += res.durationMs
  stats.jetons.entree += res.usage.input
  stats.jetons.sortie += res.usage.output
  if (res.ok && res.attempts.length === 1) stats.premierEssai++
  if (!res.ok) stats.echecsFormat++
  return res.ok ? res.value : null
}

const located = (segment, c, line) => ({
  source: 'llm', gravite: c.gravite, fichier: segment.path, ligne: line.kind === '-' ? line.at : line.newLine,
  nature: c.nature, preuve: `${line.kind}${line.text.trim()}`.slice(0, 300), description: c.description,
  consequence: c.consequence, correction: c.correction,
})

/**
 * Contre-vérifie un constat avéré ou risqué sous les deux vues (avant / après, puis diff) ; il n'est gardé que si les deux
 * le confirment (mesuré sur le banc : chaque vue seule laisse passer des faux différents). Rend `{ garde, raison }`.
 */
async function verify(provider, segment, f, { stats, retries, ctx }) {
  const notes = []
  for (const view of VIEWS) {
    const v = await ask(provider, verifMessages(segment, f, view, ctx), { schema: VERIF_SCHEMA, stats, retries })
    if (!v) return { garde: false, raison: `contre-vérification (${view}) illisible` }
    notes.push(`${view} : ${v.verdict} (${squash(v.justification).slice(0, 200)})`)
    if (v.verdict !== 'confirmé') return { garde: false, raison: `contre-vérification ${notes.join(' ; ')}` }
  }
  return { garde: true, raison: `contre-vérification ${notes.join(' ; ')}` }
}

/**
 * Les passes sur un segment : rend `{ constats, ecartes }`.
 * @param {import('../llm/provider.mjs').Provider} provider
 * @param {import('./diff.mjs').Segment} segment
 * @param {object} ctx `{ depot, message, voisins, metriques, fichier }` (`fichier` : le texte après le changement, ou null)
 * @param {{ stats: ReturnType<typeof newStats>, retries?: number, maxConstats?: number }} o
 */
export async function reviewSegment(provider, segment, ctx, { stats, retries = 2, maxConstats = 5 }) {
  const value = await ask(provider, examenMessages(segment, ctx), { schema: EXAMEN_SCHEMA, check: checkExamen, stats, retries })
  const constats = []
  const ecartes = []
  for (const c of (value?.constats ?? []).slice(0, maxConstats)) {
    const line = locateProof(c.preuve, segment.hunks)
    if (!line) {
      ecartes.push({ fichier: segment.path, nature: c.nature, description: c.description, raison: 'preuve absente des lignes changées' })
      continue
    }
    const f = located(segment, c, line)
    const check = f.nature === 'suggestion' ? { garde: true, raison: null } : await verify(provider, segment, f, { stats, retries, ctx })
    if (check.garde) constats.push(check.raison ? { ...f, verification: check.raison } : f)
    else ecartes.push({ fichier: f.fichier, ligne: f.ligne, nature: f.nature, description: f.description, raison: check.raison })
  }
  return { constats, ecartes, illisible: value === null }
}
