// LES APPELS À GIT, tous ici : archimetrics ne fait que lire un dépôt. Chaque appel passe par `git()`, qui refuse toute
// sous-commande hors de la liste de lecture (`READ_ONLY`) et prévient un observateur éventuel (`onGit`, pour les tests).

import { execFileSync } from 'node:child_process'

// Sous-commandes permises : aucune n'écrit dans le dépôt (`archive -o` écrit hors du dépôt, dans le dossier temporaire).
export const READ_ONLY = ['rev-parse', 'archive', 'log', 'status', 'ls-files', 'remote']

let observer = null

/** Observe chaque appel (`fn(args, cwd)`) ; rend la fonction qui arrête l'observation. */
export function onGit(fn) {
  observer = fn
  return () => { observer = null }
}

/**
 * Lance `git <args>` dans `cwd` et rend sa sortie (texte, ou octets avec `encoding: 'buffer'`). Lève une erreur si la
 * sous-commande n'est pas une commande de lecture, ou si git échoue.
 * @param {string[]} args
 * @param {{ cwd: string, encoding?: BufferEncoding | 'buffer', maxBuffer?: number }} opts
 */
export function git(args, { cwd, encoding = 'utf8', maxBuffer = 1 << 28 }) {
  if (!READ_ONLY.includes(args[0])) throw new Error(`git ${args[0]} refusé : archimetrics ne lance que des commandes de lecture`)
  observer?.(args, cwd)
  return execFileSync('git', args, { cwd, encoding, maxBuffer, stdio: ['ignore', 'pipe', 'ignore'] })
}

/** Comme `git()`, mais rend `null` au lieu de lever une erreur (pas de dépôt, git absent…). */
export function tryGit(args, opts) {
  try {
    return git(args, opts)
  } catch {
    return null
  }
}
