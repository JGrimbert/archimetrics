// LES CONSTATS DÉTERMINISTES d'une revue (AM-4), sans LLM : ce qu'une règle sûre voit dans les lignes AJOUTÉES (marqueur
// de conflit, `.only` dans un test, `debugger`, secret en clair) et les VIOLATIONS NOUVELLES des garde-fous dans les
// fichiers touchés (le relevé avant/après). Toujours calculés : c'est la revue quand le LLM est éteint.

const TEST_FILE = /(^|\/)(test|tests|__tests__|e2e|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/
const SCRIPT = /\.([cm]?[jt]sx?|vue|svelte)$/

/** Les règles sur une ligne ajoutée : `{ regle, test(path, text), gravite, nature, description, consequence, correction }`. */
export const LINE_RULES = [
  {
    regle: 'marqueur-de-conflit',
    test: (p, t) => /^(<{7}|>{7}) /.test(t),
    gravite: 'haute', nature: 'avéré',
    description: 'marqueur de conflit de fusion laissé dans le fichier',
    consequence: 'le fichier ne se lit plus (erreur de syntaxe ou contenu doublé)',
    correction: 'résoudre le conflit et retirer les marqueurs',
  },
  {
    regle: 'test-only',
    test: (p, t) => TEST_FILE.test(p) && /\b(describe|it|test|context)\.only\s*\(/.test(t),
    gravite: 'moyenne', nature: 'avéré',
    description: '`.only` ajouté dans un test : les autres tests du fichier ne tournent plus',
    consequence: 'la suite paraît verte en ne lançant qu’une partie des tests',
    correction: 'retirer `.only`',
  },
  {
    regle: 'debugger',
    test: (p, t) => SCRIPT.test(p) && /^\s*debugger\s*;?\s*$/.test(t),
    gravite: 'basse', nature: 'avéré',
    description: 'instruction `debugger` ajoutée',
    consequence: 'l’exécution s’arrête quand les outils de développement sont ouverts',
    correction: 'retirer `debugger`',
  },
]

const finding = (o) => ({ source: 'déterministe', ...o })

/**
 * Les constats des règles de ligne sur les fichiers lus (après masquage des secrets).
 * @param {import('./diff.mjs').FileDiff[]} files
 */
export function lineFindings(files) {
  const out = []
  for (const f of files) {
    for (const l of f.hunks.flatMap((h) => h.lines.filter((x) => x.kind === '+'))) {
      for (const r of LINE_RULES.filter((x) => x.test(f.path, l.text))) {
        const { regle, gravite, nature, description, consequence, correction } = r
        out.push(finding({ regle, gravite, nature, fichier: f.path, ligne: l.newLine, preuve: `+${l.text.trim()}`.slice(0, 200), description, consequence, correction }))
      }
    }
  }
  return out
}

/** Les constats des secrets masqués dans des lignes ajoutées (leur valeur n'apparaît nulle part). */
export function secretFindings(redacted) {
  return redacted.flatMap(({ path, lines }) => lines.filter((l) => l.kind === '+').map((l) => finding({
    regle: 'secret', gravite: 'haute', nature: 'risque', fichier: path, ligne: l.line,
    preuve: `ligne masquée (${l.motif})`,
    description: `ce qui ressemble à un secret (${l.motif}) est ajouté en clair`,
    consequence: 'le secret est publié avec le dépôt et reste dans son historique',
    correction: 'le retirer, le révoquer, et le lire depuis l’environnement',
  })))
}

/** Les constats des violations nouvelles qui touchent les fichiers du changement. */
export function violationFindings(violations = []) {
  return violations.filter((v) => v.etat === 'nouvelle').map((v) => finding({
    regle: `violation:${v.regle}`, gravite: v.regle === 'cycles' ? 'moyenne' : 'basse', nature: 'avéré',
    fichier: v.cle.split(/[#: ]/)[0], ligne: null,
    preuve: `${v.regle} : ${v.cle}${v.valeur !== null ? ` = ${v.valeur}` : ''}${v.limite !== null ? ` (limite ${v.limite})` : ''}`,
    description: `violation nouvelle du garde-fou « ${v.regle} »`,
    consequence: '`archimetrics check` échoue sur ce changement, sauf si la baseline la tolère',
    correction: 'réduire la mesure sous la limite, ou l’accepter explicitement dans la baseline',
  }))
}
