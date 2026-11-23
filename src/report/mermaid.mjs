// LES DIAGRAMMES (Mermaid, que GitHub dessine dans un .md) : une vue d'ensemble, puis chaque groupe découpé par dossiers sur
// `diagrams.depth` niveaux, les classes (par module Nest s'il y en a, sinon par dossier), les composants Vue, le modèle de
// données Prisma. Chaque diagramme est plafonné (`maxNodes`, `maxEdges`) : au-delà, les liens les plus lourds restent et la
// coupe est dite. Rend [{ path, title, body }] (chemins relatifs au dossier `uml/`).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dirOf } from '../files.mjs'
import { effectiveRoot as rootOf } from '../metrics/groups.mjs'
import { fr } from './format.mjs'

const id = (s) => 'n_' + s.replace(/[^A-Za-z0-9]/g, '_')
const label = (s) => String(s).replace(/"/g, '#quot;').replace(/[<>]/g, (c) => (c === '<' ? '#lt;' : '#gt;')).replace(/\n/g, '<br/>')
const slug = (s) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'racine'

function fence(lines) {
  return '```mermaid\n' + lines.join('\n') + '\n```\n'
}

function capEdges(edges, max) {
  const sorted = [...edges].sort((a, b) => b.n - a.n)
  return { kept: sorted.slice(0, max), cut: Math.max(0, sorted.length - max) }
}

// Un graphe de dossiers : nœuds pondérés (fichiers, lignes), liens comptés ; les nœuds hors du périmètre en pointillés.
function flow({ nodes, edges, outside = [], direction = 'LR', maxNodes, maxEdges }) {
  const lines = [`flowchart ${direction}`]
  let shown = [...nodes].sort((a, b) => b.weight - a.weight)
  const cutNodes = Math.max(0, shown.length - maxNodes)
  shown = shown.slice(0, maxNodes)
  const keep = new Set([...shown.map((n) => n.key), ...outside.map((o) => o.key)])
  const { kept, cut } = capEdges(edges.filter((e) => keep.has(e.from) && keep.has(e.to)), maxEdges)
  const usedOutside = new Set(kept.flatMap((e) => [e.from, e.to]))
  for (const n of shown) lines.push(`  ${id(n.key)}["${label(n.title)}"]`)
  for (const o of outside) if (usedOutside.has(o.key)) lines.push(`  ${id(o.key)}(["${label(o.title)}"]):::outside`)
  for (const e of kept) lines.push(`  ${id(e.from)} -->|${e.n}| ${id(e.to)}`)
  lines.push('  classDef outside stroke-dasharray: 4 3,opacity:0.75')
  const notes = []
  if (cutNodes) notes.push(`${cutNodes} nœud(s) les plus légers non montrés`)
  if (cut) notes.push(`${cut} lien(s) les plus faibles non montrés`)
  return { text: fence(lines), notes }
}

function moduleEdges(files, graph, keyOf, scopeTest) {
  const counts = new Map()
  for (const e of graph.edges) {
    if (!files.has(e.from) || !files.has(e.to)) continue
    const a = keyOf(e.from)
    const b = keyOf(e.to)
    if (a == null || b == null || a === b) continue
    if (!scopeTest(e.from) && !scopeTest(e.to)) continue
    const k = a + '\0' + b
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts].map(([k, n]) => {
    const [from, to] = k.split('\0')
    return { from, to, n }
  })
}

const under = (rel, p) => p === '' || rel === p || rel.startsWith(p + '/')

export function diagrams(cfg, model, result) {
  const { files, graph, groups, groupOf } = model
  const opts = cfg.diagrams
  const src = files.filter((f) => !f.test)
  const byRel = new Map(src.map((f) => [f.rel, f]))
  const srcSet = new Set(byRel.keys())
  const out = []
  const stat = (list) => `${fr(list.length)} fichiers · ${fr(list.reduce((s, f) => s + f.codeLines, 0))} lignes`
  // Un dossier qui n'est qu'une enveloppe (`frontend/` ≈ `frontend/src/`) : le diagramme part du sous-dossier qui tient
  // au moins 90 % des fichiers.
  const effectiveRoot = (path) => rootOf(path, src)

  // 1. Vue d'ensemble : les groupes, leurs imports, et les liens déclarés hors code (`diagrams.links`).
  {
    const nodes = groups.map((g) => {
      const fs = src.filter((f) => groupOf(f.rel) === g.name)
      return { key: 'g:' + g.name, title: `${g.name}\n${stat(fs)}`, weight: fs.length }
    }).filter((n) => n.weight)
    const edges = moduleEdges(srcSet, graph, (r) => 'g:' + groupOf(r), () => true)
    const declared = (opts.links ?? []).map((l) => ({ from: 'g:' + l.from, to: 'g:' + l.to, label: l.label }))
    const f = flow({ nodes, edges, maxNodes: opts.maxNodes, maxEdges: opts.maxEdges })
    let text = f.text.replace(/\n```\n$/, '')
    for (const d of declared) text += `\n  ${id(d.from)} -.->|${label(d.label ?? '')}| ${id(d.to)}`
    text += '\n```\n'
    out.push({ path: 'ensemble.md', title: "Vue d'ensemble", body: `Les groupes du dépôt et le nombre d'imports de l'un vers l'autre (tests exclus).${declared.length ? ' En pointillés : les liens hors code (HTTP, files…), déclarés dans la configuration.' : ''}\n\n${text}${f.notes.length ? `\n_${f.notes.join(' ; ')}._\n` : ''}` })
  }

  // 2. Chaque groupe, puis ses dossiers, sur `depth` niveaux.
  const folderDiagram = (scopeName, scopePath, level) => {
    const inScope = src.filter((f) => under(f.rel, scopePath))
    if (inScope.length < 2) return null
    const inner = (rel) => (scopePath ? rel.slice(scopePath.length + 1) : rel)
    const keyOf = (rel) => {
      if (!under(rel, scopePath)) return 'x:' + groupOf(rel)
      const parts = inner(rel).split('/')
      return parts.length === 1 ? 'f:' + rel : 'd:' + (scopePath ? scopePath + '/' : '') + parts[0]
    }
    const keys = new Map()
    for (const f of inScope) {
      const k = keyOf(f.rel)
      if (!keys.has(k)) keys.set(k, [])
      keys.get(k).push(f)
    }
    const nodes = [...keys].map(([k, fs]) => ({ key: k, title: k.startsWith('f:') ? k.slice(2).split('/').pop() : `${k.slice(2).split('/').pop()}/\n${stat(fs)}`, weight: fs.reduce((s, f) => s + f.codeLines, 0) }))
    const edges = moduleEdges(srcSet, graph, keyOf, (r) => under(r, scopePath))
    const outside = [...new Set(edges.flatMap((e) => [e.from, e.to]).filter((k) => k.startsWith('x:')))].map((k) => ({ key: k, title: k.slice(2) }))
    const f = flow({ nodes, edges, outside, maxNodes: opts.maxNodes, maxEdges: opts.maxEdges })
    const children = [...keys.keys()].filter((k) => k.startsWith('d:')).map((k) => k.slice(2))
    return { f, children, count: inScope.length }
  }
  const walkFolders = (scopeName, scopePath, level, parentPath) => {
    const d = folderDiagram(scopeName, scopePath, level)
    if (!d) return null
    const path = parentPath ? `${parentPath.replace(/\.md$/, '')}/${slug(scopePath.split('/').pop())}.md` : `groupes/${slug(scopeName)}.md`
    const entry = { path, title: scopePath || scopeName, body: '', children: [] }
    out.push(entry)
    const links = []
    if (level < opts.depth) {
      for (const c of d.children.sort()) {
        const child = walkFolders(c, c, level + 1, path)
        if (child) links.push(`- [${c.split('/').pop()}/](${relLink(path, child.path)})`)
      }
    }
    entry.body = `Dossier ${'`' + (scopePath || '.') + '`'} — ${fr(d.count)} fichiers de code. Les flèches comptent les imports ; en pointillés, les autres groupes.\n\n${d.f.text}${d.f.notes.length ? `\n_${d.f.notes.join(' ; ')}._\n` : ''}${links.length ? `\n### Sous-dossiers\n\n${links.join('\n')}\n` : ''}`
    return entry
  }
  for (const g of groups) walkFolders(g.name, effectiveRoot(g.path), 1, null)

  // 3. Les classes : par module Nest, sinon par dossier de premier niveau.
  const classesBy = new Map()
  const nestModules = []
  for (const f of src) for (const c of f.classes) {
    if (c.nestModule) nestModules.push({ file: f.rel, ...c })
  }
  const nestDirs = nestModules.map((m) => dirOf(m.file)).sort((a, b) => b.length - a.length)
  for (const f of src) {
    if (!f.classes.length) continue
    const g = groups.find((x) => x.name === groupOf(f.rel))
    let key
    const nd = nestDirs.find((d) => under(f.rel, d))
    if (nd) key = 'nest:' + nd
    else {
      const inner = g?.path ? f.rel.slice(g.path.length + 1) : f.rel
      const first = inner.includes('/') ? inner.split('/')[0] : '(racine)'
      key = `${g?.name ?? '(racine)'}:${first}`
    }
    if (!classesBy.has(key)) classesBy.set(key, [])
    classesBy.get(key).push(...f.classes.map((c) => ({ ...c, file: f.rel })))
  }
  const classIndex = []
  for (const [key, list] of [...classesBy].sort()) {
    const shown = list.slice(0, opts.maxNodes)
    const names = new Set(shown.map((c) => c.name))
    const lines = ['classDiagram']
    for (const c of shown) {
      const stereo = c.decorators.find((d) => ['Controller', 'Injectable', 'Module', 'Entity', 'Resolver', 'Component'].includes(d))
      lines.push(`  class ${id(c.name)}["${label(c.name)}"] {`)
      if (stereo) lines.push(`    <<${stereo}>>`)
      const pub = c.methods.filter((m) => !m.private)
      for (const m of pub.slice(0, opts.maxClassMembers)) lines.push(`    +${label(m.name).replace(/[{}]/g, '')}()`)
      if (pub.length > opts.maxClassMembers) lines.push(`    +… ${pub.length - opts.maxClassMembers} de plus()`)
      lines.push('  }')
    }
    for (const c of shown) {
      if (c.extends && names.has(c.extends)) lines.push(`  ${id(c.extends)} <|-- ${id(c.name)}`)
      for (const inj of c.injections) if (inj.type && names.has(inj.type) && inj.type !== c.name) lines.push(`  ${id(c.name)} ..> ${id(inj.type)} : injecte`)
    }
    const outsideInj = new Set(shown.flatMap((c) => c.injections.map((i) => i.type)).filter((t) => t && !names.has(t)))
    const title = key.startsWith('nest:') ? `Module Nest ${key.slice(5)}` : `Classes — ${key.replace(':', ' › ')}`
    const path = `classes/${slug(key.replace(/^nest:/, ''))}.md`
    classIndex.push({ title, path, n: list.length })
    out.push({ path, title, body: `${fr(list.length)} classe(s). Méthodes publiques (au plus ${opts.maxClassMembers} par classe) ; flèches pleines : héritage, pointillées : injection par le constructeur.${outsideInj.size ? ` Injections venues d'ailleurs : ${[...outsideInj].sort().map((x) => '`' + x + '`').join(', ')}.` : ''}\n\n${fence(lines)}${list.length > shown.length ? `\n_${list.length - shown.length} classe(s) non montrées._\n` : ''}` })
  }

  // 4. Le graphe des modules Nest (`@Module({ imports })`).
  if (nestModules.length) {
    const names = new Set(nestModules.map((m) => m.name))
    const lines = ['flowchart LR']
    for (const m of nestModules) lines.push(`  ${id(m.name)}["${label(m.name)}\n${m.nestModule.controllers.length} contrôleur(s) · ${m.nestModule.providers.length} fournisseur(s)"]`)
    let n = 0
    for (const m of nestModules) for (const i of m.nestModule.imports) if (names.has(i) && n++ < opts.maxEdges) lines.push(`  ${id(m.name)} --> ${id(i)}`)
    out.push({ path: 'nest-modules.md', title: 'Modules Nest', body: `Les modules Nest et leurs \`imports\` (ce que chacun reçoit des autres).\n\n${fence(lines)}` })
  }

  // 5. Les composants Vue : qui emploie qui dans son gabarit, par dossier.
  const vue = src.filter((f) => f.lang === 'vue')
  if (vue.length) {
    const resolveChild = (f, c) => graph.edges.find((e) => e.from === f.rel && c.spec && e.to.endsWith('.vue') && (e.to.endsWith('/' + c.spec.split('/').pop()) || e.to === c.spec))?.to
    const roots = new Map(groups.map((g) => [g.name, effectiveRoot(g.path)]))
    const dirKey = (rel) => {
      const base = roots.get(groupOf(rel)) ?? ''
      const inner = base ? rel.slice(base.length + 1) : rel
      const parts = inner.split('/').slice(0, -1)
      return [base, ...parts.slice(0, opts.depth)].filter(Boolean).join('/')
    }
    const byDir = new Map()
    for (const f of vue) {
      const k = dirKey(f.rel)
      if (!byDir.has(k)) byDir.set(k, [])
      byDir.get(k).push(f)
    }
    const vueIndex = []
    for (const [dir, list] of [...byDir].sort()) {
      const lines = ['flowchart TD']
      const inside = new Set(list.map((f) => f.rel))
      const shown = [...list].sort((a, b) => b.codeLines - a.codeLines).slice(0, opts.maxNodes)
      const ext = new Set()
      let edges = 0
      const edgeLines = []
      for (const f of shown) {
        for (const c of f.vue?.components ?? []) {
          const to = resolveChild(f, c)
          if (!to || edges >= opts.maxEdges) continue
          if (!inside.has(to)) ext.add(to)
          else if (!shown.some((s) => s.rel === to)) continue
          edgeLines.push(`  ${id(f.rel)} --> ${id(to)}`)
          edges++
        }
      }
      for (const f of shown) lines.push(`  ${id(f.rel)}["${label(f.rel.split('/').pop().replace(/\.vue$/, ''))}"]`)
      for (const e of ext) lines.push(`  ${id(e)}(["${label(e.split('/').pop().replace(/\.vue$/, ''))}"]):::outside`)
      lines.push(...edgeLines)
      lines.push('  classDef outside stroke-dasharray: 4 3,opacity:0.75')
      const path = `composants/${slug(dir || 'racine')}.md`
      vueIndex.push({ dir, path, n: list.length })
      out.push({ path, title: `Composants — ${dir || '.'}`, body: `${fr(list.length)} composant(s) du dossier \`${dir || '.'}\` (sous-dossiers compris) et les composants qu'ils emploient dans leur gabarit ; en pointillés, ceux d'un autre dossier.${list.length > shown.length ? ` Les ${opts.maxNodes} plus gros seulement.` : ''}\n\n${fence(lines)}` })
    }
    out.push({ path: 'composants.md', title: 'Composants Vue', body: vueIndex.map((v) => `- [${v.dir || '.'}](${relLink('composants.md', v.path)}) — ${v.n} composant(s)`).join('\n') + '\n' })
  }

  // 6. Le modèle de données Prisma.
  const prisma = cfg.prisma ?? model.all.filter((f) => f.endsWith('schema.prisma'))[0]
  if (prisma && existsSync(join(cfg.root, prisma))) {
    const er = prismaErd(readFileSync(join(cfg.root, prisma), 'utf8'))
    if (er) out.push({ path: 'donnees.md', title: 'Modèle de données', body: `Lu dans \`${prisma}\`.\n\n${fence(er)}` })
  }

  // L'index.
  const index = [
    '# Diagrammes',
    '',
    `Générés par archimetrics depuis le code (commit \`${result.commit ?? '?'}\`).`,
    '',
    `- [Vue d'ensemble](ensemble.md)`,
    ...groups.filter((g) => out.some((o) => o.path === `groupes/${slug(g.name)}.md`)).map((g) => `- Groupe [${g.name}](groupes/${slug(g.name)}.md)`),
    ...(nestModules.length ? ['- [Modules Nest](nest-modules.md)'] : []),
    ...(vue.length ? ['- [Composants Vue](composants.md)'] : []),
    ...(out.some((o) => o.path === 'donnees.md') ? ['- [Modèle de données](donnees.md)'] : []),
    ...(classIndex.length ? ['', '## Classes', '', ...classIndex.map((c) => `- [${c.title}](${c.path}) — ${c.n}`)] : []),
    '',
  ].join('\n')
  return [{ path: 'README.md', title: 'Diagrammes', body: index, raw: true }, ...out]
}

export function relLink(from, to) {
  const a = from.split('/').slice(0, -1)
  const b = to.split('/')
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}

export function prismaErd(text) {
  const models = new Map()
  let cur = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim()
    const m = line.match(/^model\s+(\w+)\s*\{/)
    if (m) { cur = { name: m[1], fields: [] }; models.set(cur.name, cur); continue }
    if (line === '}') { cur = null; continue }
    if (!cur || !line || line.startsWith('@@')) continue
    const f = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/)
    if (f) cur.fields.push({ name: f[1], type: f[2], list: !!f[3], optional: !!f[4], attrs: f[5] })
  }
  if (!models.size) return null
  const lines = ['erDiagram']
  const rel = new Set()
  for (const m of models.values()) {
    for (const f of m.fields) {
      if (!models.has(f.type)) continue
      if (f.list) {
        const k = [m.name, f.type].sort().join('|') + f.name
        if (!rel.has(k)) { rel.add(k); lines.push(`  ${m.name} ||--o{ ${f.type} : "${f.name}"`) }
      } else {
        const back = models.get(f.type).fields.filter((x) => x.type === m.name)
        if (back.some((x) => x.list)) continue // l'autre côté (la liste) l'a déjà dit
        if (back.length) {
          // Un à un : une seule ligne pour la paire.
          const k = [m.name, f.type].sort().join('|') + ':1'
          if (!rel.has(k)) { rel.add(k); lines.push(`  ${m.name} |o--o| ${f.type} : "${f.name}"`) }
        } else lines.push(`  ${m.name} }o--${f.optional ? 'o' : '|'}| ${f.type} : "${f.name}"`)
      }
    }
  }
  for (const m of models.values()) {
    lines.push(`  ${m.name} {`)
    for (const f of m.fields.filter((x) => !models.has(x.type)).slice(0, 14)) {
      const key = /@id\b/.test(f.attrs) ? ' PK' : /@unique\b/.test(f.attrs) ? ' UK' : ''
      lines.push(`    ${f.type.replace(/\W/g, '')} ${f.name}${key}`)
    }
    lines.push('  }')
  }
  return lines
}
