// LES SIGNATURES EXPORTÉES d'un script JS / TS, lues sur l'arbre syntaxique de TypeScript (aucune exécution, aucun
// typage) : pour chaque export, son nom, son genre, sa signature (paramètres tels qu'écrits, type de retour quand il est
// écrit), sa JSDoc et, à défaut, le commentaire `//` qui le précède immédiatement. Sert au paquet de contexte et au
// `CLAUDE.md` généré (AM-8) ; appelé par `analyzeScript` (`signatures`).

import ts from 'typescript'

const K = ts.SyntaxKind
const MAX_INIT = 80

const mods = (n) => (ts.canHaveModifiers(n) ? ts.getModifiers(n) ?? [] : [])
const has = (n, k) => mods(n).some((m) => m.kind === k)
const oneLine = (s) => s.replace(/\s+/g, ' ').trim()
const short = (s) => (s.length > MAX_INIT ? s.slice(0, MAX_INIT - 1) + '…' : s)

const typeParams = (sf, n) => (n.typeParameters?.length ? '<' + n.typeParameters.map((t) => oneLine(t.getText(sf))).join(', ') + '>' : '')
const callSig = (sf, fn) => typeParams(sf, fn) + '(' + fn.parameters.map((p) => oneLine(p.getText(sf))).join(', ') + ')' + (fn.type ? ': ' + oneLine(fn.type.getText(sf)) : '')
const isPrivate = (m) => has(m, K.PrivateKeyword) || has(m, K.ProtectedKeyword) || (m.name && ts.isPrivateIdentifier(m.name))
const memberName = (m) => (m.name ? oneLine(m.name.getText()) : '')

function functionSig(sf, fn, name) {
  const asy = has(fn, K.AsyncKeyword) ? 'async ' : ''
  return `${asy}function${fn.asteriskToken ? '*' : ''} ${name ?? ''}${callSig(sf, fn)}`
}

function memberSig(sf, m) {
  const st = has(m, K.StaticKeyword) ? 'static ' : ''
  if (ts.isConstructorDeclaration(m)) return 'constructor' + callSig(sf, m)
  if (ts.isMethodDeclaration(m)) return `${st}${has(m, K.AsyncKeyword) ? 'async ' : ''}${m.asteriskToken ? '*' : ''}${memberName(m)}${callSig(sf, m)}`
  if (ts.isGetAccessorDeclaration(m)) return `${st}get ${memberName(m)}${callSig(sf, m)}`
  if (ts.isSetAccessorDeclaration(m)) return `${st}set ${memberName(m)}${callSig(sf, m)}`
  if (ts.isPropertyDeclaration(m)) {
    const ro = has(m, K.ReadonlyKeyword) ? 'readonly ' : ''
    const fn = m.initializer && (ts.isArrowFunction(m.initializer) || ts.isFunctionExpression(m.initializer)) ? m.initializer : null
    if (fn) return `${st}${memberName(m)}${callSig(sf, fn)}`
    return `${st}${ro}${memberName(m)}${m.questionToken ? '?' : ''}${m.type ? ': ' + oneLine(m.type.getText(sf)) : ''}`
  }
  if (ts.isIndexSignatureDeclaration(m)) return oneLine(m.getText(sf))
  return null
}

function classSig(sf, c, name) {
  const heritage = (c.heritageClauses ?? []).map((h) => oneLine(h.getText(sf))).join(' ')
  const head = `${has(c, K.AbstractKeyword) ? 'abstract ' : ''}class ${name ?? ''}${typeParams(sf, c)}${heritage ? ' ' + heritage : ''}`
  const members = c.members.filter((m) => !isPrivate(m) && !(ts.isConstructorDeclaration(m) && !m.parameters.length)).map((m) => memberSig(sf, m)).filter(Boolean)
  return members.length ? `${head.trimEnd()} {\n${members.map((m) => '  ' + m).join('\n')}\n}` : head.trimEnd()
}

function initializerText(sf, init) {
  if (ts.isObjectLiteralExpression(init)) {
    const keys = init.properties.map((p) => (p.name ? oneLine(p.name.getText(sf)) : ts.isSpreadAssignment(p) ? '...' + oneLine(p.expression.getText(sf)) : '?'))
    return short(`{ ${keys.join(', ')} }`)
  }
  return short(oneLine(init.getText(sf)))
}

function variableSig(sf, kw, d) {
  const name = oneLine(d.name.getText(sf))
  const init = d.initializer
  if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
    const asy = has(init, K.AsyncKeyword) ? 'async ' : ''
    return { kind: 'function', signature: `${kw} ${name} = ${asy}${callSig(sf, init)} => …` }
  }
  if (init && ts.isClassExpression(init)) return { kind: 'class', signature: `${kw} ${name} = ${classSig(sf, init, init.name?.text)}` }
  if (d.type) return { kind: kw, signature: `${kw} ${name}: ${oneLine(d.type.getText(sf))}` }
  return { kind: kw, signature: init ? `${kw} ${name} = ${initializerText(sf, init)}` : `${kw} ${name}` }
}

// La JSDoc (le dernier bloc `/** … */` attaché), et à défaut le commentaire qui précède sans ligne vide.
function docsOf(sf, node, stmt) {
  const jsdocs = ts.getJSDocCommentsAndTags(node).filter((j) => ts.isJSDoc(j))
  const last = jsdocs[jsdocs.length - 1]
  const jsdoc = last ? last.getText(sf).replace(/\r\n/g, '\n') : null
  let comment = null
  let start = last ? last.getStart(sf) : stmt.getStart(sf)
  if (!last) {
    const ranges = ts.getLeadingCommentRanges(sf.text, stmt.getFullStart()) ?? []
    const kept = []
    let next = stmt.getStart(sf)
    for (let i = ranges.length - 1; i >= 0; i--) {
      const r = ranges[i]
      if (/\n\s*\n/.test(sf.text.slice(r.end, next))) break
      kept.unshift(r)
      next = r.pos
    }
    if (kept.length) {
      comment = kept.map((r) => sf.text.slice(r.pos, r.end)).join('\n').replace(/\r\n/g, '\n')
      start = kept[0].pos
    }
  }
  return { jsdoc, comment, start }
}

// Une déclaration de premier niveau → [{ name, kind, signature, node }] (une par nom déclaré).
function declared(sf, stmt) {
  const isDefault = has(stmt, K.DefaultKeyword)
  if (ts.isFunctionDeclaration(stmt)) return [{ name: stmt.name?.text ?? 'default', kind: 'function', signature: functionSig(sf, stmt, stmt.name?.text), node: stmt, isDefault }]
  if (ts.isClassDeclaration(stmt)) return [{ name: stmt.name?.text ?? 'default', kind: 'class', signature: classSig(sf, stmt, stmt.name?.text), node: stmt, isDefault }]
  if (ts.isVariableStatement(stmt)) {
    const flags = stmt.declarationList.flags
    const kw = flags & ts.NodeFlags.Const ? 'const' : flags & ts.NodeFlags.Let ? 'let' : 'var'
    const out = []
    for (const d of stmt.declarationList.declarations) {
      const names = ts.isIdentifier(d.name) ? [d.name.text] : (d.name.elements ?? []).filter((e) => e.name && ts.isIdentifier(e.name)).map((e) => e.name.text)
      const sig = variableSig(sf, kw, d)
      for (const name of names) out.push({ name, ...sig, node: d })
    }
    return out
  }
  if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
    const kind = ts.isInterfaceDeclaration(stmt) ? 'interface' : ts.isTypeAliasDeclaration(stmt) ? 'type' : 'enum'
    const text = stmt.getText(sf).replace(/\r\n/g, '\n').replace(/^export\s+(default\s+)?/, '')
    return [{ name: stmt.name.text, kind, signature: text, node: stmt, isDefault }]
  }
  return []
}

/**
 * Les exports d'un fichier, dans l'ordre du source : { name, kind, signature, jsdoc, comment, line, endLine, docLine,
 * from? }. `kind` : function, class, const, let, var, interface, type, enum, reexport, default. Les surcharges d'une
 * fonction (TypeScript) sont fondues en une entrée, une signature par ligne.
 * @param {import('typescript').SourceFile} sf
 * @param {number} [lineOffset]
 */
export function exportSignatures(sf, lineOffset = 0) {
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1 + lineOffset
  const locals = new Map()
  for (const stmt of sf.statements) for (const d of declared(sf, stmt)) if (!locals.has(d.name)) locals.set(d.name, { ...d, stmt })
  const out = []
  const byName = new Map()
  const push = (name, d, stmt, extra = {}) => {
    const prev = byName.get(name)
    if (prev && prev.kind === 'function' && d.kind === 'function') {
      // Surcharge : la signature s'ajoute ; le corps (la dernière) donne la fin.
      if (!prev.signature.split('\n').includes(d.signature)) prev.signature += '\n' + d.signature
      prev.endLine = lineOf(stmt.getEnd() - 1)
      return
    }
    const { jsdoc, comment, start } = docsOf(sf, d.node ?? stmt, stmt)
    const e = { name, kind: d.kind, signature: d.signature, jsdoc, comment, line: lineOf(stmt.getStart(sf)), endLine: lineOf(stmt.getEnd() - 1), docLine: lineOf(start), ...extra }
    byName.set(name, e)
    out.push(e)
  }
  for (const stmt of sf.statements) {
    if (ts.isExportDeclaration(stmt)) {
      const from = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : null
      const clause = stmt.exportClause
      if (from) {
        const pick = (name, sig) => push(name, { kind: 'reexport', signature: sig }, stmt, { from })
        if (!clause) pick('*', `export * from '${from}'`)
        else if (ts.isNamespaceExport(clause)) pick(clause.name.text, `export * as ${clause.name.text} from '${from}'`)
        else for (const el of clause.elements) pick(el.name.text, `export { ${el.propertyName ? el.propertyName.text + ' as ' : ''}${el.name.text} } from '${from}'`)
      } else if (clause && ts.isNamedExports(clause)) {
        for (const el of clause.elements) {
          const local = locals.get((el.propertyName ?? el.name).text)
          if (local) push(el.name.text, local, local.stmt)
          else push(el.name.text, { kind: 'reexport', signature: `export { ${oneLine(el.getText(sf))} }` }, stmt)
        }
      }
    } else if (ts.isExportAssignment(stmt)) {
      const local = ts.isIdentifier(stmt.expression) ? locals.get(stmt.expression.text) : null
      if (local) push('default', local, local.stmt)
      else push('default', { kind: 'default', signature: `export ${stmt.isExportEquals ? '= ' : 'default '}${initializerText(sf, stmt.expression)}` }, stmt)
    } else if (has(stmt, K.ExportKeyword)) {
      for (const d of declared(sf, stmt)) push(d.isDefault ? 'default' : d.name, d, stmt)
    }
  }
  return out
}
