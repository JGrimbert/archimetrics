// L'ÉCRITURE DU RAPPORT dans un dossier (celui que la CI recopie sur la branche des rapports) :
//   README.md, taille.md, complexite.md, couplage.md, redondances.md, organisation.md, historique.md,
//   uml/… (Mermaid), svg/… (images de la page d'accueil), metrics.json (tout le relevé), history.json (un résumé par relevé).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pages } from './markdown.mjs'
import { diagrams } from './mermaid.mjs'
import { carteSvg, evolutionSvg, resumeSvg, risquesSvg } from './svg.mjs'

const MAX_HISTORY = 500

export function readHistory(path) {
  if (!path || !existsSync(path)) return []
  try {
    const h = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(h) ? h : []
  } catch {
    return []
  }
}

function put(out, rel, text) {
  const p = join(out, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, text)
}

export function writeReport(cfg, result, model, check, { out, historyIn = null }) {
  // Le dossier est vidé à chaque relevé : un diagramme qui n'a plus lieu d'être ne traîne pas sur la branche.
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const history = readHistory(historyIn ?? join(out, 'history.json')).filter((h) => h.commit !== result.commit || !result.commit)
  const previous = history[history.length - 1] ?? null
  const entry = { date: result.date, commit: result.commit, summary: result.summary }
  const nextHistory = [...history, entry].slice(-MAX_HISTORY)

  for (const p of pages(result, check, previous)) put(out, p.path, p.body)
  for (const d of diagrams(cfg, model, result)) put(out, join('uml', d.path), d.raw ? d.body : `# ${d.title}\n\n${d.body}`)
  put(out, 'svg/resume.svg', resumeSvg(result, previous, check))
  put(out, 'svg/evolution.svg', evolutionSvg(nextHistory))
  put(out, 'svg/carte.svg', carteSvg(result, model))
  put(out, 'svg/risques.svg', risquesSvg(result))
  put(out, 'metrics.json', JSON.stringify({ ...result, check: check ? { ok: check.ok, added: check.added, resolved: check.resolved, tolerated: check.tolerated } : null }, null, 1))
  put(out, 'history.json', JSON.stringify(nextHistory, null, 1))
  return { out, history: nextHistory }
}
