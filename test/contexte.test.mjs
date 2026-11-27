// AM-8 : signatures exportées, paquet de contexte (`contexte`) et partie calculée du CLAUDE.md (`claude-md`).
// Dépôt fixture dans un dossier temporaire (préfixe hors de `archimetrics-*`, que le test de `diff --base` surveille).

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeScript } from '../src/analyze/script.mjs'
import { headerRole } from '../src/contexte/claude-md.mjs'
import { runClaudeMd, runContexte } from '../src/contexte/cli.mjs'
import { loadModel } from '../src/contexte/model.mjs'
import { buildPaquet, paquetJson, paquetMarkdown, resolveTarget } from '../src/contexte/paquet.mjs'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'archimetrics.mjs')
const OUT = mkdtempSync(join(tmpdir(), 'am-contexte-test-'))
after(() => rmSync(OUT, { recursive: true, force: true }))

const FIXTURE = {
  'src/a.mjs': "// Le module A : point d'entrée de la fixture. Suite ignorée.\nimport { beta } from './b.mjs'\n\nexport function alpha(x) {\n  return beta(x) + 1\n}\n\nexport const dup = 1\n",
  'src/b.mjs': "import { Gamma } from './c.mjs'\n\n/** Doc de beta. */\nexport function beta(y, z = 2) {\n  return new Gamma().run(y) + z\n}\n",
  'src/c.mjs': `/* Le module C. */\nexport class Gamma {\n  run(n) {\n${'    n = n + 1\n'.repeat(40)}    return n\n  }\n}\n`,
  'src/d.mjs': "import { alpha } from './a.mjs'\n\nexport const dup = alpha(2)\n",
  'test/a.test.mjs': "import { alpha } from '../src/a.mjs'\nalpha(1)\n",
}

function fixture(name) {
  const root = join(OUT, name)
  for (const [rel, text] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return root
}

const capture = () => {
  const out = { log: [], err: [] }
  return { out, io: { log: (s) => out.log.push(s), err: (s) => out.err.push(s) } }
}

test('signatures : fonctions, classes, constantes, types, ré-exports, JSDoc et commentaire', () => {
  const src = [
    '/** Additionne. */',
    'export async function add(a: number, b = 2): Promise<number> { return a + b }',
    '// Le seuil.',
    'export const N = 3',
    'export const f = (x: string): number => x.length',
    '/** Une classe. */',
    'export class A extends B {',
    '  private secret = 1',
    '  constructor(public x: number) { super() }',
    '  static make(): A { return null }',
    '}',
    'export interface I { a: number }',
    'function local(q) {}',
    'export { local as alias }',
    "export { x, y as z } from './m'",
    "export * from './n'",
    'export default function main() {}',
  ].join('\n')
  const s = analyzeScript(src, { ext: '.ts' }).signatures
  const by = Object.fromEntries(s.map((e) => [e.name, e]))
  assert.deepEqual(s.map((e) => e.name), ['add', 'N', 'f', 'A', 'I', 'alias', 'x', 'z', '*', 'default'])
  assert.equal(by.add.kind, 'function')
  assert.equal(by.add.signature, 'async function add(a: number, b = 2): Promise<number>')
  assert.equal(by.add.jsdoc, '/** Additionne. */')
  assert.equal(by.N.signature, 'const N = 3')
  assert.equal(by.N.comment, '// Le seuil.')
  assert.equal(by.f.signature, 'const f = (x: string): number => …')
  assert.equal(by.A.signature, 'class A extends B {\n  constructor(public x: number)\n  static make(): A\n}')
  assert.equal(by.A.jsdoc, '/** Une classe. */')
  assert.equal(by.A.line, 7)
  assert.equal(by.A.endLine, 11)
  assert.equal(by.A.docLine, 6)
  assert.equal(by.I.signature, 'interface I { a: number }')
  assert.equal(by.alias.signature, 'function local(q)')
  assert.equal(by.z.kind, 'reexport')
  assert.equal(by.z.signature, "export { y as z } from './m'")
  assert.equal(by.z.from, './m')
  assert.equal(by['*'].signature, "export * from './n'")
  assert.equal(by.default.signature, 'function main()')
})

test("signatures : surcharges fondues, décalage de lignes d'un .vue", () => {
  const s = analyzeScript('export function o(a: string): void\nexport function o(a: number): void\nexport function o(a) {}\n', { ext: '.ts', lineOffset: 10 }).signatures
  assert.equal(s.length, 1)
  assert.equal(s[0].signature.split('\n').length, 3)
  assert.deepEqual([s[0].line, s[0].endLine], [11, 13])
})

test('contexte : cibles en entier, voisins en signatures, tests associés, jetons par section', () => {
  const root = fixture('base')
  const model = loadModel(root)
  const t = resolveTarget(model, 'src/a.mjs')
  assert.deepEqual(t, { rel: 'src/a.mjs', symbol: null })
  const p = buildPaquet(model, [t])
  assert.equal(p.cibles[0].texte, FIXTURE['src/a.mjs'])
  assert.deepEqual(p.voisins.map((v) => [v.chemin, v.relation, v.distance]), [['src/b.mjs', ['importé'], 1], ['src/d.mjs', ['importeur'], 1]])
  const b = p.voisins[0]
  assert.equal(b.exports[0].signature, 'function beta(y, z = 2)')
  assert.equal(b.exports[0].jsdoc, '/** Doc de beta. */')
  const md = paquetMarkdown(p)
  assert.match(md, /\/\*\* Doc de beta\. \*\/\nfunction beta\(y, z = 2\)/)
  assert.ok(!md.includes('new Gamma().run'), 'le corps d\'un voisin ne figure pas dans le paquet')
  assert.deepEqual(p.tests, [{ chemin: 'test/a.test.mjs' }])
  assert.match(md, /## Tests associés\n\n- test\/a\.test\.mjs/)
  assert.ok(p.jetons.cibles > 0 && p.jetons.voisins > 0 && p.jetons.tests > 0)
  assert.equal(p.jetons.total, p.jetons.cibles + p.jetons.voisins + p.jetons.tests)
  assert.match(md, new RegExp(`cibles ${p.jetons.cibles} · voisins ${p.jetons.voisins} · tests ${p.jetons.tests} · total ${p.jetons.total}`))
})

test('contexte : une cible peut être un symbole exporté (nom seul ou fichier#nom) ; un symbole ambigu est refusé et nommé', () => {
  const root = fixture('symboles')
  const model = loadModel(root)
  assert.deepEqual(resolveTarget(model, 'beta'), { rel: 'src/b.mjs', symbol: 'beta' })
  assert.deepEqual(resolveTarget(model, 'src/d.mjs#dup'), { rel: 'src/d.mjs', symbol: 'dup' })
  const p = buildPaquet(model, [resolveTarget(model, 'beta')])
  assert.deepEqual(p.cibles[0].lignes, [3, 6])
  assert.equal(p.cibles[0].texte, '/** Doc de beta. */\nexport function beta(y, z = 2) {\n  return new Gamma().run(y) + z\n}')
  const amb = resolveTarget(model, 'dup')
  assert.match(amb.erreur, /ambigu/)
  assert.deepEqual(amb.ambigu, ['src/a.mjs', 'src/d.mjs'])
  const { out, io } = capture()
  assert.equal(runContexte(['dup', '--root', root], io), 2)
  assert.match(out.err.join('\n'), /symbole ambigu « dup » : src\/a\.mjs#dup, src\/d\.mjs#dup/)
  assert.equal(out.log.length, 0)
  const j = capture()
  assert.equal(runContexte(['dup', '--root', root, '--json'], j.io), 2)
  assert.match(JSON.parse(j.out.log[0]).erreurs[0], /src\/a\.mjs#dup, src\/d\.mjs#dup/)
  assert.match(resolveTarget(model, 'inconnu').erreur, /ni fichier ni symbole/)
})

test("contexte : --profondeur étend le voisinage ; --budget coupe d'abord les plus lointains et le dit", () => {
  const root = fixture('profondeur')
  const model = loadModel(root)
  const t = [resolveTarget(model, 'src/a.mjs')]
  const p2 = buildPaquet(model, t, { profondeur: 2 })
  assert.deepEqual(p2.voisins.map((v) => [v.chemin, v.distance]), [['src/b.mjs', 1], ['src/d.mjs', 1], ['src/c.mjs', 2]])
  assert.equal(p2.coupe, null)
  const near = p2.voisins.filter((v) => v.distance === 1).reduce((s, v) => s + v.jetons, 0)
  const budget = p2.jetons.cibles + p2.jetons.tests + near
  const cut = buildPaquet(model, t, { profondeur: 2, budget })
  assert.deepEqual(cut.voisins.map((v) => v.chemin), ['src/b.mjs', 'src/d.mjs'])
  assert.deepEqual(cut.coupe.retires.map((r) => [r.chemin, r.distance]), [['src/c.mjs', 2]])
  assert.equal(cut.coupe.profondeurGardee, 1)
  assert.ok(cut.jetons.total <= budget)
  assert.match(paquetMarkdown(cut), /Coupé au budget de \d+ jetons : voisins gardés jusqu'à la distance 1 ; retirés : src\/c\.mjs \(distance 2/)
  const tiny = buildPaquet(model, t, { profondeur: 2, budget: 1 })
  assert.equal(tiny.voisins.length, 0)
  assert.equal(tiny.coupe.tenu, false)
  assert.equal(tiny.cibles.length, 1, 'les cibles ne sont jamais coupées')
})

test('contexte --json : sortie stable (archimetrics.contexte/1), deux passages identiques', () => {
  const root = fixture('json')
  const run = () => {
    const { out, io } = capture()
    assert.equal(runContexte(['src/a.mjs', '--root', root, '--json', '--profondeur', '2'], io), 0)
    return out.log.join('\n')
  }
  const s1 = run()
  assert.equal(run(), s1)
  const j = JSON.parse(s1)
  assert.deepEqual(Object.keys(j), ['schemaVersion', 'tool', 'profondeur', 'budget', 'cibles', 'voisins', 'tests', 'coupe', 'jetons', 'avertissements'])
  assert.equal(j.schemaVersion, 'archimetrics.contexte/1')
  assert.deepEqual(Object.keys(j.cibles[0]), ['chemin', 'symbole', 'lignes', 'texte', 'jetons'])
  assert.deepEqual(Object.keys(j.voisins[0]), ['chemin', 'distance', 'relation', 'exports', 'jetons'])
  assert.deepEqual(Object.keys(j.voisins[0].exports[0]), ['nom', 'genre', 'signature', 'jsdoc', 'commentaire'])
  assert.deepEqual(Object.keys(j.jetons), ['cibles', 'voisins', 'tests', 'total'])
  assert.deepEqual(paquetJson(buildPaquet(loadModel(root), [{ rel: 'src/a.mjs', symbol: null }], { profondeur: 2 })), j)
  const readme = readFileSync(join(dirname(BIN), '..', 'README.md'), 'utf8')
  for (const k of ['archimetrics.contexte/1', 'profondeurGardee', 'relation', 'commentaire', '--budget']) assert.ok(readme.includes(k), `README : ${k}`)
})

test("claude-md : rôle tiré du commentaire d'en-tête", () => {
  assert.equal(headerRole("#!/usr/bin/env node\n// LE RÔLE : ce qu'il fait. Le reste.\ncode()"), "LE RÔLE : ce qu'il fait.")
  assert.equal(headerRole('/**\n * Bloc sur\n * deux lignes\n */\nx()'), 'Bloc sur deux lignes')
  assert.equal(headerRole('"""Module Python."""\nimport os'), 'Module Python.')
  assert.equal(headerRole('const x = 1\n// trop tard'), null)
})

test('claude-md : bloc entre balises, texte manuel préservé, deux passages identiques, rien écrit sans --ecrire', () => {
  const root = fixture('claude')
  const file = join(root, 'src', 'CLAUDE.md')
  const manual = '# src\n\nNotes écrites à la main.\n\n<!-- archimetrics:debut -->\nancien bloc\n<!-- archimetrics:fin -->\n\nFin manuelle.\n'
  writeFileSync(file, manual)
  const dry = capture()
  assert.equal(runClaudeMd(['src', '--root', root], dry.io), 0)
  assert.equal(readFileSync(file, 'utf8'), manual, 'sans --ecrire, rien n\'est écrit')
  const block = dry.out.log.join('\n')
  assert.ok(block.startsWith('<!-- archimetrics:debut -->') && block.endsWith('<!-- archimetrics:fin -->'))
  assert.match(block, /- `a\.mjs` — Le module A : point d'entrée de la fixture\.\n {2}- exports : `alpha`, `dup`\n {2}- importe : `src\/b\.mjs`\n {2}- importé par : `src\/d\.mjs`, `test\/a\.test\.mjs`/)
  assert.match(block, /- `c\.mjs` — Le module C\.\n {2}- exports : `Gamma`/)

  assert.equal(runClaudeMd(['src', '--root', root, '--ecrire'], capture().io), 0)
  const once = readFileSync(file, 'utf8')
  assert.ok(once.startsWith('# src\n\nNotes écrites à la main.\n\n<!-- archimetrics:debut -->'))
  assert.ok(once.endsWith('<!-- archimetrics:fin -->\n\nFin manuelle.\n'))
  assert.ok(!once.includes('ancien bloc'))
  assert.equal(runClaudeMd(['src', '--root', root, '--ecrire'], capture().io), 0)
  assert.equal(readFileSync(file, 'utf8'), once, 'deux passages successifs rendent un fichier identique')

  const fresh = join(root, 'test', 'CLAUDE.md')
  assert.equal(runClaudeMd(['test', '--root', root], capture().io), 0)
  assert.ok(!existsSync(fresh), 'sans --ecrire, aucun fichier créé')
  assert.equal(runClaudeMd([join(root, 'test'), '--root', root, '--ecrire'], capture().io), 0)
  assert.match(readFileSync(fresh, 'utf8'), /^<!-- archimetrics:debut -->[\s\S]*`a\.test\.mjs` \(test\)[\s\S]*<!-- archimetrics:fin -->\n$/)
})

test('les deux sous-commandes sont branchées dans bin/archimetrics.mjs', () => {
  const root = fixture('bin')
  const md = execFileSync(process.execPath, [BIN, 'contexte', 'alpha', '--root', root], { encoding: 'utf8' })
  assert.match(md, /^# Paquet de contexte : src\/a\.mjs#alpha/)
  const block = execFileSync(process.execPath, [BIN, 'claude-md', 'src', '--root', root], { encoding: 'utf8' })
  assert.match(block, /<!-- archimetrics:debut -->/)
  assert.ok(!existsSync(join(root, 'src', 'CLAUDE.md')))
})
