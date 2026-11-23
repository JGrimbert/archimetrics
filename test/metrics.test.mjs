import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compare } from '../src/baseline.mjs'
import { cycles, makeResolver } from '../src/graph.mjs'
import { duplicationMetrics } from '../src/metrics/duplication.mjs'
import { citedPaths } from '../src/metrics/organisation.mjs'
import { prismaErd, relLink } from '../src/report/mermaid.mjs'
import { squarify } from '../src/report/svg.mjs'
import { updateReadme, START, END } from '../src/readme.mjs'

const cfg = { aliases: { '@': 'front/src' }, packages: { '@moi/commun': 'packages/commun' }, pythonRoots: ['svc'] }
const files = ['front/src/a.js', 'front/src/b/index.ts', 'front/src/c.vue', 'packages/commun/x.js', 'back/s.ts', 'svc/app/__init__.py', 'svc/app/m.py', 'svc/app/sub/n.py']

test('résolution : relatif, alias, paquet de workspace, .js → .ts, index, Python', () => {
  const r = makeResolver(cfg, files)
  assert.deepEqual(r('front/src/a.js', { spec: './b' }), { files: ['front/src/b/index.ts'] })
  assert.deepEqual(r('front/src/b/index.ts', { spec: '@/c.vue' }), { files: ['front/src/c.vue'] })
  assert.deepEqual(r('back/s.ts', { spec: '@moi/commun/x.js' }), { files: ['packages/commun/x.js'] })
  assert.deepEqual(r('back/s.ts', { spec: 'vue' }), { external: 'vue' })
  assert.deepEqual(r('back/s.ts', { spec: '@nestjs/common' }), { external: '@nestjs/common' })
  assert.deepEqual(r('back/s.ts', { spec: './absent' }), { unresolved: './absent' })
  assert.deepEqual(r('svc/app/m.py', { spec: 'app.sub', names: ['n'], level: 0 }, 'py'), { files: ['svc/app/sub/n.py'] })
  assert.deepEqual(r('svc/app/sub/n.py', { spec: 'm', names: ['f'], level: 2 }, 'py'), { files: ['svc/app/m.py'] })
  assert.deepEqual(r('svc/app/m.py', { spec: 'json', names: ['*'], level: 0 }, 'py'), { external: 'json' })
})

test('cycles : composantes fortement connexes, imports de type exclus', () => {
  const e = (from, to, typeOnly = false) => ({ from, to, typeOnly })
  const c = cycles(['a', 'b', 'c', 'd'], [e('a', 'b'), e('b', 'c'), e('c', 'a'), e('c', 'd'), e('d', 'c', true)])
  assert.deepEqual(c, [['a', 'b', 'c']])
})

test('clones au renommage près', () => {
  const body = (v) => `function f(${v}) { const t = ${v} * 2 + 1; if (t > 3) { return [t, ${v}, t + 1] } return null }`.split(' ')
  const mk = (rel, toks) => ({ rel, test: false, tokens: toks.map((t) => (/^[a-z]+$/.test(t) && !['function', 'const', 'if', 'return', 'null'].includes(t) ? 'i' : t)), tokenLines: toks.map((_, i) => i + 1), code: new Set(toks.map((_, i) => i + 1)) })
  const d = duplicationMetrics([mk('a.js', body('x')), mk('b.js', body('y')), mk('c.js', ['autre', 'chose'])], { minTokens: 10, includeTests: false, maxPercent: null })
  assert.equal(d.clones, 1)
  assert.equal(d.largest[0].a.file, 'a.js')
  assert.equal(d.largest[0].b.file, 'b.js')
})

test('chemins cités dans une doc', () => {
  const text = 'Voir `src/a.js`, `b.vue`, `GET /documents/:id`, `.js`, `npm run dev`, [lien](../x/y.md#ancre) et `dossier/`, `vite.config.js:12`.'
  assert.deepEqual(citedPaths(text).sort(), ['../x/y.md', 'b.vue', 'dossier/', 'src/a.js', 'vite.config.js'])
})

test('baseline : nouvelles, résorbées, mode strict', () => {
  const v = { fileCodeLines: [{ key: 'a' }, { key: 'n' }], cycles: [] }
  const r = compare({ strictBaseline: true }, v, { rules: { fileCodeLines: ['a', 'gone'], cycles: [] } })
  assert.deepEqual(r.added.fileCodeLines.map((x) => x.key), ['n'])
  assert.deepEqual(r.resolved.fileCodeLines, ['gone'])
  assert.equal(r.ok, false)
  assert.equal(compare({ strictBaseline: true }, { x: [{ key: 'a' }] }, { rules: { x: ['a'] } }).ok, true)
})

test('modèle Prisma : relations un-à-plusieurs et un-à-un', () => {
  const er = prismaErd(`
model Doc {
  id    String @id
  nodes Node[]
  meta  Meta?
}
model Node {
  id    String @id
  doc   Doc @relation(fields: [docId], references: [id])
  docId String
}
model Meta {
  id    String @id
  doc   Doc @relation(fields: [docId], references: [id])
  docId String @unique
}`)
  assert.ok(er.includes('  Doc ||--o{ Node : "nodes"'))
  assert.ok(er.includes('  Doc |o--o| Meta : "meta"'))
  assert.equal(er.filter((l) => l.includes('Meta :')).length, 1)
})

test('liens relatifs entre pages', () => {
  assert.equal(relLink('groupes/front.md', 'groupes/front/src.md'), 'front/src.md')
  assert.equal(relLink('composants.md', 'composants/a.md'), 'composants/a.md')
  assert.equal(relLink('a/b/c.md', 'a/d.md'), '../d.md')
})

test('treemap : aires proportionnelles, tout dans le cadre', () => {
  const t = squarify([{ value: 6 }, { value: 3 }, { value: 1 }], 0, 0, 100, 50)
  const area = (x) => x.w * x.h
  assert.equal(Math.round(area(t[0])), 3000)
  assert.equal(Math.round(t.reduce((s, x) => s + area(x), 0)), 5000)
  for (const x of t) assert.ok(x.x >= -1e-9 && x.y >= -1e-9 && x.x + x.w <= 100 + 1e-9 && x.y + x.h <= 50 + 1e-9)
})

test('README : bloc posé puis remplacé entre ses marqueurs', () => {
  const once = updateReadme('# Projet\n', `${START}\nA\n${END}`)
  assert.equal(once, `# Projet\n\n${START}\nA\n${END}\n`)
  assert.equal(updateReadme(once, `${START}\nB\n${END}`), `# Projet\n\n${START}\nB\n${END}\n`)
})
