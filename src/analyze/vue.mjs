// L'ANALYSE D'UN COMPOSANT .vue : ses blocs (script, script setup, gabarit, styles) découpés par @vue/compiler-sfc ; les
// scripts passent par l'analyse JS / TS (numéros de ligne du fichier), le gabarit donne les composants enfants employés.

import { parse } from '@vue/compiler-sfc'
import { analyzeScript, countDeclared } from './script.mjs'

const pascal = (s) => s.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase())

// Lignes non vides hors commentaires `<!-- -->` (gabarit) ou `/* */` et `//` (styles).
function nonCommentLines(text, open, close, lineComment = null) {
  let inComment = false
  let n = 0
  for (const raw of text.split(/\r?\n/)) {
    let line = raw
    let rest = ''
    let i = 0
    while (i < line.length) {
      if (inComment) {
        const j = line.indexOf(close, i)
        if (j < 0) { i = line.length; break }
        inComment = false
        i = j + close.length
      } else {
        const j = line.indexOf(open, i)
        const k = lineComment ? line.indexOf(lineComment, i) : -1
        if (k >= 0 && (j < 0 || k < j) && !/:\s*$/.test(line.slice(0, k))) { rest += line.slice(i, k); i = line.length; break }
        if (j < 0) { rest += line.slice(i); break }
        rest += line.slice(i, j)
        inComment = true
        i = j + open.length
      }
    }
    if (rest.trim()) n++
  }
  return n
}

function templateComponents(ast) {
  const out = new Set()
  let elements = 0
  const walk = (node) => {
    if (!node) return
    if (node.type === 1) {
      elements++
      if (node.tagType === 1) out.add(node.tag)
    }
    for (const c of node.children ?? []) walk(c)
    for (const b of node.branches ?? []) walk(b)
  }
  walk(ast)
  return { tags: [...out], elements }
}

export function analyzeVue(text, rel) {
  const { descriptor, errors } = parse(text, { filename: rel, ignoreEmpty: false })
  const blocks = { script: 0, template: 0, style: 0 }
  const res = { imports: [], exports: ['default'], functions: [], classes: [], tokens: [], tokenLines: [], code: new Set(), lines: text.split(/\r?\n/).length, blocks, vue: { components: [], props: 0, emits: 0, elements: 0 }, errors: errors.length }
  const locals = new Map()
  for (const s of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
    const lang = s.lang ?? 'js'
    const a = analyzeScript(s.content, { ext: lang === 'ts' ? '.ts' : lang === 'tsx' ? '.tsx' : '.js', lang, lineOffset: s.loc.start.line - 1, fileName: rel + '.' + lang })
    for (const l of a.code) res.code.add(l)
    blocks.script += a.code.size
    res.imports.push(...a.imports)
    res.functions.push(...a.functions)
    res.classes.push(...a.classes)
    res.tokens.push(...a.tokens)
    res.tokenLines.push(...a.tokenLines)
    for (const i of a.imports) for (const l of i.locals ?? []) locals.set(l.local, i.spec)
    res.vue.props = Math.max(res.vue.props, countDeclared(a.sf, 'defineProps', 'props'))
    res.vue.emits = Math.max(res.vue.emits, countDeclared(a.sf, 'defineEmits', 'emits'))
  }
  if (descriptor.template) {
    const t = descriptor.template
    blocks.template = nonCommentLines(t.content, '<!--', '-->')
    const start = t.loc.start.line
    t.content.split(/\r?\n/).forEach((l, i) => { if (l.trim()) res.code.add(start + i) })
    const { tags, elements } = templateComponents(t.ast)
    res.vue.elements = elements
    // Un composant du gabarit est relié à l'import qui le fournit (`<MonPanneau>` ou `<mon-panneau>` → import MonPanneau).
    res.vue.components = tags.map((tag) => ({ tag, spec: locals.get(tag) ?? locals.get(pascal(tag)) ?? null }))
  }
  for (const st of descriptor.styles) {
    blocks.style += nonCommentLines(st.content, '/*', '*/', ['scss', 'sass', 'less', 'stylus'].includes(st.lang) ? '//' : null)
  }
  // Les lignes de code d'un .vue : la somme de ses blocs (commentaires du gabarit et des styles retirés).
  res.codeLines = blocks.script + blocks.template + blocks.style
  return res
}
