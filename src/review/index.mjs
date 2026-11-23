// LA REVUE D'UN CHANGEMENT (`archimetrics review`, AM-4) : du diff au document `review.json` (archimetrics.review/1).
//   lecture du diff → exclusions (secrets, binaires, générés, volumineux) → masquage des lignes de secret → constats
//   déterministes (toujours) → segmentation → passes LLM (si un fournisseur est donné et répond) → document.
// Sans fournisseur (`--no-llm`) ou s'il ne répond pas, la revue rend la seule partie déterministe : `llm.statut` le dit.
// `reviewChange` ne lit ni Git ni le réseau par lui-même : `collect.mjs` lui apporte le diff et le contexte, le banc ses
// cas, les tests un faux fournisseur.

import { ProviderError } from '../llm/index.mjs'
import { lineFindings, secretFindings, violationFindings } from './deterministic.mjs'
import { fileText, parseDiff, segmentFile } from './diff.mjs'
import { exclusion, redactSecrets } from './exclude.mjs'
import { CONTEXTES, newStats, promptVersion, reviewSegment } from './passes.mjs'

export const REVIEW_SCHEMA_VERSION = 'archimetrics.review/1'
const RANK = { haute: 0, moyenne: 1, basse: 2 }
const NATURE_RANK = { avéré: 0, risque: 1, suggestion: 2 }

const statusOf = (f) => {
  const h = f.header.join('\n')
  if (/^new file mode/m.test(h)) return 'ajouté'
  if (/^deleted file mode/m.test(h)) return 'supprimé'
  if (/^rename from/m.test(h)) return 'renommé'
  return 'modifié'
}

const count = (f, kind) => f.hunks.reduce((s, h) => s + h.lines.filter((l) => l.kind === kind).length, 0)

/** Les fichiers du diff avec leur exclusion éventuelle (`heads` : début de chaque fichier après le changement). */
export function classify(files, heads = {}) {
  return files.map((f) => {
    const exclu = exclusion({ path: f.path, binary: f.binary, diffChars: fileText(f).length, head: heads[f.path] ?? null })
    return { f, info: { path: f.path, statut: statusOf(f), ajouts: count(f, '+'), retraits: count(f, '-'), exclu } }
  })
}

const metricsLine = (m, violations, path) => {
  if (!m) return null
  const own = violations.filter((v) => v.cle.includes(path) && v.etat === 'nouvelle').map((v) => `${v.regle} (${v.cle})`)
  return `lignes de code ${m.lignesAvant ?? '—'} → ${m.lignesApres ?? '—'}${own.length ? ` ; violations nouvelles : ${own.join(', ')}` : ''}`
}

/** Les constats triés (gravité, nature, fichier, ligne), sans doublon (même fichier, même preuve), numérotés. */
export function sortFindings(list) {
  const seen = new Set()
  return list
    .filter((c) => {
      const k = `${c.fichier}\u0000${c.preuve}\u0000${c.regle ?? c.description}`
      return seen.has(k) ? false : seen.add(k)
    })
    .sort((a, b) => RANK[a.gravite] - RANK[b.gravite] || NATURE_RANK[a.nature] - NATURE_RANK[b.nature]
      || a.fichier.localeCompare(b.fichier) || (a.ligne ?? 0) - (b.ligne ?? 0))
    .map((c, i) => ({ id: `R${i + 1}`, ...c }))
}

/** Les passes LLM sur tous les segments ; un fournisseur injoignable dès le premier appel rend « indisponible ». */
async function llmPasses(provider, segments, ctxOf, o) {
  const stats = newStats()
  const out = { constats: [], ecartes: [], avertissements: [], statut: 'actif', raison: null, stats }
  for (const s of segments.slice(0, o.maxSegments)) {
    try {
      const r = await reviewSegment(provider, s, ctxOf(s.path), { stats, retries: o.retries })
      out.constats.push(...r.constats)
      out.ecartes.push(...r.ecartes)
      if (r.illisible) out.avertissements.push(`${s.path} (segment ${s.index}/${s.of}) : réponse du modèle illisible après réessais`)
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e
      if (!stats.appels && e.status === null) return { ...out, statut: 'indisponible', raison: e.message }
      out.avertissements.push(`${s.path} (segment ${s.index}/${s.of}) : ${e.message}`)
    }
  }
  if (segments.length > o.maxSegments) out.avertissements.push(`${segments.length - o.maxSegments} segment(s) non revus (au-delà de --max-segments ${o.maxSegments})`)
  return out
}

const llmBlock = (provider, r, contexte) => ({
  statut: provider ? r.statut : 'éteint',
  fournisseur: provider?.name ?? null,
  modele: provider?.model ?? null,
  distant: provider?.remote ?? false,
  consigne: provider ? promptVersion(contexte) : null,
  raison: provider ? r.raison : 'aucun fournisseur (--no-llm) : partie déterministe seule',
  appels: r?.stats.appels ?? 0,
  premierEssai: r?.stats.premierEssai ?? 0,
  echecsFormat: r?.stats.echecsFormat ?? 0,
  dureeMs: r?.stats.dureeMs ?? 0,
  jetons: r?.stats.jetons ?? { entree: 0, sortie: 0 },
})

/**
 * La revue d'un changement.
 * @param {{ diffText: string, label?: string, base?: string | null, head?: string | null, depot?: string | null,
 *   message?: string | null, heads?: Record<string, string>, measured?: object | null,
 *   provider?: import('../llm/provider.mjs').Provider | null, maxSegments?: number, maxChars?: number, retries?: number,
 *   contexte?: 'diff' | 'fichier', fichiers?: Record<string, string>, now?: () => Date }} o
 * `contexte: 'fichier'` (AM-4b) montre aux passes, avec chaque segment, le fichier après le changement pris dans `fichiers`
 * (chemin → texte ; un fichier absent n'a que son diff).
 */
export async function reviewChange(o) {
  const { diffText, provider = null, measured = null, maxSegments = 40, maxChars = 6000, retries = 2, contexte = 'diff' } = o
  if (!CONTEXTES.includes(contexte)) throw new Error(`contexte « ${contexte} » : attendu ${CONTEXTES.join(' ou ')}`)
  const classified = classify(parseDiff(diffText), o.heads)
  const lus = classified.filter((x) => !x.info.exclu).map((x) => x.f)
  const redacted = lus.map((f) => ({ path: f.path, lines: redactSecrets(f) }))
  const violations = measured?.violations ?? []
  const deterministes = [...lineFindings(lus), ...secretFindings(redacted), ...violationFindings(violations)]
  const segments = lus.flatMap((f) => segmentFile(f, { maxChars }))
  const ctxOf = (path) => ({
    depot: o.depot ?? null, message: o.message ?? null,
    voisins: measured?.fichiers?.[path] ?? null, metriques: metricsLine(measured?.fichiers?.[path], violations, path),
    fichier: contexte === 'fichier' ? o.fichiers?.[path] ?? null : null,
  })
  const r = provider ? await llmPasses(provider, segments, ctxOf, { maxSegments, retries }) : null
  const constats = sortFindings([...deterministes, ...(r?.constats ?? [])])
  const totaux = totalsOf(constats, r)
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    tool: 'archimetrics',
    date: (o.now?.() ?? new Date()).toISOString(),
    changement: changeOf(o),
    conclusion: totaux.significatifs ? 'constats' : 'rien de significatif',
    llm: llmBlock(provider, r, contexte),
    collecte: {
      fichiers: classified.map((x) => x.info),
      lus: lus.length,
      exclus: classified.length - lus.length,
      segments: segments.length,
      secretsMasques: redacted.reduce((s, x) => s + x.lines.length, 0),
      contexte: contextOf(measured, violations),
    },
    totaux,
    constats,
    ecartes: r?.ecartes ?? [],
    avertissements: r?.avertissements ?? [],
  }
}

const changeOf = (o) => ({ label: o.label ?? null, base: o.base ?? null, head: o.head ?? null, depot: o.depot ?? null, message: o.message ?? null })

function contextOf(measured, violations) {
  if (!measured) return { disponible: false, raison: 'non mesuré', resume: null, fichiers: {}, violations: [] }
  return { disponible: measured.disponible, raison: measured.raison ?? null, resume: measured.resume ?? null, fichiers: measured.fichiers ?? {}, violations }
}

function totalsOf(constats, r) {
  return {
    constats: constats.length,
    significatifs: constats.filter((c) => c.nature !== 'suggestion').length,
    deterministes: constats.filter((c) => c.source === 'déterministe').length,
    llm: constats.filter((c) => c.source === 'llm').length,
    ecartes: r?.ecartes.length ?? 0,
  }
}
