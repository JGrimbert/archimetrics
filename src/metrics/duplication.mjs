// LES REDONDANCES : clones « au renommage près » (type 2) — les jetons de chaque fichier, identifiants et littéraux fondus,
// imports exclus, comparés par fenêtres de `minTokens` jetons (empreinte roulante de Rabin-Karp, vérifiée jeton par jeton),
// chaque correspondance étendue au plus long. Un clone : deux places (fichier, lignes) et sa longueur en jetons.
// Le taux : lignes de code couvertes par un clone / lignes de code.

const P = 2147483647 // 2^31 - 1
const B = 131

export function duplicationMetrics(files, opts) {
  const K = opts.minTokens
  const pool = files.filter((f) => (opts.includeTests || !f.test) && f.tokens?.length >= K)
  const intern = new Map()
  const seqs = pool.map((f) => Int32Array.from(f.tokens, (t) => {
    let id = intern.get(t)
    if (id == null) { id = intern.size + 1; intern.set(t, id) }
    return id
  }))
  let pow = 1
  for (let i = 1; i < K; i++) pow = (pow * B) % P

  const index = new Map() // empreinte → [fichier, position] (première occurrence)
  const clones = []
  const covered = pool.map(() => new Set())
  const same = (fa, ia, fb, ib, n) => {
    const a = seqs[fa]
    const b = seqs[fb]
    for (let k = 0; k < n; k++) if (a[ia + k] !== b[ib + k]) return false
    return true
  }
  for (let fi = 0; fi < pool.length; fi++) {
    const s = seqs[fi]
    let h = 0
    for (let k = 0; k < K; k++) h = (h * B + s[k]) % P
    let i = 0
    while (i + K <= s.length) {
      const hit = index.get(h)
      let advanced = false
      if (hit) {
        const [fj, j] = hit
        const overlaps = fj === fi && j + K > i
        if (!overlaps && same(fj, j, fi, i, K)) {
          let n = K
          const sj = seqs[fj]
          while (i + n < s.length && j + n < sj.length && s[i + n] === sj[j + n] && !(fj === fi && j + n >= i)) n++
          const la = pool[fj].tokenLines
          const lb = pool[fi].tokenLines
          clones.push({ tokens: n, a: { file: pool[fj].rel, start: la[j], end: la[j + n - 1] }, b: { file: pool[fi].rel, start: lb[i], end: lb[i + n - 1] } })
          for (let l = la[j]; l <= la[j + n - 1]; l++) if (pool[fj].code.has(l)) covered[fj].add(l)
          for (let l = lb[i]; l <= lb[i + n - 1]; l++) if (pool[fi].code.has(l)) covered[fi].add(l)
          // Sauter le clone : l'empreinte roulante est recalculée après lui.
          i += n
          if (i + K <= s.length) {
            h = 0
            for (let k = 0; k < K; k++) h = (h * B + s[i + k]) % P
          }
          advanced = true
        }
      } else index.set(h, [fi, i])
      if (advanced) continue
      if (i + K < s.length) h = (((h - ((s[i] * pow) % P) + P) % P) * B + s[i + K]) % P
      i++
    }
  }
  const total = pool.reduce((s, f) => s + f.code.size, 0)
  const dup = covered.reduce((s, c) => s + c.size, 0)
  const perFile = pool.map((f, i) => ({ file: f.rel, lines: covered[i].size, ratio: f.code.size ? covered[i].size / f.code.size : 0 })).filter((x) => x.lines).sort((a, b) => b.lines - a.lines)
  const violations = { duplication: [] }
  const percent = total ? Math.round((dup / total) * 1000) / 10 : 0
  if (opts.maxPercent != null && percent > opts.maxPercent) violations.duplication.push({ key: 'taux de duplication', value: percent, limit: opts.maxPercent })
  return {
    minTokens: K,
    clones: clones.length,
    duplicatedLines: dup,
    percent,
    largest: clones.sort((a, b) => b.tokens - a.tokens).slice(0, 25),
    perFile: perFile.slice(0, 15).map((x) => ({ ...x, ratio: Math.round(x.ratio * 100) })),
    violations,
  }
}
