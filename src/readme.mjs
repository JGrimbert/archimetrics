// LE BLOC DU README DU PROJET : les images et les liens de la branche des rapports, posés une fois entre deux marqueurs.
// Les images sont lues sur la branche (raw.githubusercontent.com) : elles se mettent à jour sans aucun commit sur la branche
// du code. L'adresse du dépôt vient de `publish.repo` (« propriétaire/nom »), sinon du remote `origin`.

import { execFileSync } from 'node:child_process'

export const START = '<!-- archimetrics:debut -->'
export const END = '<!-- archimetrics:fin -->'

export function repoSlug(cfg) {
  if (cfg.publish.repo) return cfg.publish.repo
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: cfg.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export function readmeBlock(cfg) {
  const slug = repoSlug(cfg) ?? 'PROPRIETAIRE/DEPOT'
  const br = cfg.publish.branch
  const raw = (p) => `https://raw.githubusercontent.com/${slug}/${br}/${p}`
  const page = (p) => `https://github.com/${slug}/blob/${br}/${p}`
  return [
    START,
    '## Métriques du code',
    '',
    `Relevées à chaque passage sur la branche principale par [archimetrics](https://github.com/JGrimbert/archimetrics), publiées sur la branche [\`${br}\`](https://github.com/${slug}/tree/${br}) (historique séparé de celui du code).`,
    '',
    `[![Résumé des métriques](${raw('svg/resume.svg')})](${page('README.md')})`,
    '',
    `[![Évolution](${raw('svg/evolution.svg')})](${page('README.md')})`,
    '',
    `[![Carte du code](${raw('svg/carte.svg')})](${page('uml/README.md')})`,
    '',
    `[![Points chauds](${raw('svg/risques.svg')})](${page('historique.md')})`,
    '',
    `Rapport complet : [tailles](${page('taille.md')}) · [complexité](${page('complexite.md')}) · [couplage et cohésion](${page('couplage.md')}) · [redondances](${page('redondances.md')}) · [organisation](${page('organisation.md')}) · [historique](${page('historique.md')}) · [diagrammes](${page('uml/README.md')})`,
    END,
  ].join('\n')
}

export function updateReadme(text, block) {
  const a = text.indexOf(START)
  const b = text.indexOf(END)
  if (a >= 0 && b > a) return text.slice(0, a) + block + text.slice(b + END.length)
  return (text.trimEnd() ? text.trimEnd() + '\n\n' : '') + block + '\n'
}
