import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyHunks, caseAfterFiles, caseDiff, extractArgs, gitRead, repoPaths } from '../bench/extract.mjs'
import { reviewPrompt } from '../bench/revue.mjs'
import { parseDiff } from '../src/review/diff.mjs'
import {
  BENCH_DIR, checkReview, loadBench, messagesFor, norm, REVIEW_SCHEMA, runBench, scoreCase, summarize, tableRow, TABLE_HEADER, writeResults,
} from '../bench/lib.mjs'
import { createProvider } from '../src/llm/index.mjs'
import { assertSupported, validate } from '../src/schema.mjs'

// AUCUN APPEL RÉSEAU : `fetch` global piégé ; le fournisseur du banc reçoit un faux `fetch`.
// AUCUN DÉPÔT EXTÉRIEUR : scribe est déclaré absent ; l'extraction est essayée sur un faux dépôt Git temporaire.
let globalCalls = 0
const realFetch = globalThis.fetch
globalThis.fetch = async () => {
  globalCalls++
  throw new Error('réseau interdit dans les tests')
}
const OUT = mkdtempSync(join(tmpdir(), 'archimetrics-test-banc-'))
after(() => {
  globalThis.fetch = realFetch
  rmSync(OUT, { recursive: true, force: true })
  assert.equal(globalCalls, 0, 'le fetch global n’a jamais été appelé')
})

const NO_SCRIBE = { scribe: join(OUT, 'scribe-absent') }
const bench = loadBench(BENCH_DIR, { repos: NO_SCRIBE })
/** Le banc avec un faux diff pour chaque cas indisponible (s1 garde de quoi être trouvé). */
const FULL = {
  ...bench,
  empreinte: 'complet0',
  cas: bench.cas.map((c) => (c.diffText ? c : {
    ...c, indisponible: null, diffText: `diff --git a/x b/x\n${c.id === 's1-nbsp-entite' ? "-  html.replaceAll('&nbsp;', s)\n" : '+x\n'}`,
  })),
}

test('banc : 10 cas, 5 défauts et 5 sains ; scribe en références seules (D-034), ArchiMetrics figé', () => {
  assert.equal(bench.cas.length, 10)
  assert.equal(new Set(bench.cas.map((c) => c.id)).size, 10)
  assert.equal(bench.cas.filter((c) => c.attendu === 'défaut').length, 5)
  assert.equal(bench.cas.filter((c) => c.attendu === 'rien').length, 5)
  const raw = JSON.parse(readFileSync(join(BENCH_DIR, 'cas.json'), 'utf8'))
  for (const c of raw.cas) {
    assert.ok(raw.depots[c.depot], c.id)
    assert.equal(c.attendu === 'défaut', c.constats.length > 0, c.id)
    for (const e of c.constats) assert.ok(e.motsCles.length && e.fichier, c.id)
    if (c.depot === 'scribe') {
      assert.equal(c.diff, undefined, `${c.id} : aucun diff de scribe versionné`)
      assert.ok(['inverse', 'direct'].includes(c.source.mode) && /^[0-9a-f]{7,}$/.test(c.source.commit) && c.fichiers.length, c.id)
    } else {
      assert.match(readFileSync(join(BENCH_DIR, c.diff), 'utf8'), /^diff --git /, c.id)
    }
  }
  const missing = bench.cas.filter((c) => c.indisponible)
  assert.equal(missing.length, 7)
  assert.ok(missing.every((c) => c.depot === 'scribe' && /dépôt scribe absent/.test(c.indisponible)))
  assert.match(bench.empreinte, /^[0-9a-f]{8}-partiel$/)
  assert.equal(loadBench(BENCH_DIR, { repos: NO_SCRIBE }).empreinte, bench.empreinte)
  assert.match(loadBench(BENCH_DIR, { repos: { scribe: '' } }).cas[0].indisponible, /non configuré/)
})

/** Un faux dépôt : `f.js` écrit, puis « corrigé » ; rend le dépôt et les deux commits. */
function fakeRepo() {
  const root = mkdtempSync(join(OUT, 'depot-'))
  const g = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...a], { cwd: root, encoding: 'utf8' })
  g('init', '-q')
  writeFileSync(join(root, 'f.js'), "export const css = 'paged.css'\n")
  g('add', '.')
  g('commit', '-q', '-m', 'un')
  writeFileSync(join(root, 'f.js'), "export const css = '/paged.css'\n")
  writeFileSync(join(root, 'autre.js'), 'x\n')
  g('add', '.')
  g('commit', '-q', '-m', 'correctif')
  return { root, fix: g('rev-parse', 'HEAD').trim() }
}

test('extraction (D-034) : correctif renversé ou commit direct, git show/diff seulement, en mémoire, fichiers choisis', () => {
  const { root, fix } = fakeRepo()
  const calls = []
  const run = (cmd, args, o) => { calls.push(args); return execFileSync(cmd, args, o) }
  const inv = { id: 'i', depot: 'd', source: { commit: fix.slice(0, 8), mode: 'inverse' }, fichiers: ['f.js'] }
  const got = caseDiff(inv, { dir: BENCH_DIR, repos: { d: root }, run })
  assert.match(got.diffText, /^diff --git a\/f\.js b\/f\.js/)
  assert.match(got.diffText, /^-export const css = '\/paged\.css'$/m)
  assert.match(got.diffText, /^\+export const css = 'paged\.css'$/m)
  assert.ok(!got.diffText.includes('autre.js'), 'seuls les fichiers du cas')
  const dir = caseDiff({ ...inv, source: { ...inv.source, mode: 'direct' } }, { dir: BENCH_DIR, repos: { d: root }, run })
  assert.match(dir.diffText, /^\+export const css = '\/paged\.css'$/m)
  assert.deepEqual(calls.map((a) => a[0]), ['diff', 'show'])
  assert.deepEqual(extractArgs(inv).slice(-4), [fix.slice(0, 8), `${fix.slice(0, 8)}^`, '--', 'f.js'])
  assert.match(caseDiff({ ...inv, source: { commit: 'deadbeef', mode: 'inverse' } }, { dir: BENCH_DIR, repos: { d: root } }).indisponible, /extraction impossible/)
  assert.match(caseDiff({ ...inv, fichiers: ['absent.js'] }, { dir: BENCH_DIR, repos: { d: root } }).indisponible, /diff vide/)
  assert.throws(() => gitRead(['checkout', 'main'], root), /refusé/)
  assert.throws(() => extractArgs({ ...inv, source: { commit: fix, mode: 'reconstitué' } }), /non extractible/)
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }), '', 'dépôt lu intact')
})

test('chemins des dépôts : depots.local.json, que --repo emporte', () => {
  const dir = join(OUT, 'local')
  mkdirSync(dir)
  writeFileSync(join(dir, 'depots.local.json'), '{ "scribe": "C:/a", "autre": "C:/b" }\n')
  assert.deepEqual(repoPaths(dir, { scribe: 'C:/c' }), { scribe: 'C:/c', autre: 'C:/b' })
  assert.deepEqual(repoPaths(join(OUT, 'rien')), {})
  writeFileSync(join(dir, 'depots.local.json'), '{ faux')
  assert.throws(() => repoPaths(dir), /illisible/)
})

test('banc : une copie en fins de ligne CRLF (checkout Windows) a la même empreinte et les mêmes diffs', () => {
  const dir = join(OUT, 'crlf')
  mkdirSync(join(dir, 'cas'), { recursive: true })
  const crlf = (rel) => writeFileSync(join(dir, rel), readFileSync(join(BENCH_DIR, rel), 'utf8').replace(/\r?\n/g, '\r\n'))
  crlf('cas.json')
  for (const c of bench.cas) if (c.diff) crlf(c.diff)
  const copy = loadBench(dir, { repos: NO_SCRIBE })
  assert.equal(copy.empreinte, bench.empreinte)
  const a1 = (b) => b.cas.find((c) => c.id === 'a1-tmpdir-parallele').diffText
  assert.equal(a1(copy), a1(bench))
})

test('schéma de revue : dans le sous-ensemble du validateur ; cohérence conclusion / constats', () => {
  assertSupported(REVIEW_SCHEMA)
  const ok = { conclusion: 'constats', constats: [{ fichier: 'a.js', ligne: 3, nature: 'avéré', gravite: 'haute', description: 'x' }] }
  assert.deepEqual(validate(REVIEW_SCHEMA, ok), [])
  assert.ok(validate(REVIEW_SCHEMA, { conclusion: 'peut-être', constats: [] }).length)
  assert.deepEqual(checkReview({ conclusion: 'constats', constats: [] }), ['conclusion « constats » sans aucun constat'])
  assert.equal(checkReview({ conclusion: 'rien de significatif', constats: ok.constats }).length, 1)
  assert.deepEqual(checkReview({ conclusion: 'rien de significatif', constats: [{ ...ok.constats[0], nature: 'suggestion' }] }), [])
})

test('messages : consigne puis dépôt et diff, sans le titre du commit', () => {
  const c = bench.cas.find((x) => x.id === 'a1-tmpdir-parallele')
  const [sys, user] = messagesFor(c, bench.depots)
  assert.equal(sys.role, 'system')
  assert.match(sys.content, /rien de significatif/)
  assert.ok(user.content.includes(c.diffText))
  assert.ok(user.content.includes(bench.depots[c.depot]))
  assert.ok(!user.content.includes(c.source.titre))
})

const res = (constats, attempts = 1) => ({
  ok: true, value: { conclusion: constats.length ? 'constats' : 'rien de significatif', constats },
  attempts: Array.from({ length: attempts }, () => ({ ms: 10, errors: [] })), durationMs: 1000 * attempts, usage: { output: 50 },
})
const constat = (description, nature = 'avéré') => ({ fichier: 'f', ligne: null, nature, gravite: 'moyenne', description })

test('note d’un cas : trouvé par mot-clé (casse et accents ignorés), faux, suggestions ignorées, format', () => {
  const s1 = bench.cas.find((c) => c.id === 's1-nbsp-entite')
  const a = scoreCase(s1, res([constat("L'ENTITÉ &NBSP; n'est plus remplacée"), constat('variable mal nommée'), constat('ajouter un test', 'suggestion')]))
  assert.deepEqual([a.trouves, a.attendus, a.faux, a.pertinents, a.rien, a.formatPremier], [1, 1, 1, 2, false, true])
  const sain = bench.cas.find((c) => c.attendu === 'rien')
  const b = scoreCase(sain, res([constat('rien à redire', 'suggestion')], 2))
  assert.deepEqual([b.rien, b.faux, b.formatPremier, b.formatFinal, b.essais], [true, 0, false, true, 2])
  const c = scoreCase(sain, { ok: false, value: null, attempts: [{ ms: 0, errors: ['x'] }], durationMs: 0, error: 'down' })
  assert.deepEqual([c.formatFinal, c.rien, c.erreur], [false, false, 'down'])
  assert.equal(norm('Être À l’heure'), "etre a l'heure")
})

test('résumé et ligne du tableau : mêmes colonnes que l’en-tête', () => {
  const scores = bench.cas.map((c) => scoreCase(c, res([])))
  const s = summarize(scores, { date: '2026-11-23 18:00', empreinte: 'abcd1234', fournisseur: 'ollama', modele: 'm' })
  assert.deepEqual([s.cas, s.formatPremier, s.trouves, s.attendus, s.sainsRien, s.sains, s.faux, s.latenceMedianeS], [10, 10, 0, 5, 5, 5, 0, 1])
  const cols = (l) => l.split('|').length
  assert.equal(cols(tableRow(s)), cols(TABLE_HEADER.split('\n')[0]))
})

/** Un faux `fetch` Ollama : 1re réponse illisible, puis un constat sur `&nbsp;`, sinon « rien ». */
function fakeOllama() {
  let n = 0
  return async (url, init) => {
    n++
    const diff = JSON.parse(init.body).messages[1].content
    const content = n === 1 ? 'pas du json'
      : diff.includes('&nbsp;') ? JSON.stringify({ conclusion: 'constats', constats: [constat('l’entité &nbsp; est oubliée')] })
        : JSON.stringify({ conclusion: 'rien de significatif', constats: [] })
    return { ok: true, status: 200, text: async () => JSON.stringify({ message: { content }, eval_count: 7 }) }
  }
}

test('passage complet avec un faux fournisseur Ollama (aucun réseau) : réessai compté, résultats écrits', async () => {
  const provider = createProvider({ model: 'faux' }, { fetch: fakeOllama() })
  const seen = []
  const run = await runBench({ provider, bench: FULL, onCase: (s) => seen.push(s.id) })
  assert.equal(seen.length, 10)
  const s = run.summary
  assert.deepEqual([s.formatPremier, s.formatFinal, s.trouves, s.sainsRien, s.faux, s.empreinte], [9, 10, 1, 5, 0, 'complet0'])
  assert.equal(s.fournisseur, 'ollama')
  const file = writeResults(OUT, run)
  writeResults(OUT, run)
  const table = readFileSync(join(OUT, 'resultats.md'), 'utf8')
  assert.equal(table.split('\n').filter((l) => l.startsWith('| 20')).length, 2, 'une ligne par passage')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).details.length, 10)
})

test('passage partiel : cas indisponibles sautés et signalés, --case aussi marqué « partiel »', async () => {
  const provider = createProvider({ model: 'faux' }, { fetch: fakeOllama() })
  const skipped = []
  const run = await runBench({ provider, bench, onSkip: (c) => skipped.push(c.id) })
  assert.equal(skipped.length, 7)
  assert.equal(run.summary.cas, 3)
  assert.equal(run.summary.empreinte, bench.empreinte)
  const one = await runBench({ provider, bench: FULL, only: ['a1-tmpdir-parallele'] })
  assert.equal(one.summary.empreinte, 'complet0-partiel')
})

test('bench/run.mjs : refuse une adresse distante sans --allow-remote, sans rien écrire', () => {
  const script = fileURLToPath(new URL('../bench/run.mjs', import.meta.url))
  let err
  try {
    execFileSync(process.execPath, [script, '--provider', 'openai-compatible', '--base-url', 'https://api.example.com/v1', '--model', 'm'], { stdio: 'pipe' })
  } catch (e) {
    err = e
  }
  assert.ok(err, 'code de sortie non nul')
  assert.equal(err.status, 1)
  assert.match(err.stderr.toString(), /appel distant refusé vers api\.example\.com.*--allow-remote/)
  assert.equal(err.stdout.toString(), '', 'rien imprimé : refus avant de lire le banc')
})

test('fichiers après le changement (AM-4b) : blob d\'arrivée par git show, cas reconstitué par application du diff, empreinte', () => {
  const { root, fix } = fakeRepo()
  const calls = []
  const run = (cmd, args, o) => { calls.push(args); return execFileSync(cmd, args, o) }
  const inv = { id: 'i', depot: 'd', source: { commit: fix.slice(0, 8), mode: 'inverse' }, fichiers: ['f.js'] }
  const { diffText } = caseDiff(inv, { dir: BENCH_DIR, repos: { d: root } })
  assert.deepEqual(caseAfterFiles(inv, diffText, { repos: { d: root }, self: root, run }), { 'f.js': "export const css = 'paged.css'\n" })
  assert.deepEqual(calls.map((a) => a[0]), ['show'])
  // Sans ligne `index` (cas reconstitué) : le fichier au commit du cas, diff appliqué.
  const rec = "diff --git a/f.js b/f.js\n--- a/f.js\n+++ b/f.js\n@@ -1 +1,2 @@\n-export const css = '/paged.css'\n+export const css = 'p.css'\n+// ajout\n"
  assert.deepEqual(caseAfterFiles({ ...inv, source: { commit: fix, mode: 'reconstitué' } }, rec, { repos: { d: root }, self: root }), { 'f.js': "export const css = 'p.css'\n// ajout\n" })
  assert.deepEqual(caseAfterFiles(inv, diffText, { repos: {}, self: root }), {}, 'dépôt non configuré : rien')
  assert.equal(applyHunks('a\nb\n', parseDiff(rec)[0].hunks), null, 'avant différent : null')
  assert.equal(applyHunks('x\ny\nz\nw', parseDiff('diff --git a/q b/q\n@@ -2,2 +2,2 @@\n y\n-z\n+Z\n')[0].hunks), 'x\ny\nZ\nw')
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }), '', 'dépôt lu intact')
  // Empreintes : le mode « revue » sans fichier ne change pas ; avec fichiers, elle change.
  const diff = loadBench(BENCH_DIR, { repos: NO_SCRIBE, prompt: reviewPrompt() })
  const file = loadBench(BENCH_DIR, { repos: NO_SCRIBE, prompt: reviewPrompt('fichier'), apres: true })
  assert.notEqual(diff.empreinte, file.empreinte)
  assert.ok(Object.keys(file.cas.find((c) => c.id === 'a1-tmpdir-parallele').fichiersApres).includes('test/diff.test.mjs'))
  assert.ok(file.cas.find((c) => c.id === 'a2-marque-generee').fichiersApres['src/discover/generated.mjs'].includes("new RegExp(String.raw`(@generated\\b)`)"))
  assert.equal(diff.cas[0].fichiersApres, undefined)
})
