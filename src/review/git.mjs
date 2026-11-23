// LA LECTURE GIT d'une revue (AM-4) : quatre sous-commandes de lecture seulement (`rev-parse`, `log`, `diff`, `show`),
// refusées autrement ; `src/git.mjs` garde sa propre liste pour le reste d'archimetrics. Rien n'est écrit dans le dépôt.

import { execFileSync } from 'node:child_process'

export const REVIEW_READ_ONLY = ['rev-parse', 'log', 'diff', 'show', 'merge-base']
// L'arbre vide de Git : la « base » d'un premier commit.
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/**
 * `git <args>` en lecture seule dans `cwd` ; lève une erreur sur une autre sous-commande ou un échec.
 * @param {string[]} args
 * @param {string} cwd
 * @param {{ run?: typeof execFileSync, onGit?: (args: string[]) => void }} [o]
 */
export function gitRead(args, cwd, { run = execFileSync, onGit } = {}) {
  if (!REVIEW_READ_ONLY.includes(args[0])) throw new Error(`git ${args[0]} refusé : la revue ne lance que ${REVIEW_READ_ONLY.join(', ')}`)
  onGit?.(args)
  return run('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] })
}

const tryRead = (args, cwd, o) => {
  try { return gitRead(args, cwd, o) } catch { return null }
}

/** Le sha complet d'une référence, ou null. */
export function revParse(cwd, ref, o) {
  if (!ref || ref.startsWith('-')) return null
  return tryRead(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd, o)?.trim() || null
}

/**
 * Le changement à revoir : `<commit>` (contre son parent), `<a>..<b>`, `<a>...<b>` (depuis leur base commune) ; HEAD par
 * défaut. Rend `{ base, head, label, single }` (`base` : sha, ou l'arbre vide pour un premier commit).
 * @param {string} cwd
 * @param {string | undefined} range
 */
export function resolveRange(cwd, range = 'HEAD', o) {
  const m = range.match(/^(.+?)(\.\.\.?)(.+)$/)
  const need = (ref) => {
    const sha = revParse(cwd, ref, o)
    if (!sha) throw new Error(`référence introuvable dans ${cwd} : « ${ref} »`)
    return sha
  }
  if (m) {
    const a = need(m[1])
    const head = need(m[3])
    const base = m[2] === '...' ? gitRead(['merge-base', a, head], cwd, o).trim() : a
    return { base, head, label: range, single: false }
  }
  const head = need(range)
  return { base: revParse(cwd, `${head}^`, o) ?? EMPTY_TREE, head, label: range, single: true }
}

/** Le message du commit (un seul) ou la liste des commits (`<court> <titre>`, 50 au plus) d'un intervalle. */
export function messageOf(cwd, { base, head, single }, o) {
  if (single) return gitRead(['log', '-1', '--format=%B', head], cwd, o).trim()
  if (base === EMPTY_TREE) return gitRead(['log', '-50', '--format=%h %s', head], cwd, o).trim()
  return gitRead(['log', '-50', '--format=%h %s', `${base}..${head}`], cwd, o).trim()
}

/** Le diff unifié complet entre deux révisions (renommages suivis, préfixes a/ b/ fixés). */
export function diffOf(cwd, { base, head }, o) {
  return gitRead(['diff', '--no-color', '--no-ext-diff', '--find-renames', '-U3', '--src-prefix=a/', '--dst-prefix=b/', base, head], cwd, o)
}

/** Le début (`max` caractères) d'un fichier à une révision, ou null (supprimé, binaire illisible…). */
export function headOf(cwd, rev, path, max = 600, o) {
  const text = tryRead(['show', `${rev}:${path}`], cwd, o)
  return text === null ? null : text.slice(0, max)
}
