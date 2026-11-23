// LA COLLECTE d'une revue dans un dépôt (AM-4) : le changement (`<commit>`, `<a>..<b>`, `<a>...<b>` ; HEAD par défaut),
// son message, son diff, le début de chaque fichier après le changement (pour reconnaître le code généré), puis le
// contexte mesuré (voisins par le graphe d'imports, métriques avant/après, violations touchées : `context.mjs`).
// Lecture seule : `git.mjs` (rev-parse, log, diff, show, merge-base) et `git archive` vers un dossier temporaire.

import { basename } from 'node:path'
import { measuredContext } from './context.mjs'
import { parseDiff } from './diff.mjs'
import { diffOf, headOf, messageOf, resolveRange } from './git.mjs'
import { classify, reviewChange } from './index.mjs'

/**
 * La revue d'un changement du dépôt `root`.
 * @param {{ root: string, range?: string, provider?: object | null, metrics?: boolean, maxSegments?: number,
 *   maxChars?: number, retries?: number, onGit?: (args: string[]) => void }} o
 */
export async function reviewRepo({ root, range, provider = null, metrics = true, onGit, ...rest }) {
  const g = { onGit }
  const r = resolveRange(root, range, g)
  const diffText = diffOf(root, r, g)
  const files = parseDiff(diffText)
  const heads = Object.fromEntries(files.filter((f) => !f.binary).map((f) => [f.path, headOf(root, r.head, f.path, 600, g)]).filter(([, h]) => h !== null))
  const lus = classify(files, heads).filter((x) => !x.info.exclu && x.info.statut !== 'supprimé').map((x) => x.f.path)
  const measured = metrics && lus.length ? measuredContext(root, r, lus) : null
  return reviewChange({
    ...rest, diffText, heads, measured, provider,
    label: r.label, base: r.base, head: r.head, depot: basename(root), message: messageOf(root, r, g),
  })
}
