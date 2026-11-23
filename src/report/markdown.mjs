// LES PAGES DU RAPPORT (Markdown, lues sur GitHub dans la branche des rapports) : l'accueil, puis une page par famille de
// mesures. Aucun texte de code n'y figure : des chemins, des noms de fonctions et des nombres.

import { RULES } from '../metrics/index.mjs'
import { code, delta, fr, table } from './format.mjs'

const L = (n) => (n === Infinity ? '+' : fr(n))
const hist = (h, unit) => table(['Tranche', 'Nombre'], h.map((b, i) => [i === 0 ? `≤ ${L(b.max)}${unit}` : b.max === Infinity ? `> ${L(h[i - 1].max)}${unit}` : `${L(h[i - 1].max + 1)}–${L(b.max)}${unit}`, fr(b.n)]), ['', 'r'])

function violationsTable(result, check, rule, n = 30) {
  const list = result.violations[rule] ?? []
  const added = new Set((check?.added[rule] ?? []).map((v) => v.key))
  return table(['', 'Où', 'Valeur', 'Seuil', 'Détail'], list.slice(0, n).map((v) => [added.has(v.key) ? '🆕' : check ? 'toléré' : '', code(v.key), fr(v.value ?? ''), fr(v.limit ?? ''), v.detail ?? '']), ['', '', 'r', 'r', '']) + (list.length > n ? `\n_… et ${list.length - n} de plus (metrics.json)._\n` : '')
}

export function pages(result, check, previous) {
  const s = result.summary
  const p = previous?.summary
  const lim = result.limits
  const out = []

  // Accueil.
  const rows = [
    ['Lignes de code (hors tests)', fr(s.codeLines), delta(s.codeLines, p?.codeLines)],
    ['Fichiers de code / de test', `${fr(s.files)} / ${fr(s.testFiles)}`, ''],
    ['Lignes de test', fr(s.testCodeLines), delta(s.testCodeLines, p?.testCodeLines, false)],
    ['Fonctions', fr(s.functions), ''],
    ['Complexité cyclomatique moyenne', fr(s.cyclomaticAvg), delta(s.cyclomaticAvg, p?.cyclomaticAvg)],
    ['Complexité cognitive moyenne', fr(s.cognitiveAvg), delta(s.cognitiveAvg, p?.cognitiveAvg)],
    ['Duplication', fr(s.duplicationPercent) + ' %', delta(s.duplicationPercent, p?.duplicationPercent)],
    ["Cycles d'imports", fr(s.cycles), delta(s.cycles, p?.cycles)],
    ['Exports jamais importés', fr(s.deadExports), delta(s.deadExports, p?.deadExports)],
    ['Violations des seuils', fr(s.violations), delta(s.violations, p?.violations)],
  ]
  const ruleRows = Object.entries(RULES).map(([k, lab]) => [lab, fr(result.violations[k]?.length ?? 0), check ? fr(check.added[k]?.length ?? 0) : '—', check ? fr(check.resolved[k]?.length ?? 0) : '—'])
  out.push({
    path: 'README.md',
    body: [
      `# ${result.name} — métriques du code`,
      '',
      `Relevé du ${new Date(result.date).toLocaleString('fr-FR')}${result.commit ? `, commit \`${result.commit}\`` : ''}, par [archimetrics](https://github.com/JGrimbert/archimetrics). Cette branche est écrite par la CI ; son historique est séparé de celui du code.`,
      '',
      '![Résumé](svg/resume.svg)',
      '',
      '![Évolution](svg/evolution.svg)',
      '',
      '![Carte du code](svg/carte.svg)',
      '',
      '![Points chauds](svg/risques.svg)',
      '',
      '## Chiffres',
      '',
      table(['Mesure', 'Valeur', 'Depuis le relevé précédent'], rows, ['', 'r', '']),
      '## Garde-fous',
      '',
      check ? (check.ok ? '✅ Aucune violation nouvelle.' : `❌ ${fr(check.nAdded)} violation(s) nouvelle(s)${check.nResolved ? `, ${fr(check.nResolved)} résorbée(s) encore dans la baseline` : ''}.`) : '_Pas de baseline : toutes les violations sont listées sans jugement._',
      '',
      table(['Règle', 'Violations', 'Nouvelles', 'Résorbées'], ruleRows, ['', 'r', 'r', 'r']),
      '## Pages',
      '',
      '- [Tailles](taille.md) — fichiers et fonctions trop longs',
      '- [Complexité](complexite.md) — cyclomatique, cognitive, imbrication',
      '- [Couplage et cohésion](couplage.md) — dépendances, instabilité, cycles, LCOM4, exports morts',
      '- [Redondances](redondances.md) — clones au renommage près',
      '- [Organisation](organisation.md) — dossiers, docs de dossier',
      '- [Historique Git](historique.md) — points chauds, couplage temporel',
      '- [Diagrammes](uml/README.md) — vue d’ensemble, groupes, classes, composants, données',
      '',
      `Seuils : fichier ${fr(lim.fileCodeLines)} lignes de code · fonction ${fr(lim.functionLines)} lignes, ${fr(lim.params)} paramètres, cyclomatique ${fr(lim.cyclomatic)}, cognitive ${fr(lim.cognitive)}, imbrication ${fr(lim.nesting)} · dossier ${fr(lim.filesPerDir)} fichiers · doc ${fr(lim.docMaxLines)} lignes.`,
      '',
      result.warnings.length ? `<details><summary>${result.warnings.length} avertissement(s)</summary>\n\n${result.warnings.map((w) => '- ' + w).join('\n')}\n</details>\n` : '',
    ].join('\n'),
  })

  // Tailles.
  out.push({
    path: 'taille.md',
    body: [
      '# Tailles',
      '',
      `Lignes de code : ni commentaires ni lignes vides ; un composant .vue compte ses trois blocs. Tests à part.`,
      '',
      '## Par langue',
      '',
      table(['Langue', 'Fichiers', 'Lignes de code', 'Fichiers de test', 'Lignes de test'], Object.entries(result.sizes.byLang).map(([k, v]) => [k, fr(v.files), fr(v.codeLines), fr(v.testFiles), fr(v.testCodeLines)]), ['', 'r', 'r', 'r', 'r']),
      '## Par groupe',
      '',
      table(['Groupe', 'Chemin', 'Fichiers', 'Lignes de code', 'Fonctions'], result.groups.map((g) => [g.name, code(g.path || '.'), fr(g.files), fr(g.codeLines), fr(g.functions)]), ['', '', 'r', 'r', 'r']),
      '## Répartition des fichiers',
      '',
      hist(result.sizes.histogram, ' l.'),
      `## Fichiers au-delà de ${fr(lim.fileCodeLines)} lignes de code`,
      '',
      violationsTable(result, check, 'fileCodeLines'),
      `## Fonctions au-delà de ${fr(lim.functionLines)} lignes`,
      '',
      violationsTable(result, check, 'functionLines'),
      `## Fonctions à plus de ${fr(lim.params)} paramètres`,
      '',
      violationsTable(result, check, 'params'),
    ].join('\n'),
  })

  // Complexité.
  const f = result.functions
  out.push({
    path: 'complexite.md',
    body: [
      '# Complexité',
      '',
      `${fr(f.count)} fonctions. Cyclomatique (McCabe) : nombre de chemins indépendants. Cognitive (SonarSource, approchée) : l'effort de lecture — chaque structure de contrôle pèse plus lourd quand elle est imbriquée. Une fonction imbriquée est mesurée à part.`,
      '',
      table(['', 'Moyenne', '90e centile'], [['Lignes de code', fr(f.average.codeLines), fr(f.p90.codeLines)], ['Cyclomatique', fr(f.average.cyclomatic), fr(f.p90.cyclomatic)], ['Cognitive', fr(f.average.cognitive), fr(f.p90.cognitive)]], ['', 'r', 'r']),
      '## Répartition (cyclomatique)',
      '',
      hist(f.cyclomaticHistogram, ''),
      '## Les plus complexes',
      '',
      table(['Fichier', 'Fonction', 'Ligne', 'Cognitive', 'Cyclomatique', 'Imbrication', 'Lignes'], f.mostComplex.map((x) => [code(x.file), code(x.name), x.line, fr(x.cognitive), fr(x.cyclomatic), x.nesting, fr(x.codeLines)]), ['', '', 'r', 'r', 'r', 'r', 'r']),
      `## Cyclomatique au-delà de ${fr(lim.cyclomatic)}`,
      '',
      violationsTable(result, check, 'cyclomatic'),
      `## Cognitive au-delà de ${fr(lim.cognitive)}`,
      '',
      violationsTable(result, check, 'cognitive'),
      `## Imbrication au-delà de ${fr(lim.nesting)}`,
      '',
      violationsTable(result, check, 'nesting'),
    ].join('\n'),
  })

  // Couplage.
  const c = result.coupling
  const groupsNames = result.groups.map((g) => g.name)
  const matrixRows = groupsNames.map((a) => [a, ...groupsNames.map((b) => (a === b ? '·' : fr(c.matrix[a]?.[b] ?? 0)))])
  const mods = c.modules.filter((m) => m.ca + m.ce > 0)
  out.push({
    path: 'couplage.md',
    body: [
      '# Couplage et cohésion',
      '',
      `${fr(c.edges)} imports entre fichiers du projet (tests exclus).`,
      '',
      '## Entre groupes',
      '',
      'Imports de la ligne vers la colonne.',
      '',
      table(['de \\ vers', ...groupsNames], matrixRows, ['', ...groupsNames.map(() => 'r')]),
      '## Dossiers les plus liés',
      '',
      'Ca : dossiers qui dépendent de lui · Ce : dossiers dont il dépend · Instabilité I = Ce / (Ca + Ce) : 0, une fondation que tout le monde emploie (à garder stable) ; 1, une feuille qui n’est employée par personne. Cohésion : part de ses imports qui restent dans le dossier.',
      '',
      table(['Dossier', 'Fichiers', 'Ca', 'Ce', 'I', 'Cohésion'], mods.slice(0, 30).map((m) => [code(m.dir), fr(m.files), fr(m.ca), fr(m.ce), fr(m.instability), m.cohesion == null ? '—' : fr(Math.round(m.cohesion * 100)) + ' %']), ['', 'r', 'r', 'r', 'r', 'r']),
      '## Fichiers les plus importés',
      '',
      table(['Fichier', 'Importeurs'], c.fanIn.map((x) => [code(x.file), fr(x.n)]), ['', 'r']),
      '## Fichiers qui importent le plus',
      '',
      table(['Fichier', 'Imports internes'], c.fanOut.map((x) => [code(x.file), fr(x.n)]), ['', 'r']),
      "## Cycles d'imports",
      '',
      c.cycles.length ? c.cycles.map((cy, i) => `${i + 1}. ${cy.map(code).join(' ↔ ')}`).join('\n') + '\n' : '_Aucun cycle (imports de type seul et dynamiques exclus)._\n',
      '## Classes peu cohésives (LCOM4)',
      '',
      'LCOM4 : nombre de groupes de méthodes qui ne partagent aucun champ ni appel. 1 : la classe tient ensemble ; au-delà, elle porte plusieurs responsabilités séparables.',
      '',
      table(['Fichier', 'Classe', 'LCOM4', 'Méthodes'], c.classes.lowCohesion.map((x) => [code(x.file), code(x.name), fr(x.lcom4), fr(x.methods)]), ['', '', 'r', 'r']),
      '## Classes aux injections les plus nombreuses',
      '',
      table(['Fichier', 'Classe', 'Injections'], c.classes.mostInjected.map((x) => [code(x.file), code(x.name), fr(x.injections)]), ['', '', 'r']),
      '## Dépendances externes',
      '',
      table(['Paquet', 'Fichiers qui l’importent'], c.external.slice(0, 30).map((x) => [code(x.name), fr(x.files)]), ['', 'r']),
      '## Exports jamais importés (indicatif)',
      '',
      `${fr(c.deadExports.length)} export(s) qu'aucun fichier n'importe (tests compris ; les types exportés ne comptent pas). Un export employé seulement dans son fichier peut perdre son \`export\`.`,
      '',
      table(['Fichier', 'Export'], c.deadExports.slice(0, 60).map((x) => [code(x.file), code(x.name)])),
      '## Fichiers sans importeur (indicatif)',
      '',
      `${fr(c.orphans.length)} fichier(s) que rien n'importe, points d'entrée connus exclus (main, index, configs, bin…). Un script lancé à la main y figure normalement.`,
      '',
      c.orphans.slice(0, 80).map((o) => '- ' + code(o)).join('\n') + '\n',
      c.unresolved.length ? `## Imports non résolus\n\n${table(['Fichier', 'Import'], c.unresolved.map((u) => [code(u.from), code(u.spec)]))}` : '',
    ].join('\n'),
  })

  // Redondances.
  const d = result.duplication
  out.push({
    path: 'redondances.md',
    body: [
      '# Redondances',
      '',
      `Clones « au renommage près » : suites d'au moins ${fr(d.minTokens)} jetons identiques une fois les identifiants et les littéraux fondus (imports exclus). ${fr(d.clones)} clone(s), ${fr(d.duplicatedLines)} lignes de code couvertes : **${fr(d.percent)} %**.`,
      '',
      '## Les plus longs',
      '',
      table(['Jetons', 'Première place', 'Seconde place'], d.largest.map((x) => [fr(x.tokens), `${code(x.a.file)} l. ${x.a.start}–${x.a.end}`, `${code(x.b.file)} l. ${x.b.start}–${x.b.end}`]), ['r', '', '']),
      '## Fichiers les plus dupliqués',
      '',
      table(['Fichier', 'Lignes dans un clone', 'Part du fichier'], d.perFile.map((x) => [code(x.file), fr(x.lines), x.ratio + ' %']), ['', 'r', 'r']),
    ].join('\n'),
  })

  // Organisation.
  const o = result.organisation
  out.push({
    path: 'organisation.md',
    body: [
      '# Organisation',
      '',
      `${fr(o.dirs)} dossiers de code ; le plus peuplé compte ${fr(o.maxFilesPerDir)} fichiers directs (tests à part). ${fr(o.docs.count)} docs de dossier, ${fr(o.docs.totalLines)} lignes en tout.`,
      '',
      '## Dossiers les plus peuplés',
      '',
      table(['Dossier', 'Fichiers'], o.crowded.map((x) => [code(x.dir), fr(x.files)]), ['', 'r']),
      '## Docs les plus longues',
      '',
      table(['Doc', 'Lignes'], o.docs.longest.map((x) => [code(x.file), fr(x.lines)]), ['', 'r']),
      `## Dossiers au-delà de ${fr(lim.filesPerDir)} fichiers`,
      '',
      violationsTable(result, check, 'filesPerDir'),
      `## Docs au-delà de ${fr(lim.docMaxLines)} lignes`,
      '',
      violationsTable(result, check, 'docMaxLines'),
      '## Dossiers sans doc',
      '',
      lim.docRequiredFrom ? violationsTable(result, check, 'docRequired') : '_Règle désactivée (`limits.docRequiredFrom`)._\n',
      '## Chemins morts dans les docs',
      '',
      'Un chemin cité (entre accents graves ou en lien) qui ne mène à rien : ni depuis le dossier de la doc, ni depuis un parent, ni comme fin de chemin d’un fichier du dépôt.',
      '',
      violationsTable(result, check, 'docLinks', 80),
    ].join('\n'),
  })

  // Historique.
  const h = result.history
  out.push({
    path: 'historique.md',
    body: [
      '# Historique Git',
      '',
      h.available ? `${fr(h.commits)} commits sur les ${h.months} derniers mois.` : '_Historique indisponible._',
      '',
      '## Points chauds',
      '',
      'Un fichier souvent modifié ET complexe est là où la dette coûte le plus (Adam Tornhill).',
      '',
      table(['Fichier', 'Commits', 'Complexité', 'Lignes', 'Score'], h.hotspots.map((x) => [code(x.file), fr(x.commits), fr(x.complexity), fr(x.codeLines), fr(x.score)]), ['', 'r', 'r', 'r', 'r']),
      '## Couplage temporel',
      '',
      'Deux fichiers qui changent ensemble. Sans import direct entre eux, la dépendance est cachée (un contrat implicite, un format partagé, une logique en miroir).',
      '',
      table(['Fichier', 'Fichier', 'Commits communs', 'Degré', 'Import direct'], h.temporal.map((x) => [code(x.a), code(x.b), fr(x.shared), fr(Math.round(x.degree * 100)) + ' %', x.imports ? 'oui' : '**non**']), ['', '', 'r', 'r', '']),
    ].join('\n'),
  })
  return out
}

// Le compte rendu du garde-fou (console et résumé du job GitHub).
export function checkMarkdown(result, check) {
  const lines = [`## archimetrics — ${result.name}`, '']
  if (!check) {
    lines.push(`Pas de baseline (\`${result.baselinePath ?? 'archimetrics.baseline.json'}\`) : ${fr(result.summary.violations)} violation(s), aucune jugée. \`archimetrics baseline\` la crée.`)
    return lines.join('\n') + '\n'
  }
  lines.push(check.ok ? '✅ Garde-fous : aucune violation nouvelle.' : `❌ Garde-fous : ${fr(check.nAdded)} violation(s) nouvelle(s), ${fr(check.nResolved)} résorbée(s) à retirer de la baseline.`, '')
  lines.push(`${fr(check.tolerated)} violation(s) tolérée(s) par la baseline.`, '')
  for (const [rule, list] of Object.entries(check.added)) {
    lines.push(`### 🆕 ${RULES[rule] ?? rule}`, '')
    for (const v of list.slice(0, 40)) lines.push(`- ${code(v.key)}${v.value != null ? ` — ${fr(v.value)}${v.limit != null ? ` (seuil ${fr(v.limit)})` : ''}` : ''}`)
    if (list.length > 40) lines.push(`- … et ${list.length - 40} de plus`)
    lines.push('')
  }
  for (const [rule, keys] of Object.entries(check.resolved)) {
    lines.push(`### ✔ Résorbées — ${RULES[rule] ?? rule} (à retirer de la baseline)`, '')
    for (const k of keys.slice(0, 40)) lines.push(`- ${code(k)}`)
    lines.push('')
  }
  return lines.join('\n') + '\n'
}
