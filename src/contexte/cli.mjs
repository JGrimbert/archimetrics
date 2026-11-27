// LES SOUS-COMMANDES `contexte` ET `claude-md` (AM-8) : lecture des arguments, sorties, codes de retour.
//   contexte <fichier|symbole|fichier#nom>... [--profondeur n] [--budget jetons] [--json] [--root .] [--config f]
//     code 0 ; 2 sur une cible inconnue ou ambiguë (nommée sur la sortie d'erreur, et dans `erreurs` avec --json).
//   claude-md [<dossier>] [--ecrire] [--root r] [--config f]
//     imprime le bloc calculé ; avec --ecrire, le pose dans <dossier>/CLAUDE.md (texte hors balises gardé).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tryGit } from '../git.mjs'
import { claudeMdBlock, updateClaudeMd } from './claude-md.mjs'
import { loadModel, relPath } from './model.mjs'
import { buildPaquet, CONTEXTE_SCHEMA, paquetJson, paquetMarkdown, resolveTarget } from './paquet.mjs'

const VALUED = new Set(['root', 'config', 'profondeur', 'budget'])

export function parseArgs(argv) {
  const opts = {}
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) pos.push(a)
    else if (VALUED.has(a.slice(2))) opts[a.slice(2)] = argv[++i]
    else opts[a.slice(2)] = true
  }
  return { opts, pos }
}

const positiveInt = (v, name, fallback) => {
  if (v === undefined) return fallback
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} attend un entier positif (reçu : ${v})`)
  return n
}

export function runContexte(argv, { log = console.log, err = console.error } = {}) {
  const { opts, pos } = parseArgs(argv)
  let profondeur, budget
  try {
    profondeur = positiveInt(opts.profondeur, 'profondeur', 1)
    budget = positiveInt(opts.budget, 'budget', null)
  } catch (e) {
    err('✖ ' + e.message)
    return 2
  }
  if (!pos.length) {
    err('✖ contexte : au moins une cible (chemin, symbole ou fichier#nom)')
    return 2
  }
  const model = loadModel(resolve(opts.root ?? '.'), opts.config ?? null)
  const resolved = pos.map((a) => resolveTarget(model, a))
  const erreurs = resolved.filter((r) => r.erreur).map((r) => r.erreur)
  if (erreurs.length) {
    for (const e of erreurs) err('✖ ' + e)
    if (opts.json) log(JSON.stringify({ schemaVersion: CONTEXTE_SCHEMA, tool: 'archimetrics', erreurs }, null, 1))
    return 2
  }
  const seen = new Set()
  const targets = resolved.filter((t) => !seen.has(t.rel + '#' + t.symbol) && seen.add(t.rel + '#' + t.symbol))
  const p = buildPaquet(model, targets, { profondeur, budget })
  log(opts.json ? JSON.stringify(paquetJson(p), null, 1) : paquetMarkdown(p))
  return 0
}

// Le dossier : relatif à --root s'il est donné, au dossier courant sinon. La racine : --root, sinon le dépôt Git qui
// contient le dossier, sinon le dossier lui-même.
function locate(opts, dirArg) {
  const abs = opts.root ? resolve(opts.root, dirArg ?? '.') : resolve(dirArg ?? '.')
  if (opts.root) return { abs, root: resolve(opts.root) }
  const top = existsSync(abs) ? tryGit(['rev-parse', '--show-toplevel'], { cwd: abs })?.trim() : null
  return { abs, root: top ? resolve(top) : abs }
}

export function runClaudeMd(argv, { log = console.log, err = console.error } = {}) {
  const { opts, pos } = parseArgs(argv)
  const { abs, root } = locate(opts, pos[0])
  const dir = relPath(root, abs)
  if (!existsSync(abs) || dir.startsWith('..')) {
    err(`✖ dossier introuvable ou hors de la racine ${root} : ${abs}`)
    return 2
  }
  const block = claudeMdBlock(loadModel(root, opts.config ?? null), dir)
  if (!opts.ecrire) {
    log(block)
    return 0
  }
  const file = join(abs, 'CLAUDE.md')
  const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const after = updateClaudeMd(before, block)
  if (after !== before) writeFileSync(file, after)
  log(after === before ? `${file} : déjà à jour.` : `Bloc archimetrics écrit dans ${file}.`)
  return 0
}
