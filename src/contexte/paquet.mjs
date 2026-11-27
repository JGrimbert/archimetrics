// LE PAQUET DE CONTEXTE D'UNE TÂCHE (`archimetrics contexte`, AM-8) : les cibles en entier, leurs voisins dans le graphe
// (importés et importeurs, jusqu'à `profondeur`) réduits à leurs signatures et à leur JSDoc, les tests qui importent une
// cible, et une estimation en jetons par section. Au-delà de `budget`, les voisins les plus lointains sont retirés les
// premiers (à distance égale : le plus gros d'abord) ; les cibles ne sont jamais coupées. Lecture seule.

import { exportsOf, relPath, tokens } from './model.mjs'

export const CONTEXTE_SCHEMA = 'archimetrics.contexte/1'

const LANGS = { '.ts': 'ts', '.mts': 'ts', '.cts': 'ts', '.tsx': 'tsx', '.jsx': 'jsx', '.vue': 'vue', '.py': 'python' }
const fence = (text, ext) => {
  const f = text.includes('```') ? '````' : '```'
  return `${f}${LANGS[ext] ?? 'js'}\n${text.replace(/\n$/, '')}\n${f}`
}

// Un argument → { rel, symbol } ou { erreur }. Formes : chemin, `fichier#nom`, `nom` (refusé s'il est ambigu).
export function resolveTarget(model, arg) {
  const hash = arg.lastIndexOf('#')
  if (hash > 0) {
    const rel = relPath(model.cfg.root, arg.slice(0, hash))
    const name = arg.slice(hash + 1)
    const f = model.byRel.get(rel)
    if (!f) return { erreur: `fichier inconnu : ${rel}` }
    return exportsOf(f).some((e) => e.name === name) ? { rel, symbol: name } : { erreur: `${rel} n'exporte pas « ${name} »` }
  }
  const rel = relPath(model.cfg.root, arg)
  if (model.byRel.has(rel)) return { rel, symbol: null }
  const found = model.files.filter((f) => !f.test && exportsOf(f).some((e) => e.name === arg && e.kind !== 'reexport')).map((f) => f.rel)
  if (found.length === 1) return { rel: found[0], symbol: arg }
  if (!found.length) return { erreur: `ni fichier ni symbole exporté : « ${arg} »` }
  return { erreur: `symbole ambigu « ${arg} » : ${found.map((r) => `${r}#${arg}`).join(', ')} (préciser fichier#nom)`, ambigu: found }
}

function targetSection(model, t) {
  const f = model.byRel.get(t.rel)
  const lines = model.read(t.rel).split('\n')
  let a = 1
  let b = lines.length
  if (t.symbol) {
    const e = exportsOf(f).find((x) => x.name === t.symbol)
    if (e.line) [a, b] = [e.docLine ?? e.line, e.endLine]
  }
  const texte = lines.slice(a - 1, b).join('\n')
  const titre = t.symbol ? `${t.rel}#${t.symbol} (lignes ${a}-${b})` : `${t.rel} (entier)`
  const rendu = `### ${titre}\n\n${fence(texte, f.ext)}\n`
  return { chemin: t.rel, symbole: t.symbol, lignes: [a, b], texte, jetons: tokens(rendu), rendu }
}

// Les importeurs d'un fichier visé par symbole seulement : ceux qui importent l'un de ces symboles (ou tout le module).
function importerFilter(targets) {
  const bySymbol = new Map()
  for (const t of targets) {
    if (!bySymbol.has(t.rel)) bySymbol.set(t.rel, new Set())
    bySymbol.get(t.rel).add(t.symbol)
  }
  return (rel, names) => {
    const s = bySymbol.get(rel)
    if (!s || s.has(null)) return true
    return names.includes('*') || names.some((n) => s.has(n))
  }
}

function neighbours(model, targets, depth) {
  const seen = new Map(targets.map((t) => [t.rel, null]))
  const keep = importerFilter(targets)
  const found = []
  let frontier = [...seen.keys()]
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next = []
    const visit = (from, rel, relation) => {
      const f = model.byRel.get(rel)
      if (f.test) return
      const prev = seen.get(rel)
      if (prev === undefined) {
        const n = { chemin: rel, distance: d, relation: [relation], via: from }
        seen.set(rel, n)
        found.push(n)
        next.push(rel)
      } else if (prev && prev.distance === d && !prev.relation.includes(relation)) prev.relation.push(relation)
    }
    for (const from of frontier) {
      for (const rel of model.out.get(from)?.keys() ?? []) visit(from, rel, 'importé')
      for (const [rel, names] of model.inc.get(from) ?? []) if (d > 1 || keep(from, names)) visit(from, rel, 'importeur')
    }
    frontier = next
  }
  return found.sort((x, y) => x.distance - y.distance || x.chemin.localeCompare(y.chemin))
}

function renderExport(e) {
  return [e.jsdoc, e.jsdoc ? null : e.comment, e.signature].filter(Boolean).join('\n')
}

function neighbourSection(model, n) {
  const f = model.byRel.get(n.chemin)
  const exports = exportsOf(f).map((e) => ({ nom: e.name, genre: e.kind, signature: e.signature, jsdoc: e.jsdoc ?? null, commentaire: e.comment ?? null }))
  const corps = exportsOf(f).map(renderExport).join('\n\n') || '(aucun export)'
  const rendu = `### ${n.chemin} — ${n.relation.join(', ')} · distance ${n.distance}\n\n${fence(corps, f.ext)}\n`
  return { chemin: n.chemin, distance: n.distance, relation: n.relation.sort(), exports, jetons: tokens(rendu), rendu }
}

// Retire les voisins les plus lointains (à distance égale, le plus gros) jusqu'à tenir dans le budget.
function cut(voisins, fixed, budget) {
  const total = () => fixed + voisins.reduce((s, v) => s + v.jetons, 0)
  if (!budget || total() <= budget) return { voisins, coupe: null }
  const order = [...voisins].sort((x, y) => y.distance - x.distance || y.jetons - x.jetons || x.chemin.localeCompare(y.chemin))
  const retires = []
  for (const v of order) {
    if (total() <= budget) break
    voisins = voisins.filter((x) => x !== v)
    retires.push({ chemin: v.chemin, distance: v.distance, jetons: v.jetons })
  }
  const profondeurGardee = voisins.reduce((m, v) => Math.max(m, v.distance), 0)
  return { voisins, coupe: { budget, retires, profondeurGardee, tenu: total() <= budget } }
}

function associatedTests(model, targets) {
  const rels = new Set(targets.map((t) => t.rel))
  const out = new Set()
  for (const rel of rels) for (const from of model.inc.get(rel)?.keys() ?? []) if (model.byRel.get(from).test) out.add(from)
  return [...out].sort().map((chemin) => ({ chemin }))
}

/**
 * Le paquet de contexte. `targets` : [{ rel, symbol }] déjà résolus (`resolveTarget`).
 * @param {any} model `loadModel(...)`
 * @param {{ rel: string, symbol: string | null }[]} targets
 * @param {{ profondeur?: number, budget?: number | null }} [opts]
 */
export function buildPaquet(model, targets, { profondeur = 1, budget = null } = {}) {
  const cibles = targets.map((t) => targetSection(model, t))
  const tests = associatedTests(model, targets)
  const testsRendu = tests.length ? tests.map((t) => `- ${t.chemin}`).join('\n') + '\n' : '(aucun)\n'
  const fixed = cibles.reduce((s, c) => s + c.jetons, 0) + tokens(testsRendu)
  const { voisins, coupe } = cut(neighbours(model, targets, profondeur).map((n) => neighbourSection(model, n)), fixed, budget)
  const jetons = { cibles: cibles.reduce((s, c) => s + c.jetons, 0), voisins: voisins.reduce((s, v) => s + v.jetons, 0), tests: tokens(testsRendu) }
  jetons.total = jetons.cibles + jetons.voisins + jetons.tests
  const inPaquet = new Set([...cibles, ...voisins].map((x) => x.chemin))
  const avertissements = model.warnings.filter((w) => inPaquet.has(w.split(' : ')[0]))
  return { schemaVersion: CONTEXTE_SCHEMA, tool: 'archimetrics', profondeur, budget, cibles, voisins, tests, testsRendu, coupe, jetons, avertissements }
}

function cutText(coupe) {
  if (!coupe) return null
  const list = coupe.retires.map((r) => `${r.chemin} (distance ${r.distance}, ${r.jetons} jetons)`).join(', ')
  const reste = coupe.tenu ? '' : ' — budget toujours dépassé : les cibles ne sont jamais coupées'
  return `Coupé au budget de ${coupe.budget} jetons : voisins gardés jusqu'à la distance ${coupe.profondeurGardee} ; retirés : ${list}${reste}.`
}

export function paquetMarkdown(p) {
  const j = p.jetons
  return [
    `# Paquet de contexte : ${p.cibles.map((c) => (c.symbole ? `${c.chemin}#${c.symbole}` : c.chemin)).join(', ')}`,
    '',
    `Jetons estimés (≈ 4 caractères par jeton) : cibles ${j.cibles} · voisins ${j.voisins} · tests ${j.tests} · total ${j.total}`,
    `Profondeur ${p.profondeur} · ${p.budget ? `budget ${p.budget} jetons` : 'sans budget'}`,
    ...(p.coupe ? ['', cutText(p.coupe)] : []),
    ...p.avertissements.map((w) => `⚠ ${w}`),
    '',
    '## Cibles',
    '',
    ...p.cibles.map((c) => c.rendu),
    `## Voisins (signatures et JSDoc)`,
    '',
    ...(p.voisins.length ? p.voisins.map((v) => v.rendu) : ['(aucun)', '']),
    '## Tests associés',
    '',
    p.testsRendu,
  ].join('\n')
}

// La forme JSON (archimetrics.contexte/1) : sans les rendus Markdown, clés et ordre stables, sans date.
export function paquetJson(p) {
  const cibles = p.cibles.map(({ rendu, ...c }) => c)
  const voisins = p.voisins.map(({ rendu, ...v }) => v)
  const { testsRendu, ...rest } = p
  return { ...rest, cibles, voisins }
}
