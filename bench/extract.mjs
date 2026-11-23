// LES DIFFS DU BANC (D-034, option (b)) : un cas d'ArchiMetrics porte son diff figé (`diff`, sous `cas/`) ; un cas d'un
// autre dépôt (scribe, privé) ne porte que sa référence (`depot`, `source.commit`, `source.mode`, `fichiers`), et son diff
// est extrait à la volée, EN MÉMOIRE, du dépôt local : `git show` (direct) ou `git diff <c> <c>^` (inverse : le correctif
// renversé). Rien n'est écrit, ni dans le dépôt lu ni dans le banc. Seules `show` et `diff` sont lancées (lecture).
// Le chemin d'un dépôt vient de `--repo <nom>=<chemin>`, sinon de `bench/depots.local.json` (ignoré par Git).

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const READ_ONLY = ['show', 'diff']
export const LOCAL_REPOS = 'depots.local.json'

/** Les chemins des dépôts : `depots.local.json` du banc, puis ceux passés en argument (qui l'emportent). */
export function repoPaths(dir, given = {}) {
  const file = join(dir, LOCAL_REPOS)
  let local = {}
  if (existsSync(file)) {
    try {
      local = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      throw new Error(`${file} illisible : ${e.message}`)
    }
  }
  return { ...local, ...given }
}

/** `git <args>` en lecture seule dans `cwd` ; refuse toute autre sous-commande. */
export function gitRead(args, cwd, run = execFileSync) {
  if (!READ_ONLY.includes(args[0])) throw new Error(`git ${args[0]} refusé : le banc ne lance que ${READ_ONLY.join(' et ')}`)
  return run('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Les arguments git qui extraient le diff d'un cas référencé. */
export function extractArgs(cas) {
  const c = cas.source.commit
  const common = ['--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/']
  if (cas.source.mode === 'inverse') return ['diff', ...common, c, `${c}^`, '--', ...cas.fichiers]
  if (cas.source.mode === 'direct') return ['show', ...common, '--format=', c, '--', ...cas.fichiers]
  throw new Error(`${cas.id} : mode « ${cas.source.mode} » non extractible (seuls inverse et direct le sont)`)
}

/**
 * Le texte du diff d'un cas (fins de ligne LF), ou `{ indisponible }` : dépôt non configuré, absent, commit introuvable.
 * @param {object} cas
 * @param {{ dir: string, repos: Record<string, string>, run?: typeof execFileSync }} o
 * @returns {{ diffText: string } | { indisponible: string }}
 */
export function caseDiff(cas, { dir, repos, run }) {
  const lf = (s) => s.replace(/\r\n/g, '\n')
  if (cas.diff) return { diffText: lf(readFileSync(join(dir, cas.diff), 'utf8')) }
  const root = repos[cas.depot]
  if (!root) return { indisponible: `dépôt ${cas.depot} non configuré (--repo ${cas.depot}=<chemin> ou bench/${LOCAL_REPOS})` }
  if (!existsSync(root)) return { indisponible: `dépôt ${cas.depot} absent : ${root}` }
  try {
    const text = lf(gitRead(extractArgs(cas), root, run))
    return text.trim() ? { diffText: text } : { indisponible: `diff vide : ${cas.source.commit} -- ${cas.fichiers.join(' ')}` }
  } catch (e) {
    return { indisponible: `extraction impossible dans ${cas.depot} : ${String(e.stderr || e.message).trim().split('\n')[0]}` }
  }
}
