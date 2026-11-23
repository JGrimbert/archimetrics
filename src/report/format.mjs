// PETITS OUTILS DE MISE EN FORME partagés par les rapports.

export const fr = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR').replace(/ | /g, ' ') : String(n ?? '—'))

export const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function table(head, rows, align = []) {
  if (!rows.length) return '_Rien à signaler._\n'
  const sep = head.map((_, i) => (align[i] === 'r' ? '---:' : '---'))
  return [head, sep, ...rows].map((r) => '| ' + r.map(esc).join(' | ') + ' |').join('\n') + '\n'
}

export const code = (s) => '`' + String(s).replace(/`/g, "'") + '`'

export const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function delta(now, before, lowerIsBetter = true) {
  if (before == null || now == null) return ''
  const d = Math.round((now - before) * 10) / 10
  if (!d) return '='
  const better = lowerIsBetter ? d < 0 : d > 0
  return `${d > 0 ? '+' : '−'}${fr(Math.abs(d))} (${better ? 'mieux' : 'moins bien'})`
}
