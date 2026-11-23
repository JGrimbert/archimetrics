// LA REVUE EN MARKDOWN (`review.md`, AM-4) : distincte du rapport déterministe (`archimetrics report`) : conclusion,
// constats (gravité, fichier:ligne, nature, source, preuve, conséquence, correction), ce qui n'a pas été lu et pourquoi,
// l'état du LLM, les constats écartés par les filtres.

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const code = (s) => (s ? `\`${String(s).replace(/`/g, 'ʼ')}\`` : '—')
const where = (c) => `${c.fichier}${c.ligne ? `:${c.ligne}` : ''}`

function llmLine(l) {
  if (l.statut === 'éteint') return `LLM éteint : ${l.raison}.`
  if (l.statut === 'indisponible') return `LLM indisponible (${esc(l.raison)}) : partie déterministe seule.`
  return `LLM : ${l.fournisseur} · ${l.modele}${l.distant ? ' · **distant**' : ''} · consigne ${l.consigne} · ${l.appels} appel(s), `
    + `${l.premierEssai} au 1er essai · ${(l.dureeMs / 1000).toFixed(1)} s · ${l.jetons.sortie} jetons de sortie.`
}

function findingsMd(constats) {
  if (!constats.length) return ['Aucun constat.']
  const out = ['| # | Gravité | Où | Nature | Source | Constat | Preuve | Conséquence | Correction |', '|---|---|---|---|---|---|---|---|---|']
  for (const c of constats) {
    out.push(`| ${c.id} | ${c.gravite} | ${code(where(c))} | ${c.nature} | ${c.source} | ${esc(c.description)} | ${code(esc(c.preuve))} | ${esc(c.consequence)} | ${esc(c.correction)} |`)
  }
  return out
}

/** Le Markdown d'un document `archimetrics.review/1`. */
export function reviewMarkdown(doc) {
  const ch = doc.changement
  const excl = doc.collecte.fichiers.filter((f) => f.exclu)
  const lines = [
    `# Revue — ${ch.label ?? 'changement'}${ch.depot ? ` (${ch.depot})` : ''}`,
    '',
    `**Conclusion : ${doc.conclusion}** — ${doc.totaux.significatifs} constat(s) avéré(s) ou risqué(s), ${doc.totaux.constats - doc.totaux.significatifs} suggestion(s) ; `
      + `${doc.totaux.deterministes} déterministe(s), ${doc.totaux.llm} du LLM.`,
    '',
    llmLine(doc.llm),
    '',
    `${doc.collecte.fichiers.length} fichier(s) dans le diff, ${doc.collecte.lus} lu(s) en ${doc.collecte.segments} segment(s)`
      + `${doc.collecte.secretsMasques ? `, ${doc.collecte.secretsMasques} ligne(s) de secret masquée(s)` : ''}.`,
    '',
    '## Constats',
    '',
    ...findingsMd(doc.constats),
  ]
  if (excl.length) lines.push('', '## Non lus', '', ...excl.map((f) => `- ${code(f.path)} : ${f.exclu.raison} (${esc(f.exclu.indice)})`))
  if (doc.ecartes.length) lines.push('', `## Écartés par les filtres (${doc.ecartes.length})`, '', ...doc.ecartes.map((e) => `- ${code(e.fichier)} : ${esc(e.description)} — ${esc(e.raison)}`))
  if (doc.avertissements.length) lines.push('', '## Avertissements', '', ...doc.avertissements.map((a) => `- ${esc(a)}`))
  return `${lines.join('\n')}\n`
}
