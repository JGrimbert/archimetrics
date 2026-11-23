// TAILLES ET COMPLEXITÉ : fichiers (lignes de code) et fonctions (lignes, paramètres, cyclomatique, cognitive, imbrication),
// comparés aux seuils ; les tests ne sont jamais soumis aux seuils.

const BUCKETS = [50, 100, 200, 300, 400, 600, 800, 1200]

function histogram(values, bounds) {
  const out = bounds.map((b) => ({ max: b, n: 0 }))
  out.push({ max: Infinity, n: 0 })
  for (const v of values) out.find((b) => v <= b.max).n++
  return out
}

export function sizeMetrics(files, limits) {
  const src = files.filter((f) => !f.test)
  const violations = { fileCodeLines: [] }
  if (limits.fileCodeLines) {
    for (const f of src) if (f.codeLines > limits.fileCodeLines) violations.fileCodeLines.push({ key: f.rel, value: f.codeLines, limit: limits.fileCodeLines, detail: f.blocks ? `script ${f.blocks.script} · gabarit ${f.blocks.template} · styles ${f.blocks.style}` : null })
  }
  violations.fileCodeLines.sort((a, b) => b.value - a.value)
  const byLang = {}
  for (const f of files) {
    const k = f.lang
    byLang[k] ??= { files: 0, codeLines: 0, testFiles: 0, testCodeLines: 0 }
    if (f.test) { byLang[k].testFiles++; byLang[k].testCodeLines += f.codeLines } else { byLang[k].files++; byLang[k].codeLines += f.codeLines }
  }
  return {
    files: src.length,
    testFiles: files.length - src.length,
    codeLines: src.reduce((s, f) => s + f.codeLines, 0),
    testCodeLines: files.filter((f) => f.test).reduce((s, f) => s + f.codeLines, 0),
    byLang,
    histogram: histogram(src.map((f) => f.codeLines), BUCKETS),
    largest: [...src].sort((a, b) => b.codeLines - a.codeLines).slice(0, 15).map((f) => ({ file: f.rel, codeLines: f.codeLines, lines: f.lines, blocks: f.blocks ?? null })),
    violations,
  }
}

const FN_RULES = [
  ['functionLines', 'codeLines'],
  ['params', 'params'],
  ['cyclomatic', 'cyclomatic'],
  ['cognitive', 'cognitive'],
  ['nesting', 'nesting'],
]

export function functionMetrics(files, limits) {
  const fns = []
  for (const f of files) {
    if (f.test) continue
    const seen = new Map()
    for (const fn of f.functions) {
      const n = (seen.get(fn.name) ?? 0) + 1
      seen.set(fn.name, n)
      fns.push({ ...fn, file: f.rel, key: `${f.rel}#${fn.name}${n > 1 ? '#' + n : ''}` })
    }
  }
  const violations = {}
  for (const [rule, field] of FN_RULES) {
    violations[rule] = []
    if (!limits[rule]) continue
    for (const fn of fns) if (fn[field] > limits[rule]) violations[rule].push({ key: fn.key, value: fn[field], limit: limits[rule], detail: `ligne ${fn.line}` })
    violations[rule].sort((a, b) => b.value - a.value)
  }
  const avg = (k) => (fns.length ? Math.round((fns.reduce((s, f) => s + f[k], 0) / fns.length) * 10) / 10 : 0)
  const pct = (k, p) => {
    if (!fns.length) return 0
    const v = fns.map((f) => f[k]).sort((a, b) => a - b)
    return v[Math.min(v.length - 1, Math.floor(v.length * p))]
  }
  return {
    count: fns.length,
    average: { codeLines: avg('codeLines'), cyclomatic: avg('cyclomatic'), cognitive: avg('cognitive') },
    p90: { codeLines: pct('codeLines', 0.9), cyclomatic: pct('cyclomatic', 0.9), cognitive: pct('cognitive', 0.9) },
    cyclomaticHistogram: histogram(fns.map((f) => f.cyclomatic), [1, 5, 10, 15, 20, 30, 50]),
    cognitiveHistogram: histogram(fns.map((f) => f.cognitive), [0, 5, 10, 15, 20, 30, 50]),
    mostComplex: [...fns].sort((a, b) => b.cognitive - a.cognitive || b.cyclomatic - a.cyclomatic).slice(0, 20).map(({ key, tokens, ...x }) => x),
    longest: [...fns].sort((a, b) => b.codeLines - a.codeLines).slice(0, 10).map(({ key, ...x }) => x),
    perFile: Object.fromEntries(files.filter((f) => !f.test).map((f) => [f.rel, f.functions.reduce((s, x) => s + x.cyclomatic, 0)])),
    violations,
  }
}
