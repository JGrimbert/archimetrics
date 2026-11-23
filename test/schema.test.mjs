import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { loadConfig } from '../src/config.mjs'
import { collect } from '../src/metrics/index.mjs'
import { metricsDocument } from '../src/report/index.mjs'
import { assertSupported, loadSchema, METRICS_SCHEMA, validate } from '../src/schema.mjs'

// Un petit projet écrit dans un dossier temporaire (sous `test/`, `node --test` exécuterait ses fichiers).
const FIXTURE = mkdtempSync(join(tmpdir(), 'archimetrics-test-projet-'))
const PROJECT = {
  'package.json': '{ "name": "projet-fixture", "private": true }\n',
  'src/a.js': "import { double } from './b.js'\n\nexport function total(list) {\n  let s = 0\n  for (const x of list) if (x > 0) s += double(x)\n  return s\n}\n",
  'src/b.js': 'export const double = (x) => x * 2\n',
  'lib/c.js': "import { total } from '../src/a.js'\n\nexport const run = () => total([1, 2, 3])\n",
}
for (const [rel, body] of Object.entries(PROJECT)) {
  mkdirSync(join(FIXTURE, rel, '..'), { recursive: true })
  writeFileSync(join(FIXTURE, rel), body)
}
after(() => rmSync(FIXTURE, { recursive: true, force: true }))

function fixtureDoc() {
  const cfg = loadConfig(FIXTURE)
  cfg.useGit = false
  const { result } = collect(cfg, { hotspots: false })
  return JSON.parse(JSON.stringify(metricsDocument(result, null)))
}

test('validateur : type (liste), enum, required, properties, additionalProperties, items', () => {
  const s = {
    type: 'object',
    required: ['a'],
    additionalProperties: false,
    properties: { a: { type: ['integer', 'null'] }, b: { enum: ['x', 'y'] }, c: { type: 'array', items: { type: 'string' } } },
  }
  assert.deepEqual(validate(s, { a: 1, b: 'x', c: ['u'] }), [])
  assert.deepEqual(validate(s, { a: null }), [])
  assert.match(validate(s, {})[0], /requis « a »/)
  assert.match(validate(s, { a: 1.5 })[0], /\$\.a : type attendu integer \| null/)
  assert.match(validate(s, { a: 1, b: 'z' })[0], /hors de/)
  assert.match(validate(s, { a: 1, c: ['u', 2] })[0], /\$\.c\[1\]/)
  assert.match(validate(s, { a: 1, d: 0 })[0], /« d » non permis/)
  assert.match(validate({ type: 'object', additionalProperties: { type: 'string' } }, { k: 3 })[0], /\$\.k/)
  assert.match(validate({ type: 'object' }, [])[0], /type attendu object/)
})

test('validateur : un mot-clé hors du sous-ensemble est refusé ; les schémas publiés passent', () => {
  assert.throws(() => assertSupported({ type: 'object', properties: { a: { $ref: '#/x' } } }), /« \$ref »/)
  assert.throws(() => assertSupported({ type: 'integer', minimum: 0 }), /« minimum »/)
  assert.doesNotThrow(() => assertSupported(loadSchema('metrics.schema.json')))
  assert.doesNotThrow(() => assertSupported(loadSchema('metrics-diff.schema.json')))
})

test('non-régression du format : le metrics.json produit valide archimetrics.metrics/1', () => {
  const doc = fixtureDoc()
  assert.equal(Object.keys(doc)[0], 'schemaVersion')
  assert.equal(doc.schemaVersion, METRICS_SCHEMA)
  assert.deepEqual(validate(loadSchema('metrics.schema.json'), doc), [])
  assert.deepEqual(doc.files.map((f) => f.path), ['lib/c.js', 'src/a.js', 'src/b.js'])
  assert.equal(doc.commit, null)
})

test('non-régression du format : retirer ou retyper un champ garanti fait échouer la validation', () => {
  const schema = loadSchema('metrics.schema.json')
  for (const field of schema.required) {
    const doc = fixtureDoc()
    delete doc[field]
    assert.ok(validate(schema, doc).some((e) => e.includes(`« ${field} »`)), `${field} retiré : la validation devrait échouer`)
  }
  for (const field of schema.properties.summary.required) {
    const doc = fixtureDoc()
    delete doc.summary[field]
    assert.notDeepEqual(validate(schema, doc), [], `summary.${field} retiré`)
  }
  const retyped = fixtureDoc()
  retyped.commit = 42
  assert.notDeepEqual(validate(schema, retyped), [])
  const badViolation = fixtureDoc()
  badViolation.violations.functionLines = [{ value: 3 }]
  assert.ok(validate(schema, badViolation).some((e) => e.includes('« key »')))
  const v2 = fixtureDoc()
  v2.schemaVersion = 'archimetrics.metrics/2'
  assert.notDeepEqual(validate(schema, v2), [])
})

test('non-régression du format : un champ facultatif ajouté reste valide', () => {
  const doc = fixtureDoc()
  doc.nouveauChamp = { quelconque: true }
  doc.groups[0].origine = 'inféré'
  assert.deepEqual(validate(loadSchema('metrics.schema.json'), doc), [])
})
