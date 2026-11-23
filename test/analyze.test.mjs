import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeScript } from '../src/analyze/script.mjs'
import { analyzeVue } from '../src/analyze/vue.mjs'

test('lignes de code : ni commentaires ni lignes vides, littéraux multilignes comptés', () => {
  const src = [
    '// commentaire',
    '/* bloc',
    '   de commentaire */',
    'const a = 1',
    '',
    'const t = `ligne',
    'suite`',
    'function f() {',
    '  return a',
    '}',
  ].join('\n')
  const r = analyzeScript(src)
  assert.deepEqual([...r.code].sort((x, y) => x - y), [4, 6, 7, 8, 9, 10])
})

test('complexités cyclomatique et cognitive', () => {
  const src = `
function f(a, b) {
  if (a) {            // +1 cyc, +1 cog
    for (const x of b) { // +1 cyc, +2 cog (imbriqué)
      if (x && a || b) return 1 // +3 cyc (if, &&, ||), +3 cog (if imbriqué ×2 → 3) +2 (deux suites d'opérateurs)
    }
  } else if (b) {     // +1 cyc, +1 cog
    return 2
  } else {            // +1 cog
    return 3
  }
  return a ? 4 : 5    // +1 cyc, +1 cog
}`
  const [fn] = analyzeScript(src).functions
  assert.equal(fn.name, 'f')
  assert.equal(fn.params, 2)
  assert.equal(fn.cyclomatic, 1 + 1 + 1 + 3 + 1 + 1)
  assert.equal(fn.cognitive, 1 + 2 + 3 + 2 + 1 + 1 + 1)
  assert.equal(fn.nesting, 3)
})

test('noms des fonctions : méthode de classe, variable, rappel', () => {
  const src = `
class A { m() {} }
const g = () => 1
watch(x, () => 2)
`
  const names = analyzeScript(src, { ext: '.ts' }).functions.map((f) => f.name)
  assert.deepEqual(names, ['A.m', 'g', 'watch(…)'])
})

test('imports et exports, types exportés à part', () => {
  const src = `
import a, { b as c, type D } from './x'
import * as ns from '@/y'
export { e } from './z'
export const f = 1
export interface I {}
export default function () {}
const l = () => import('./lazy.js')
const r = require('pkg/sub')
`
  const r = analyzeScript(src, { ext: '.ts' })
  assert.deepEqual(r.imports.map((i) => [i.spec, i.names.join(',')]), [
    ['./x', 'default,b,D'],
    ['@/y', '*'],
    ['./z', 'e'],
    ['./lazy.js', '*'],
    ['pkg/sub', '*'],
  ])
  assert.deepEqual(r.exports.sort(), ['default', 'e', 'f'])
  assert.deepEqual(r.typeExports, ['I'])
})

test('classe : injections, LCOM4, module Nest', () => {
  const src = `
@Injectable()
class S {
  constructor(private readonly a: Repo, @Inject(TOKEN) private b: unknown) {}
  one() { return this.a.x }
  two() { return this.one() }
  three() { return this.b }
}
@Module({ imports: [forwardRef(() => OtherModule), Config.forRoot()], providers: [S, { provide: T, useClass: U }] })
class M {}
`
  const [s, m] = analyzeScript(src, { ext: '.ts' }).classes
  assert.deepEqual(s.decorators, ['Injectable'])
  assert.deepEqual(s.injections.map((i) => i.type), ['Repo', 'TOKEN'])
  assert.equal(s.lcom4, 2) // {one, two} partagent `a` ; three seul sur `b`
  assert.deepEqual(m.nestModule.imports, ['OtherModule', 'Config'])
  assert.deepEqual(m.nestModule.providers, ['S', 'T'])
})

test('composant .vue : blocs, composants du gabarit, props', () => {
  const src = `<template>
  <!-- un commentaire -->
  <div>
    <MonPanneau />
    <autre-chose />
  </div>
</template>

<script setup>
import MonPanneau from './MonPanneau.vue'
import AutreChose from './AutreChose.vue'
const props = defineProps({ a: String, b: Number })
</script>

<style scoped>
/* rien */
.x { color: red; }
</style>
`
  const r = analyzeVue(src, 'C.vue')
  assert.deepEqual(r.blocks, { script: 3, template: 4, style: 1 })
  assert.equal(r.codeLines, 8)
  assert.deepEqual(r.vue.components, [
    { tag: 'MonPanneau', spec: './MonPanneau.vue' },
    { tag: 'autre-chose', spec: './AutreChose.vue' },
  ])
  assert.equal(r.vue.props, 2)
})
