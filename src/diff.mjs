// LA COMPARAISON DE DEUX RELEVÉS (`archimetrics diff`) : écart de chaque champ de `summary`, violations ajoutées et
// résorbées par règle (par clé, comme la baseline), écart par groupe, fichiers apparus et disparus quand les deux relevés
// ont leur inventaire (`files`). Le diff informe ; c'est `check` qui juge.
// Un relevé sans `schemaVersion` (antérieur à v1, ex. branche `metriques` de scribe) est lu comme « pré-v1 », avec un
// avertissement, s'il a au moins `summary` et `violations`.

import { readFileSync } from 'node:fs'
import { DIFF_SCHEMA, METRICS_SCHEMA } from './schema.mjs'
const GROUP_FIELDS = ['files', 'codeLines', 'functions', 'complexity']
const MAX_LISTED = 50

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const keyOf = (v) => (typeof v === 'string' ? v : v?.key)
const delta = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.round((b - a) * 1000) / 1000 : null)

/**
 * Vérifie qu'un relevé est comparable ; rend `{ doc, version, warning }` ou lève une erreur claire.
 * @param {any} doc
 * @param {string} label nom affiché dans les messages (souvent le chemin du fichier)
 */
export function readableMetrics(doc, label) {
  if (!isObject(doc)) throw new Error(`${label} : ce n'est pas un relevé archimetrics (objet JSON attendu)`)
  if (doc.schemaVersion === METRICS_SCHEMA) return { doc, version: METRICS_SCHEMA, warning: null }
  if (doc.schemaVersion !== undefined) throw new Error(`${label} : format « ${doc.schemaVersion} » non pris en charge (attendu ${METRICS_SCHEMA})`)
  if (!isObject(doc.summary) || !isObject(doc.violations)) throw new Error(`${label} : ni schemaVersion, ni summary et violations — ce n'est pas un relevé archimetrics comparable`)
  return { doc, version: 'pré-v1', warning: `${label} : relevé sans schemaVersion, lu comme pré-v1 (seuls summary, violations, groups et files sont comparés)` }
}

/** Lit un fichier `metrics.json` (voir `readableMetrics`). */
export function readMetricsFile(path) {
  let doc
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`${path} : illisible (${e.code ?? e.message})`)
  }
  return readableMetrics(doc, path)
}

function summaryDiff(a, b) {
  const out = {}
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = { before: a[k] ?? null, after: b[k] ?? null, delta: delta(a[k], b[k]) }
  return out
}

function violationsDiff(a, b) {
  const out = {}
  for (const rule of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const before = new Set((a[rule] ?? []).map(keyOf))
    const after = new Set((b[rule] ?? []).map(keyOf))
    if (!before.size && !after.size) continue
    out[rule] = {
      before: before.size,
      after: after.size,
      added: [...after].filter((k) => !before.has(k)).sort(),
      resolved: [...before].filter((k) => !after.has(k)).sort(),
    }
  }
  return out
}

function groupEntry(name, ga, gb) {
  const entry = { name, status: !ga ? 'apparu' : !gb ? 'disparu' : 'commun' }
  for (const f of GROUP_FIELDS) entry[f] = { before: ga?.[f] ?? null, after: gb?.[f] ?? null, delta: delta(ga?.[f] ?? 0, gb?.[f] ?? 0) }
  return entry
}

function groupsDiff(a = [], b = []) {
  const byName = (list) => new Map((Array.isArray(list) ? list : []).map((g) => [g.name, g]))
  const ma = byName(a)
  const mb = byName(b)
  return [...new Set([...ma.keys(), ...mb.keys()])].sort().map((n) => groupEntry(n, ma.get(n), mb.get(n)))
}

function filesDiff(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return { available: false, added: [], removed: [] }
  const pa = new Set(a.map((f) => f.path))
  const pb = new Set(b.map((f) => f.path))
  return { available: true, added: [...pb].filter((p) => !pa.has(p)).sort(), removed: [...pa].filter((p) => !pb.has(p)).sort() }
}

const side = (doc, label) => ({ label, name: doc.name ?? null, commit: doc.commit ?? null, date: doc.date ?? null, schemaVersion: doc.schemaVersion ?? null })

/**
 * Compare deux relevés lisibles (`readableMetrics`) ; rend le contenu de `metrics-diff.json`.
 * @param {{ doc: any, label?: string, warning?: string|null }} before
 * @param {{ doc: any, label?: string, warning?: string|null }} after
 */
export function diffMetrics(before, after) {
  const a = before.doc
  const b = after.doc
  const violations = violationsDiff(a.violations, b.violations)
  const count = (k) => Object.values(violations).reduce((s, v) => s + v[k].length, 0)
  return {
    schemaVersion: DIFF_SCHEMA,
    tool: 'archimetrics',
    date: new Date().toISOString(),
    before: side(a, before.label ?? 'avant'),
    after: side(b, after.label ?? 'après'),
    summary: summaryDiff(a.summary, b.summary),
    violations,
    totals: { added: count('added'), resolved: count('resolved') },
    groups: groupsDiff(a.groups, b.groups),
    files: filesDiff(a.files, b.files),
    warnings: [before.warning, after.warning].filter(Boolean),
  }
}

// ——— Markdown ———

const signed = (d) => (d === null ? '—' : d > 0 ? `+${d}` : String(d))
const cell = (v) => (v === null || v === undefined ? '—' : String(v))
const row = (cells) => `| ${cells.join(' | ')} |`

function listed(keys, mark) {
  const shown = keys.slice(0, MAX_LISTED).map((k) => `  - ${mark} \`${k}\``)
  if (keys.length > MAX_LISTED) shown.push(`  - … et ${keys.length - MAX_LISTED} autre(s)`)
  return shown
}

function summaryMd(summary) {
  const rows = Object.entries(summary).map(([k, v]) => row([k, cell(v.before), cell(v.after), signed(v.delta)]))
  return ['## Résumé', '', row(['Champ', 'Avant', 'Après', 'Écart']), row(['---', '--:', '--:', '--:']), ...rows]
}

function violationsMd(violations, totals) {
  const out = ['## Violations', '', `${totals.added} ajoutée(s), ${totals.resolved} résorbée(s).`]
  for (const [rule, v] of Object.entries(violations)) {
    if (!v.added.length && !v.resolved.length) continue
    out.push('', `- **${rule}** : ${v.before} → ${v.after}`, ...listed(v.added, '+'), ...listed(v.resolved, '−'))
  }
  return out
}

function groupsMd(groups) {
  const changed = groups.filter((g) => g.status !== 'commun' || GROUP_FIELDS.some((f) => g[f].delta))
  if (!changed.length) return ['## Groupes', '', 'Aucun écart.']
  const rows = changed.map((g) => row([g.name, g.status, ...GROUP_FIELDS.map((f) => `${cell(g[f].before)} → ${cell(g[f].after)} (${signed(g[f].delta)})`)]))
  return ['## Groupes', '', row(['Groupe', 'État', ...GROUP_FIELDS]), row(['---', '---', ...GROUP_FIELDS.map(() => '--:')]), ...rows]
}

function filesMd(files) {
  if (!files.available) return ['## Fichiers', '', "Inventaire absent d'un des deux relevés : fichiers apparus et disparus non comparés."]
  return ['## Fichiers', '', `${files.added.length} apparu(s), ${files.removed.length} disparu(s).`, ...listed(files.added, '+'), ...listed(files.removed, '−')]
}

// ——— Configurations des deux côtés (D-020) ———

const canonical = (v) => JSON.stringify(v, (_, x) => (isObject(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))

/**
 * Les clés de premier niveau qui diffèrent entre deux configurations déclarées (`null` : pas de fichier), triées.
 * @param {object|null} a
 * @param {object|null} b
 */
export function configDifference(a, b) {
  const x = a ?? {}
  const y = b ?? {}
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => canonical(x[k]) !== canonical(y[k])).sort()
}

/**
 * L'avertissement de D-020 : chaque côté d'un `diff --base` est mesuré avec SA configuration ; quand elles diffèrent, la
 * comparaison mélange deux lunettes, on le dit. Rend null si elles sont identiques (ou toutes deux absentes).
 * @param {{ label: string, config: object|null }} before
 * @param {{ label: string, config: object|null }} after
 */
export function configWarning(before, after) {
  const keys = configDifference(before.config, after.config)
  if (!keys.length) return null
  const absent = [before, after].filter((s) => s.config === null).map((s) => s.label)
  const what = absent.length ? `absente côté ${absent.join(' et ')}` : `clés différentes : ${keys.join(', ')}`
  return `les deux côtés n'ont pas la même configuration (archimetrics.config.json ${what}) ; chacun est mesuré avec la sienne — passer --config <fichier> pour imposer la même (D-020)`
}

/** Le résumé Markdown du diff (`metrics-diff.md`). */
export function diffMarkdown(d) {
  const who = (s) => `${s.label}${s.commit ? ` (\`${s.commit}\`)` : ''}`
  return [
    `# archimetrics diff — ${d.after.name ?? d.before.name ?? ''}`,
    '',
    `${who(d.before)} → ${who(d.after)}`,
    ...d.warnings.map((w) => `\n> ⚠ ${w}`),
    '',
    ...summaryMd(d.summary),
    '',
    ...violationsMd(d.violations, d.totals),
    '',
    ...groupsMd(d.groups),
    '',
    ...filesMd(d.files),
    '',
  ].join('\n')
}
