// LA COMMANDE `archimetrics diff` :
//   archimetrics diff <avant.json> <après.json> [--out <dossier>]
//   archimetrics diff --base <ref> [--head <ref>] [--root .] [--config f] [--out <dossier>]
// (`--config` : une même configuration pour les deux côtés ; sans elle, chaque côté prend la sienne.)
// Écrit `metrics-diff.json` et `metrics-diff.md` (par défaut dans `<root>/.archimetrics/diff`) ; avec `--base`, aussi les
// deux relevés comparés (`avant.json`, `apres.json`). Affiche le Markdown. Code de sortie 0 : le diff informe, `check` juge
// (1 seulement sur une erreur : fichier illisible, référence introuvable…).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { diffMarkdown, diffMetrics, readableMetrics, readMetricsFile } from './diff.mjs'
import { measureBase } from './git-base.mjs'

const OPTIONS_WITH_VALUE = new Set(['--out', '--root', '--base', '--head', '--config'])

/** Les arguments sans tiret qui ne sont pas la valeur d'une option. */
export function positionals(argv) {
  return argv.filter((a, i) => !a.startsWith('--') && !OPTIONS_WITH_VALUE.has(argv[i - 1]))
}

function sides(argv, opt) {
  const base = opt('base')
  if (base) {
    const root = resolve(opt('root', '.'))
    const config = opt('config') ? resolve(opt('config')) : null
    const { before, after } = measureBase(root, base, opt('head'), config)
    return { root, before: { ...readableMetrics(before.doc, before.label), label: before.label }, after: { ...readableMetrics(after.doc, after.label), label: after.label } }
  }
  const files = positionals(argv)
  if (files.length !== 2) throw new Error('Usage : archimetrics diff <avant.json> <après.json> [--out d] · ou --base <ref> [--head <ref>] [--root .]')
  const read = (p) => ({ ...readMetricsFile(resolve(p)), label: p })
  return { root: resolve(opt('root', '.')), before: read(files[0]), after: read(files[1]) }
}

/**
 * Exécute `archimetrics diff` ; rend le code de sortie.
 * @param {string[]} argv arguments après `diff`
 * @param {(name: string, fallback?: string|null) => string|null} opt lecteur d'option
 */
export function runDiff(argv, opt) {
  let s
  try {
    s = sides(argv, opt)
  } catch (e) {
    console.error('✖ ' + e.message)
    return 1
  }
  const d = diffMetrics(s.before, s.after)
  for (const w of d.warnings) console.warn('⚠ ' + w)
  const out = resolve(opt('out') ?? join(s.root, '.archimetrics', 'diff'))
  mkdirSync(out, { recursive: true })
  const md = diffMarkdown(d)
  writeFileSync(join(out, 'metrics-diff.json'), JSON.stringify(d, null, 1))
  writeFileSync(join(out, 'metrics-diff.md'), md)
  if (opt('base')) {
    writeFileSync(join(out, 'avant.json'), JSON.stringify(s.before.doc, null, 1))
    writeFileSync(join(out, 'apres.json'), JSON.stringify(s.after.doc, null, 1))
  }
  console.log(md)
  console.log(`Diff écrit dans ${out}.`)
  return 0
}
