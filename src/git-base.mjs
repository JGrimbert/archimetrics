// L'ANALYSE D'UNE RÉVISION sans toucher au dépôt analysé (`archimetrics diff --base <ref> [--head <ref>]`) :
// `git archive` de la révision vers un dossier temporaire (`os.tmpdir()`), extraction, relevé sans Git (`--no-git`),
// puis le dossier temporaire est supprimé. Ni `checkout`, ni `stash`, ni `worktree` : seules des commandes de lecture
// (`rev-parse`, `archive`) sont lancées sur le dépôt, et `src/git.mjs` refuse toute autre.
// Chaque côté est analysé avec SA configuration (`archimetrics.config.json` de la révision, ou de l'arbre de travail).

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compare, readBaseline } from './baseline.mjs'
import { loadConfig } from './config.mjs'
import { git } from './git.mjs'
import { collect } from './metrics/index.mjs'
import { metricsDocument } from './report/index.mjs'
import { untar } from './tar.mjs'

/** Résout une référence en commit : `{ sha, short }` ; lève une erreur claire si elle n'existe pas. */
export function resolveRef(root, ref) {
  if (!ref || ref.startsWith('-')) throw new Error(`Référence invalide : « ${ref} »`)
  let sha
  try {
    sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root }).trim()
  } catch {
    throw new Error(`Référence introuvable dans ${root} : « ${ref} »`)
  }
  const short = git(['rev-parse', '--short', sha], { cwd: root }).trim()
  return { sha, short }
}

/** Extrait le commit `sha` de `root` dans `dir` (créé) ; rend le nombre de fichiers. */
export function extractCommit(root, sha, dir, tmp) {
  const tarPath = join(tmp, `${sha}.tar`)
  git(['archive', '--format=tar', '-o', tarPath, sha], { cwd: root })
  mkdirSync(dir, { recursive: true })
  const n = untar(readFileSync(tarPath), dir)
  rmSync(tarPath, { force: true })
  return n
}

function measure(cfg) {
  const { result } = collect(cfg, { hotspots: false })
  const baseline = readBaseline(cfg)
  const check = baseline.exists ? compare(cfg, result.violations, baseline) : null
  return metricsDocument(result, check)
}

/** Le relevé (`metrics.json`) d'une révision de `root`, extraite sous `tmp` ; `configFile` (absolu) remplace sa config. */
export function measureRef(root, ref, tmp, configFile = null) {
  const { sha, short } = resolveRef(root, ref)
  const dir = join(tmp, short)
  extractCommit(root, sha, dir, tmp)
  const cfg = loadConfig(dir, configFile)
  cfg.useGit = false
  const doc = measure(cfg)
  doc.commit = short
  return { doc, label: ref }
}

/** Le relevé de l'arbre de travail de `root` (fichiers suivis ou non ignorés), sans points chauds. */
export function measureTree(root, configFile = null) {
  return { doc: measure(loadConfig(root, configFile)), label: 'arbre de travail' }
}

/**
 * Les deux relevés à comparer : `base` (une révision) et `head` (une révision, ou l'arbre de travail si absent).
 * Sans `configFile`, chaque côté prend sa propre config ; avec, les deux côtés prennent celle-là (chemin absolu).
 * Le dossier temporaire est supprimé quoi qu'il arrive.
 * @returns {{ before: { doc: any, label: string }, after: { doc: any, label: string } }}
 */
export function measureBase(root, base, head = null, configFile = null) {
  const tmp = mkdtempSync(join(tmpdir(), 'archimetrics-'))
  try {
    const before = measureRef(root, base, tmp, configFile)
    const after = head ? measureRef(root, head, tmp, configFile) : measureTree(root, configFile)
    return { before, after }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
