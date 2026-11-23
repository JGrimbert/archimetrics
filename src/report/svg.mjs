// LES IMAGES DE LA PAGE D'ACCUEIL (SVG autonomes, lus par <img> dans le README du projet) :
// - resume.svg    : les chiffres clés et leur écart au relevé précédent ;
// - evolution.svg : quatre courbes au fil des relevés (petits multiples, un axe chacun) ;
// - carte.svg     : carte proportionnelle (treemap) des dossiers, aire = lignes de code, teinte = densité de complexité ;
// - risques.svg   : les points chauds (commits × complexité), en barres.
// Couleurs : palette de référence validée (bleu séquentiel, statuts réservés), thème clair et sombre par
// `prefers-color-scheme`, fond plein (une image doit se lire sur n'importe quel fond).

import { fr, xml } from './format.mjs'
import { effectiveRoot, moduleAt } from '../metrics/groups.mjs'

const FONT = "font-family: -apple-system, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif"
const SEQ_LIGHT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95']
const SEQ_DARK = ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#5598e7', '#86b6ef']

const STYLE = `
  <style>
    svg { ${FONT}; }
    .bg { fill: #fcfcfb; } .card { fill: #f4f3f0; } .t1 { fill: #0b0b0b; } .t2 { fill: #52514e; } .t3 { fill: #6e6d68; }
    .grid { stroke: #e4e3df; } .line { stroke: #2a78d6; fill: none; } .dot { fill: #2a78d6; stroke: #fcfcfb; } .bar { fill: #2a78d6; }
    .bad { fill: #d03b3b; } .good { fill: #0ca30c; } .edge { stroke: #fcfcfb; }
    ${SEQ_LIGHT.map((c, i) => `.q${i} { fill: ${c}; }`).join(' ')}
    .ink0, .ink1, .ink2 { fill: #0b0b0b; } .ink3, .ink4, .ink5 { fill: #ffffff; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #1a1a19; } .card { fill: #242423; } .t1 { fill: #f0efec; } .t2 { fill: #c3c2b7; } .t3 { fill: #9c9b93; }
      .grid { stroke: #383835; } .line { stroke: #3987e5; } .dot { fill: #3987e5; stroke: #1a1a19; } .bar { fill: #3987e5; }
      .bad { fill: #e66767; } .edge { stroke: #1a1a19; }
      ${SEQ_DARK.map((c, i) => `.q${i} { fill: ${c}; }`).join(' ')}
      .ink0, .ink1, .ink2 { fill: #f0efec; } .ink3, .ink4, .ink5 { fill: #0b0b0b; }
    }
  </style>`

const wrap = (w, h, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${xml(title)}">\n  <title>${xml(title)}</title>${STYLE}\n  <rect class="bg" width="${w}" height="${h}" rx="6"/>\n${body}\n</svg>\n`

// Un chemin garde sa fin (le nom du fichier) ; un nom garde son début.
const short = (s, n) => (s.length > n ? '…' + s.slice(s.length - n + 1) : s)
const cut = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)

// Écart au relevé précédent, dit en mots (plus bas = mieux pour toutes ces mesures, sauf indication).
function deltaText(now, before, unit = '') {
  if (before == null) return 'premier relevé'
  const d = Math.round((now - before) * 10) / 10
  if (!d) return 'inchangé depuis le relevé précédent'
  return `${d > 0 ? '+' : '−'}${fr(Math.abs(d))}${unit} depuis le relevé précédent`
}

export function resumeSvg(result, previous, check) {
  const s = result.summary
  const p = previous?.summary
  const tiles = [
    ['Lignes de code', fr(s.codeLines), deltaText(s.codeLines, p?.codeLines)],
    ['Fichiers de code', fr(s.files), `${fr(s.testFiles)} fichiers de test à part`],
    ['Complexité moyenne', fr(s.cyclomaticAvg), `cyclomatique par fonction · ${deltaText(s.cyclomaticAvg, p?.cyclomaticAvg)}`],
    ['Duplication', fr(s.duplicationPercent) + ' %', deltaText(s.duplicationPercent, p?.duplicationPercent, ' pt')],
    ['Violations', fr(s.violations), check ? `${fr(check.tolerated)} tolérées (baseline)` : deltaText(s.violations, p?.violations)],
    ["Cycles d'imports", fr(s.cycles), `${fr(s.deadExports)} exports jamais importés`],
  ]
  const W = 960
  const cols = 3
  const tw = (W - 32 - (cols - 1) * 12) / cols
  const th = 92
  const top = 58
  let body = `  <text class="t1" x="16" y="30" font-size="17" font-weight="600">${xml(result.name)} — métriques du code</text>\n`
  body += `  <text class="t2" x="16" y="48" font-size="12">Relevé du ${xml(new Date(result.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))}${result.commit ? ` · commit ${xml(result.commit)}` : ''} · archimetrics</text>\n`
  tiles.forEach(([lab, val, sub], i) => {
    const x = 16 + (i % cols) * (tw + 12)
    const y = top + Math.floor(i / cols) * (th + 12)
    body += `  <rect class="card" x="${x}" y="${y}" width="${tw}" height="${th}" rx="4"/>\n`
    body += `  <text class="t2" x="${x + 14}" y="${y + 24}" font-size="12">${xml(lab)}</text>\n`
    body += `  <text class="t1" x="${x + 14}" y="${y + 56}" font-size="26" font-weight="600">${xml(val)}</text>\n`
    body += `  <text class="t3" x="${x + 14}" y="${y + 78}" font-size="11">${xml(sub)}</text>\n`
  })
  if (check) {
    const y = top + 2 * (th + 12) + 4
    const ok = check.nAdded === 0
    body += `  <circle class="${ok ? 'good' : 'bad'}" cx="22" cy="${y + 8}" r="5"/>\n`
    body += `  <text class="t1" x="34" y="${y + 12}" font-size="12">${ok ? 'Garde-fous : aucune violation nouvelle' : `Garde-fous : ${fr(check.nAdded)} violation(s) nouvelle(s)`}${check.nResolved ? ` · ${fr(check.nResolved)} résorbée(s) à retirer de la baseline` : ''}</text>\n`
  }
  const H = top + 2 * (th + 12) + (check ? 30 : 4)
  return wrap(W, H, `${result.name} — métriques du code`, body)
}

export function evolutionSvg(history) {
  const series = [
    ['Lignes de code', (h) => h.summary.codeLines, ''],
    ['Complexité cognitive moyenne', (h) => h.summary.cognitiveAvg, ''],
    ['Duplication', (h) => h.summary.duplicationPercent, ' %'],
    ['Violations', (h) => h.summary.violations, ''],
  ]
  const W = 960
  const cw = (W - 32 - 3 * 16) / 4
  const ch = 120
  const H = 52 + ch + 34
  let body = `  <text class="t1" x="16" y="28" font-size="15" font-weight="600">Évolution</text>\n`
  body += `  <text class="t2" x="16" y="44" font-size="11">${history.length} relevé(s), un par passage sur la branche principale</text>\n`
  series.forEach(([lab, get, unit], k) => {
    const x0 = 16 + k * (cw + 16)
    const y0 = 60
    body += `  <text class="t2" x="${x0}" y="${y0}" font-size="12">${xml(lab)}</text>\n`
    const pts = history.map(get).filter((v) => typeof v === 'number')
    const py0 = y0 + 18
    const ph = ch - 28
    body += `  <line class="grid" x1="${x0}" x2="${x0 + cw}" y1="${py0 + ph}" y2="${py0 + ph}" stroke-width="1"/>\n`
    if (pts.length < 2) {
      body += `  <text class="t3" x="${x0}" y="${py0 + ph / 2}" font-size="11">${pts.length ? `${fr(pts[0])}${unit} — la courbe vient au 2e relevé` : 'aucun relevé'}</text>\n`
      return
    }
    const min = Math.min(...pts)
    const max = Math.max(...pts)
    const span = max - min || 1
    const lw = cw - 54
    const X = (i) => x0 + (i / (pts.length - 1)) * lw
    const Y = (v) => py0 + ph - ((v - min) / span) * (ph - 8) - 4
    body += `  <polyline class="line" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>\n`
    const last = pts[pts.length - 1]
    body += `  <circle class="dot" cx="${X(pts.length - 1).toFixed(1)}" cy="${Y(last).toFixed(1)}" r="4" stroke-width="2"/>\n`
    body += `  <text class="t1" x="${(X(pts.length - 1) + 8).toFixed(1)}" y="${(Y(last) + 4).toFixed(1)}" font-size="12" font-weight="600">${fr(last)}${unit}</text>\n`
    body += `  <text class="t3" x="${x0}" y="${py0 + ph + 16}" font-size="10">min ${fr(min)}${unit} · max ${fr(max)}${unit}</text>\n`
  })
  return wrap(W, H, 'Évolution des métriques', body)
}

// Treemap « squarified » (Bruls, Huizing, van Wijk) : rend [{ item, x, y, w, h }].
export function squarify(items, x, y, w, h) {
  const out = []
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total || w <= 0 || h <= 0) return out
  const scale = (w * h) / total
  let rest = items.filter((i) => i.value > 0).map((i) => ({ item: i, area: i.value * scale })).sort((a, b) => b.area - a.area)
  let rx = x, ry = y, rw = w, rh = h
  const worst = (row, side) => {
    const s = row.reduce((a, r) => a + r.area, 0)
    const mx = Math.max(...row.map((r) => r.area))
    const mn = Math.min(...row.map((r) => r.area))
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn))
  }
  while (rest.length) {
    const side = Math.min(rw, rh)
    const row = [rest[0]]
    let i = 1
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) row.push(rest[i++])
    rest = rest.slice(i)
    const s = row.reduce((a, r) => a + r.area, 0)
    if (rw >= rh) {
      const cw = s / rh
      let cy = ry
      for (const r of row) { const hh = r.area / cw; out.push({ item: r.item, x: rx, y: cy, w: cw, h: hh }); cy += hh }
      rx += cw; rw -= cw
    } else {
      const chh = s / rw
      let cx = rx
      for (const r of row) { const ww = r.area / chh; out.push({ item: r.item, x: cx, y: ry, w: ww, h: chh }); cx += ww }
      ry += chh; rh -= chh
    }
  }
  return out
}

export function carteSvg(result, model) {
  const { files, groups, groupOf } = model
  const cyc = new Map(files.map((f) => [f.rel, f.functions.reduce((s, x) => s + x.cyclomatic, 0)]))
  const W = 960
  const H = 560
  const top = 56
  const legendH = 44
  const src = files.filter((f) => !f.test)
  const groupsData = groups.map((g) => {
    const mods = new Map()
    const base = effectiveRoot(g.path, src.filter((f) => groupOf(f.rel) === g.name))
    for (const f of src) {
      if (groupOf(f.rel) !== g.name) continue
      const m = moduleAt(f.rel, base, 1)
      const cur = mods.get(m) ?? { name: m, value: 0, cyc: 0, files: 0, script: 0 }
      cur.value += f.codeLines
      // La densité se rapporte aux lignes de script : le gabarit et les styles d'un .vue n'ont pas de complexité mesurée.
      cur.script += f.blocks ? f.blocks.script : f.codeLines
      cur.cyc += cyc.get(f.rel) ?? 0
      cur.files++
      mods.set(m, cur)
    }
    const children = [...mods.values()].map((m) => ({ ...m, density: m.script ? (m.cyc / m.script) * 100 : 0 }))
    return { name: g.name, value: children.reduce((s, c) => s + c.value, 0), children }
  }).filter((g) => g.value)
  const densities = groupsData.flatMap((g) => g.children.map((c) => c.density)).sort((a, b) => a - b)
  const q = (p) => densities[Math.min(densities.length - 1, Math.floor(p * densities.length))] ?? 0
  const bounds = [q(1 / 6), q(2 / 6), q(3 / 6), q(4 / 6), q(5 / 6)].map((v) => Math.round(v * 10) / 10)
  const bin = (d) => { let i = 0; while (i < bounds.length && d > bounds[i]) i++; return i }

  let body = `  <text class="t1" x="16" y="28" font-size="15" font-weight="600">Carte du code</text>\n`
  body += `  <text class="t2" x="16" y="44" font-size="11">Aire : lignes de code de chaque dossier de premier niveau. Teinte : densité de complexité (cyclomatique pour 100 lignes de script).</text>\n`
  const tiles = squarify(groupsData, 16, top, W - 32, H - top - legendH - 8)
  for (const gt of tiles) {
    const g = gt.item
    const head = gt.h > 40 && gt.w > 60 ? 18 : 0
    body += `  <g><title>${xml(g.name)} — ${fr(g.value)} lignes</title>\n`
    const inner = squarify(g.children, gt.x + 2, gt.y + head + 2, gt.w - 4, gt.h - head - 4)
    for (const t of inner) {
      const c = t.item
      const b = bin(c.density)
      body += `    <rect class="q${b} edge" x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" width="${Math.max(0, t.w).toFixed(1)}" height="${Math.max(0, t.h).toFixed(1)}" stroke-width="2"><title>${xml(g.name)}/${xml(c.name)} — ${fr(c.value)} lignes, ${fr(c.files)} fichiers, densité ${fr(Math.round(c.density * 10) / 10)}</title></rect>\n`
      if (t.w > 64 && t.h > 30) {
        const maxChars = Math.floor((t.w - 10) / 6.4)
        body += `    <text class="ink${b}" x="${(t.x + 6).toFixed(1)}" y="${(t.y + 16).toFixed(1)}" font-size="11" font-weight="600">${xml(cut(c.name, maxChars))}</text>\n`
        if (t.h > 46) body += `    <text class="ink${b}" x="${(t.x + 6).toFixed(1)}" y="${(t.y + 30).toFixed(1)}" font-size="10">${fr(c.value)} l.</text>\n`
      }
    }
    if (head) body += `    <text class="t1" x="${(gt.x + 4).toFixed(1)}" y="${(gt.y + 13).toFixed(1)}" font-size="12" font-weight="600">${xml(cut(`${g.name} · ${fr(g.value)} lignes`, Math.floor(gt.w / 7)))}</text>\n`
    body += '  </g>\n'
  }
  const ly = H - legendH + 6
  body += `  <text class="t2" x="16" y="${ly + 12}" font-size="11">Densité de complexité</text>\n`
  const labels = ['≤ ' + fr(bounds[0]), ...bounds.slice(1).map((b, i) => `${fr(bounds[i])}–${fr(b)}`), '> ' + fr(bounds[4])]
  labels.forEach((l, i) => {
    const x = 150 + i * 120
    body += `  <rect class="q${i}" x="${x}" y="${ly + 2}" width="14" height="14" rx="2"/>\n`
    body += `  <text class="t2" x="${x + 20}" y="${ly + 13}" font-size="11">${xml(l)}</text>\n`
  })
  return wrap(W, H, 'Carte du code', body)
}

export function risquesSvg(result) {
  const list = result.history.hotspots.slice(0, 10)
  const W = 960
  const rowH = 26
  const top = 58
  const H = top + Math.max(1, list.length) * rowH + 26
  let body = `  <text class="t1" x="16" y="28" font-size="15" font-weight="600">Points chauds</text>\n`
  body += `  <text class="t2" x="16" y="44" font-size="11">Fichiers souvent modifiés et complexes (${result.history.months ?? '?'} derniers mois) : commits × complexité cyclomatique cumulée.</text>\n`
  if (!list.length) {
    body += `  <text class="t3" x="16" y="${top + 16}" font-size="12">Historique Git indisponible (clone superficiel ?).</text>\n`
    return wrap(W, H, 'Points chauds', body)
  }
  const labelW = 380
  const max = list[0].score
  const bw = W - 32 - labelW - 150
  list.forEach((h, i) => {
    const y = top + i * rowH
    const w = Math.max(2, (h.score / max) * bw)
    body += `  <text class="t1" x="${16 + labelW - 10}" y="${y + 15}" font-size="11" text-anchor="end">${xml(short(h.file, 58))}</text>\n`
    body += `  <rect class="bar" x="${16 + labelW}" y="${y + 4}" width="${w.toFixed(1)}" height="${rowH - 10}" rx="2"><title>${xml(h.file)} — ${h.commits} commits, complexité ${h.complexity}, ${h.codeLines} lignes</title></rect>\n`
    body += `  <text class="t2" x="${(16 + labelW + w + 8).toFixed(1)}" y="${y + 15}" font-size="11">${h.commits} commits × ${fr(h.complexity)}</text>\n`
  })
  return wrap(W, H, 'Points chauds', body)
}
