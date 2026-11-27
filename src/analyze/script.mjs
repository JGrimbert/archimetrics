// L'ANALYSE D'UN SCRIPT JS / TS par l'arbre syntaxique de TypeScript (aucune exécution, aucun typage) :
// - lignes de code : toute ligne qui porte le début ou la fin d'un nœud, ou l'intérieur d'un littéral (chaîne, gabarit) ;
//   les commentaires et les lignes vides ne comptent pas ;
// - imports (statiques, dynamiques, `require`, ré-exports) et exports, avec leur signature et leur JSDoc (`signatures`, `src/contexte/signatures.mjs`) ;
// - fonctions : lignes, paramètres, complexité cyclomatique, complexité cognitive, imbrication ;
// - classes : décorateurs, membres, injections du constructeur, LCOM4 ; modules Nest (`@Module`) ;
// - jetons normalisés (identifiants et littéraux fondus) pour la recherche de clones, imports exclus.
// `lineOffset` décale les numéros de ligne (le script d'un .vue commence plus bas dans le fichier).

import ts from 'typescript'
import { exportSignatures } from '../contexte/signatures.mjs'

const K = ts.SyntaxKind

const LITERAL_KINDS = new Set([K.StringLiteral, K.NoSubstitutionTemplateLiteral, K.TemplateHead, K.TemplateMiddle, K.TemplateTail, K.RegularExpressionLiteral, K.JsxText])
const LOGICAL = new Set([K.AmpersandAmpersandToken, K.BarBarToken, K.QuestionQuestionToken, K.AmpersandAmpersandEqualsToken, K.BarBarEqualsToken, K.QuestionQuestionEqualsToken])
const LOOPS = new Set([K.ForStatement, K.ForInStatement, K.ForOfStatement, K.WhileStatement, K.DoStatement])

export function scriptKindOf(ext, lang) {
  if (ext === '.tsx' || lang === 'tsx') return ts.ScriptKind.TSX
  if (ext === '.jsx' || lang === 'jsx') return ts.ScriptKind.JSX
  if (lang === 'ts' || ['.ts', '.mts', '.cts'].includes(ext)) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

const isFunctionLike = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) ||
  ts.isConstructorDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)

const nameText = (name) => {
  if (!name) return null
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name)) return `[${name.expression.getText()}]`
  return name.getText()
}

// Le premier identifiant d'une expression : `TypeOrmModule.forFeature([...])` → TypeOrmModule.
function headIdentifier(e) {
  while (e) {
    if (ts.isIdentifier(e)) return e.text
    if (ts.isCallExpression(e)) {
      // forwardRef(() => X)
      if (ts.isIdentifier(e.expression) && e.expression.text === 'forwardRef' && e.arguments[0] && ts.isArrowFunction(e.arguments[0])) {
        e = e.arguments[0].body
        continue
      }
      e = e.expression
    } else if (ts.isPropertyAccessExpression(e)) e = e.expression
    else if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) e = e.expression
    else if (ts.isObjectLiteralExpression(e)) {
      const p = e.properties.find((x) => nameText(x.name) === 'provide')
      return p && ts.isPropertyAssignment(p) ? headIdentifier(p.initializer) : null
    } else if (ts.isSpreadElement(e)) e = e.expression
    else return null
  }
  return null
}

function functionName(n) {
  if (ts.isConstructorDeclaration(n)) return 'constructor'
  if (n.name) return nameText(n.name)
  const p = n.parent
  if (!p) return '<anonyme>'
  if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) return nameText(p.name) ?? '<anonyme>'
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === K.EqualsToken) return p.left.getText().slice(0, 60)
  if (ts.isCallExpression(p)) {
    const callee = ts.isPropertyAccessExpression(p.expression) ? p.expression.name.text : ts.isIdentifier(p.expression) ? p.expression.text : 'fn'
    return `${callee}(…)`
  }
  if (ts.isExportAssignment(p)) return 'default'
  return '<anonyme>'
}

function enclosingClassName(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isClassLike(p)) return p.name?.text ?? '<classe>'
    if (isFunctionLike(p)) return null
  }
  return null
}

// Cyclomatique (McCabe) et cognitive (SonarSource, approchée : sans les sauts étiquetés ni la récursion ; une fonction
// imbriquée est mesurée à part, pas dans sa mère).
export function measureFunction(fn) {
  let cyclomatic = 1
  let cognitive = 0
  let nesting = 0
  const deeper = (n, d) => {
    if (d > nesting) nesting = d
    walk(n, d)
  }
  function children(n, d) {
    ts.forEachChild(n, (c) => walk(c, d))
  }
  function walk(n, d) {
    if (n !== fn && isFunctionLike(n)) return
    if (n.kind === K.IfStatement) {
      const elseIf = ts.isIfStatement(n.parent) && n.parent.elseStatement === n
      cyclomatic++
      cognitive += elseIf ? 1 : 1 + d
      walk(n.expression, d)
      deeper(n.thenStatement, d + 1)
      if (n.elseStatement) {
        if (ts.isIfStatement(n.elseStatement)) walk(n.elseStatement, d)
        else {
          cognitive++
          deeper(n.elseStatement, d + 1)
        }
      }
      return
    }
    if (LOOPS.has(n.kind) || n.kind === K.CatchClause || n.kind === K.ConditionalExpression) {
      cyclomatic++
      cognitive += 1 + d
      if (d + 1 > nesting) nesting = d + 1
      return children(n, d + 1)
    }
    if (n.kind === K.SwitchStatement) {
      cognitive += 1 + d
      if (d + 1 > nesting) nesting = d + 1
      return children(n, d + 1)
    }
    if (n.kind === K.CaseClause) cyclomatic++
    if (ts.isBinaryExpression(n) && LOGICAL.has(n.operatorToken.kind)) {
      cyclomatic++
      let p = n.parent
      while (p && ts.isParenthesizedExpression(p)) p = p.parent
      const same = p && ts.isBinaryExpression(p) && p.operatorToken.kind === n.operatorToken.kind
      if (!same) cognitive++
    }
    children(n, d)
  }
  if (fn.body) walk(fn.body, 0)
  return { cyclomatic, cognitive, nesting }
}

function decoratorNames(n) {
  const decs = ts.canHaveDecorators?.(n) ? ts.getDecorators(n) ?? [] : []
  return decs.map((d) => headIdentifier(d.expression)).filter(Boolean)
}

function hasModifier(n, kind) {
  return (ts.canHaveModifiers?.(n) ? ts.getModifiers(n) ?? [] : []).some((m) => m.kind === kind)
}

function typeName(t) {
  if (!t) return null
  if (ts.isTypeReferenceNode(t)) return t.typeName.getText()
  return null
}

function analyzeClass(c, lineOf) {
  const name = c.name?.text ?? '<classe>'
  const decorators = decoratorNames(c)
  const methods = []
  const fields = new Set()
  const injections = []
  const extendsName = c.heritageClauses?.find((h) => h.token === K.ExtendsKeyword)?.types[0]?.expression.getText() ?? null
  for (const m of c.members) {
    const mName = nameText(m.name)
    const priv = hasModifier(m, K.PrivateKeyword) || hasModifier(m, K.ProtectedKeyword) || (m.name && ts.isPrivateIdentifier(m.name))
    if (ts.isPropertyDeclaration(m)) {
      fields.add(mName)
      // Une propriété fléchée est une méthode pour la cohésion.
      if (m.initializer && (ts.isArrowFunction(m.initializer) || ts.isFunctionExpression(m.initializer))) methods.push({ name: mName, node: m.initializer, private: !!priv, static: hasModifier(m, K.StaticKeyword) })
    } else if (ts.isMethodDeclaration(m) || ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
      methods.push({ name: mName, node: m, private: !!priv, static: hasModifier(m, K.StaticKeyword), decorators: decoratorNames(m) })
    } else if (ts.isConstructorDeclaration(m)) {
      for (const p of m.parameters) {
        const pn = nameText(p.name)
        const isProp = (ts.getModifiers(p) ?? []).some((x) => [K.PrivateKeyword, K.PublicKeyword, K.ProtectedKeyword, K.ReadonlyKeyword].includes(x.kind))
        if (isProp) fields.add(pn)
        const injectDec = (ts.getDecorators(p) ?? []).map((d) => d.expression).find((e) => ts.isCallExpression(e) && headIdentifier(e.expression) === 'Inject')
        const injected = injectDec ? headIdentifier(injectDec.arguments[0]) ?? injectDec.arguments[0]?.getText() : typeName(p.type)
        injections.push({ name: pn, type: injected })
      }
    }
  }
  // LCOM4 : méthodes reliées si elles partagent un champ (`this.x`) ou si l'une appelle l'autre ; composantes comptées.
  const methodNames = new Set(methods.map((m) => m.name))
  const parent = new Map()
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  const union = (a, b) => parent.set(find(a), find(b))
  for (const m of methods) parent.set('m:' + m.name, 'm:' + m.name)
  for (const m of methods) {
    const visit = (n) => {
      if (ts.isPropertyAccessExpression(n) && n.expression.kind === K.ThisKeyword) {
        const target = n.name.text
        if (methodNames.has(target)) union('m:' + m.name, 'm:' + target)
        else if (fields.has(target)) {
          if (!parent.has('f:' + target)) parent.set('f:' + target, 'f:' + target)
          union('m:' + m.name, 'f:' + target)
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(m.node)
  }
  const comps = new Set(methods.map((m) => find('m:' + m.name)))
  let nestModule = null
  const modDec = (ts.getDecorators(c) ?? []).find((d) => ts.isCallExpression(d.expression) && headIdentifier(d.expression.expression) === 'Module')
  if (modDec) {
    const arg = modDec.expression.arguments[0]
    nestModule = { imports: [], controllers: [], providers: [], exports: [] }
    if (arg && ts.isObjectLiteralExpression(arg)) {
      for (const p of arg.properties) {
        const key = nameText(p.name)
        if (!(key in nestModule) || !ts.isPropertyAssignment(p) || !ts.isArrayLiteralExpression(p.initializer)) continue
        nestModule[key] = p.initializer.elements.map(headIdentifier).filter(Boolean)
      }
    }
  }
  return {
    name,
    line: lineOf(c.getStart()),
    decorators,
    extends: extendsName,
    methods: methods.map((m) => ({ name: m.name, private: m.private, static: m.static, decorators: m.decorators ?? [] })),
    fields: [...fields],
    injections,
    lcom4: methods.length ? comps.size : 0,
    nestModule,
  }
}

export function analyzeScript(text, { ext = '.js', lang = null, lineOffset = 0, fileName = 'x' + ext } = {}) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKindOf(ext, lang))
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1 + lineOffset
  const code = new Set()
  const tokens = []
  const tokenLines = []
  const imports = []
  const exports = new Set()
  const typeExports = new Set()
  const functions = []
  const classes = []
  const calls = new Set() // appels nommés (defineProps, defineEmits…)

  // Lignes de code et jetons : parcours complet (ponctuation comprise), sans entrer dans la JSDoc.
  const visitTokens = (n, inImport) => {
    if (n.kind >= K.FirstJSDocNode && n.kind <= K.LastJSDocNode) return
    const start = n.getStart(sf)
    const end = n.getEnd()
    if (end <= start) return
    const l1 = lineOf(start)
    const l2 = lineOf(end - 1)
    code.add(l1)
    code.add(l2)
    if (LITERAL_KINDS.has(n.kind)) for (let l = l1; l <= l2; l++) code.add(l)
    const imp = inImport || n.kind === K.ImportDeclaration || n.kind === K.ImportEqualsDeclaration || (n.kind === K.ExportDeclaration && !!n.moduleSpecifier)
    const kids = n.getChildren(sf)
    if (!kids.length) {
      if (!imp && n.kind !== K.EndOfFileToken) {
        let t
        if (n.kind === K.Identifier || n.kind === K.PrivateIdentifier) t = 'i'
        else if (LITERAL_KINDS.has(n.kind) || n.kind === K.NumericLiteral || n.kind === K.BigIntLiteral) t = 'l'
        else t = String(n.kind)
        tokens.push(t)
        tokenLines.push(l1)
      }
      return
    }
    for (const k of kids) visitTokens(k, imp)
  }
  visitTokens(sf, false)

  const addImport = (spec, names, extra = {}) => imports.push({ spec, names, line: 0, ...extra })

  const visit = (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const names = []
      const locals = []
      const cl = n.importClause
      if (cl?.name) {
        names.push('default')
        locals.push({ local: cl.name.text, imported: 'default' })
      }
      const nb = cl?.namedBindings
      if (nb && ts.isNamespaceImport(nb)) {
        names.push('*')
        locals.push({ local: nb.name.text, imported: '*' })
      } else if (nb && ts.isNamedImports(nb)) {
        for (const e of nb.elements) {
          const imported = (e.propertyName ?? e.name).text
          names.push(imported)
          locals.push({ local: e.name.text, imported })
        }
      }
      addImport(n.moduleSpecifier.text, names, { locals, typeOnly: !!cl?.isTypeOnly || (names.length > 0 && nb && ts.isNamedImports(nb) && nb.elements.every((e) => e.isTypeOnly) && !cl?.name), line: lineOf(n.getStart()) })
    } else if (ts.isExportDeclaration(n)) {
      if (n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const names = n.exportClause && ts.isNamedExports(n.exportClause) ? n.exportClause.elements.map((e) => (e.propertyName ?? e.name).text) : ['*']
        addImport(n.moduleSpecifier.text, names, { reexport: true, typeOnly: n.isTypeOnly, line: lineOf(n.getStart()) })
      }
      if (n.exportClause && ts.isNamedExports(n.exportClause)) for (const e of n.exportClause.elements) exports.add(e.name.text)
      else if (!n.exportClause && n.moduleSpecifier) exports.add('*')
    } else if (ts.isExportAssignment(n)) {
      exports.add('default')
    } else if (ts.isCallExpression(n)) {
      if (n.expression.kind === K.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) addImport(n.arguments[0].text, ['*'], { dynamic: true, line: lineOf(n.getStart()) })
      else if (ts.isIdentifier(n.expression)) {
        calls.add(n.expression.text)
        if (n.expression.text === 'require' && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) addImport(n.arguments[0].text, ['*'], { line: lineOf(n.getStart()) })
      }
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteral(n.moduleReference.expression)) {
      addImport(n.moduleReference.expression.text, ['*'], { line: lineOf(n.getStart()) })
    }

    if (hasModifier(n, K.ExportKeyword)) {
      if (hasModifier(n, K.DefaultKeyword)) exports.add('default')
      else if (ts.isVariableStatement(n)) {
        for (const d of n.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) exports.add(d.name.text)
          else d.name.elements?.forEach((e) => e.name && ts.isIdentifier(e.name) && exports.add(e.name.text))
        }
      } else if (n.name) {
        exports.add(nameText(n.name))
        // Un type exporté peut l'être par obligation (une signature publique qui le nomme) : jamais compté comme mort.
        if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) typeExports.add(nameText(n.name))
      }
    }

    if (isFunctionLike(n) && (n.body || ts.isConstructorDeclaration(n))) {
      const cls = enclosingClassName(n)
      const base = functionName(n)
      const m = measureFunction(n)
      const l1 = lineOf(n.getStart())
      const l2 = lineOf(n.getEnd() - 1)
      let codeLines = 0
      for (let l = l1; l <= l2; l++) if (code.has(l)) codeLines++
      functions.push({
        name: cls ? `${cls}.${base}` : base,
        line: l1,
        endLine: l2,
        codeLines,
        params: n.parameters.filter((p) => !(ts.isIdentifier(p.name) && p.name.text === 'this')).length,
        ...m,
      })
    }
    if (ts.isClassLike(n)) classes.push(analyzeClass(n, lineOf))
    ts.forEachChild(n, visit)
  }
  visit(sf)

  return { sf, code, tokens, tokenLines, imports, exports: [...exports].filter((e) => !typeExports.has(e)), typeExports: [...typeExports], functions, classes, calls: [...calls], signatures: exportSignatures(sf, lineOffset), lines: sf.getLineAndCharacterOfPosition(sf.getEnd()).line + 1 }
}

// Le nombre de props / emits déclarés (defineProps({…}), defineProps<{…}>(), defineProps([…]), ou l'option `props` / `emits`).
export function countDeclared(sf, macro, option) {
  let n = 0
  const sizeOf = (node) => {
    if (!node) return 0
    if (ts.isObjectLiteralExpression(node)) return node.properties.length
    if (ts.isArrayLiteralExpression(node)) return node.elements.length
    if (ts.isTypeLiteralNode(node)) return node.members.length
    return 0
  }
  const visit = (x) => {
    if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === macro) {
      n = Math.max(n, sizeOf(x.arguments[0]) || sizeOf(x.typeArguments?.[0]))
    }
    if (ts.isPropertyAssignment(x) && nameText(x.name) === option && ts.isExportAssignment(x.parent?.parent ?? {})) n = Math.max(n, sizeOf(x.initializer))
    ts.forEachChild(x, visit)
  }
  visit(sf)
  return n
}
