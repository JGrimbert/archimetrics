import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { diffMarkdown, diffMetrics, readableMetrics } from '../src/diff.mjs'
import { git, onGit, READ_ONLY } from '../src/git.mjs'
import { measureBase } from '../src/git-base.mjs'
import { loadSchema, METRICS_SCHEMA, validate } from '../src/schema.mjs'
import { untar } from '../src/tar.mjs'

const summary = (o = {}) => ({ files: 10, testFiles: 2, codeLines: 500, testCodeLines: 80, functions: 40, cyclomaticAvg: 2.5, cognitiveAvg: 2.1, duplicationPercent: 1.2, cycles: 0, deadExports: 3, docs: 1, violations: 2, ...o })
const v = (key) => ({ key, value: 99, limit: 60, detail: 'ligne 1' })

const before = {
  schemaVersion: METRICS_SCHEMA, tool: 'archimetrics', name: 'p', date: '2026-11-01T00:00:00Z', commit: 'aaa1111', limits: {}, check: null,
  summary: summary(),
  violations: { functionLines: [v('src/a.js#f'), v('src/b.js#g')], cycles: [], cognitive: [] },
  groups: [{ name: 'front', path: 'front', files: 6, codeLines: 300, functions: 25, complexity: 60 }, { name: 'vieux', path: 'vieux', files: 4, codeLines: 200, functions: 15, complexity: 30 }],
  files: [{ path: 'src/a.js' }, { path: 'src/b.js' }, { path: 'vieux/x.js' }],
}
const after = {
  ...before, date: '2026-11-02T00:00:00Z', commit: 'bbb2222',
  summary: summary({ files: 11, codeLines: 540, cyclomaticAvg: 2.4, violations: 2 }),
  violations: { functionLines: [v('src/a.js#f')], cognitive: [v('src/c.js#h')] },
  groups: [{ name: 'front', path: 'front', files: 8, codeLines: 380, functions: 30, complexity: 70 }, { name: 'neuf', path: 'neuf', files: 3, codeLines: 160, functions: 10, complexity: 20 }],
  files: [{ path: 'src/a.js' }, { path: 'src/b.js' }, { path: 'src/c.js' }, { path: 'neuf/y.js' }],
}

test('diff de deux relevés construits à la main', () => {
  const d = diffMetrics({ doc: before, label: 'avant.json' }, { doc: after, label: 'après.json' })
  assert.deepEqual(validate(loadSchema('metrics-diff.schema.json'), d), [])
  assert.deepEqual(d.summary.files, { before: 10, after: 11, delta: 1 })
  assert.deepEqual(d.summary.codeLines, { before: 500, after: 540, delta: 40 })
  assert.equal(d.summary.cyclomaticAvg.delta, -0.1)
  assert.equal(d.summary.violations.delta, 0)
  assert.deepEqual(d.violations.functionLines, { before: 2, after: 1, added: [], resolved: ['src/b.js#g'] })
  assert.deepEqual(d.violations.cognitive, { before: 0, after: 1, added: ['src/c.js#h'], resolved: [] })
  assert.equal(d.violations.cycles, undefined, 'règle vide des deux côtés : omise')
  assert.deepEqual(d.totals, { added: 1, resolved: 1 })
  const g = Object.fromEntries(d.groups.map((x) => [x.name, x]))
  assert.equal(g.front.status, 'commun')
  assert.deepEqual(g.front.codeLines, { before: 300, after: 380, delta: 80 })
  assert.equal(g.vieux.status, 'disparu')
  assert.equal(g.neuf.status, 'apparu')
  assert.deepEqual(g.neuf.files, { before: null, after: 3, delta: 3 })
  assert.deepEqual(d.files, { available: true, added: ['neuf/y.js', 'src/c.js'], removed: ['vieux/x.js'] })
  assert.deepEqual(d.warnings, [])
  const md = diffMarkdown(d)
  assert.match(md, /\| codeLines \| 500 \| 540 \| \+40 \|/)
  assert.match(md, /1 ajoutée\(s\), 1 résorbée\(s\)/)
  assert.match(md, /− `src\/b\.js#g`/)
  assert.match(md, /\+ `src\/c\.js#h`/)
  assert.match(md, /aaa1111/)
})

test('relevé pré-v1 : lu avec un avertissement ; sans summary ni violations, erreur claire', () => {
  const pre = { tool: 'archimetrics', name: 'p', summary: summary(), violations: { functionLines: ['src/a.js#f', 'src/b.js#g'] } }
  const r = readableMetrics(pre, 'vieux.json')
  assert.equal(r.version, 'pré-v1')
  assert.match(r.warning, /vieux\.json : relevé sans schemaVersion, lu comme pré-v1/)
  const d = diffMetrics({ ...r, label: 'vieux.json' }, { doc: after, label: 'après.json' })
  assert.equal(d.warnings.length, 1)
  assert.deepEqual(d.violations.functionLines.resolved, ['src/b.js#g'], 'clés en chaînes acceptées')
  assert.equal(d.files.available, false, 'inventaire absent d’un côté')
  assert.equal(d.before.schemaVersion, null)
  assert.throws(() => readableMetrics({ name: 'x' }, 'autre.json'), /autre\.json : ni schemaVersion, ni summary et violations/)
  assert.throws(() => readableMetrics([], 'liste.json'), /objet JSON attendu/)
  assert.throws(() => readableMetrics({ ...after, schemaVersion: 'archimetrics.metrics/2' }, 'v2.json'), /non pris en charge/)
})

test('git : toute sous-commande hors de la liste de lecture est refusée avant d’être lancée', () => {
  const seen = []
  const stop = onGit((args) => seen.push(args[0]))
  for (const c of ['checkout', 'stash', 'worktree', 'reset', 'commit', 'push', 'fetch']) assert.throws(() => git([c], { cwd: '.' }), /refusé/)
  stop()
  assert.deepEqual(seen, [])
})

// Un en-tête ustar minimal (le lecteur ne vérifie pas la somme de contrôle).
function tarEntry(name, body = '', type = '0') {
  const h = Buffer.alloc(512)
  h.write(name, 0)
  h.write(body.length.toString(8).padStart(11, '0'), 124)
  h.write(type, 156)
  const data = Buffer.alloc(Math.ceil(body.length / 512) * 512)
  data.write(body)
  return Buffer.concat([h, data])
}

test('tar : fichiers, dossiers, chemin long pax ; un chemin qui remonte est refusé', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archimetrics-test-tar-'))
  try {
    const long = 'd/' + 'n'.repeat(120) + '.js'
    const pax = `${(` path=${long}\n`.length + 3)} path=${long}\n`
    const buf = Buffer.concat([tarEntry('pax_global_header', 'x', 'g'), tarEntry('src/', '', '5'), tarEntry('src/a.js', 'export {}'), tarEntry('PaxHeader', pax, 'x'), tarEntry('court', 'long'), Buffer.alloc(1024)])
    assert.equal(untar(buf, dir), 2)
    assert.ok(existsSync(join(dir, 'src', 'a.js')))
    assert.ok(existsSync(join(dir, long)))
    assert.throws(() => untar(Buffer.concat([tarEntry('../evil.js', 'x'), Buffer.alloc(1024)]), dir), /chemin refusé/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

const run = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
const longFunction = () => `export function longue(x) {\n${Array.from({ length: 70 }, (_, i) => `  x = x + ${i}`).join('\n')}\n  return x\n}\n`

function fakeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'archimetrics-test-repo-'))
  run(root, 'init', '-q')
  writeFileSync(join(root, 'package.json'), '{ "name": "factice" }\n')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'a.js'), 'export const a = 1\n')
  run(root, 'add', '.')
  run(root, 'commit', '-q', '-m', 'un')
  const one = run(root, 'rev-parse', 'HEAD').trim()
  writeFileSync(join(root, 'src', 'b.js'), longFunction())
  run(root, 'add', '.')
  run(root, 'commit', '-q', '-m', 'deux')
  return { root, one, two: run(root, 'rev-parse', 'HEAD').trim() }
}

const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith('archimetrics-') && !n.startsWith('archimetrics-test-'))

test('--base : deux révisions d’un dépôt factice, commandes git de lecture seules, dépôt et dossier temporaire intacts', () => {
  const { root, one, two } = fakeRepo()
  try {
    const statusBefore = run(root, 'status', '--porcelain', '--branch')
    const tmpBefore = leftovers()
    const calls = []
    const stop = onGit((args) => calls.push(args[0]))
    let pair
    try {
      pair = measureBase(root, one, two)
    } finally {
      stop()
    }
    assert.ok(calls.length > 0)
    for (const c of calls) assert.ok(READ_ONLY.includes(c) && ['rev-parse', 'archive', 'log', 'status'].includes(c), `commande git inattendue : ${c}`)
    assert.ok(calls.includes('archive'))
    assert.equal(run(root, 'status', '--porcelain', '--branch'), statusBefore)
    assert.deepEqual(leftovers(), tmpBefore, 'dossier temporaire supprimé')
    const schema = loadSchema('metrics.schema.json')
    assert.deepEqual(validate(schema, JSON.parse(JSON.stringify(pair.before.doc))), [])
    assert.equal(pair.before.doc.commit, one.slice(0, pair.before.doc.commit.length))
    const d = diffMetrics(pair.before, pair.after)
    assert.deepEqual(d.summary.files, { before: 1, after: 2, delta: 1 })
    assert.deepEqual(d.violations.functionLines.added, ['src/b.js#longue'])
    assert.deepEqual(d.files.added, ['src/b.js'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--base sans --head : la révision contre l’arbre de travail ; référence inconnue : erreur claire', () => {
  const { root, one } = fakeRepo()
  try {
    writeFileSync(join(root, 'src', 'c.js'), 'export const c = 3\n')
    const pair = measureBase(root, one)
    assert.equal(pair.after.label, 'arbre de travail')
    assert.deepEqual(diffMetrics(pair.before, pair.after).files.added, ['src/b.js', 'src/c.js'])
    const cfgFile = join(root, '..', `archimetrics-test-cfg-${process.pid}.json`)
    writeFileSync(cfgFile, '{ "limits": { "functionLines": null } }')
    try {
      const same = measureBase(root, one, 'HEAD', cfgFile)
      assert.equal(same.after.doc.limits.functionLines, null, '--config : la même config des deux côtés')
      assert.equal(diffMetrics(same.before, same.after).violations.functionLines, undefined)
    } finally {
      rmSync(cfgFile, { force: true })
    }
    assert.throws(() => measureBase(root, 'inexistante'), /Référence introuvable/)
    assert.throws(() => measureBase(root, '--output=x'), /Référence invalide/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
