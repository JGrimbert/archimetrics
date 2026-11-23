// LES POINTS CHAUDS (Adam Tornhill, « Your Code as a Crime Scene ») tirés de l'historique Git :
// - un fichier souvent modifié ET complexe est là où la dette coûte (score = commits × complexité cyclomatique cumulée) ;
// - le couplage temporel : deux fichiers qui changent ensemble sans s'importer révèlent une dépendance cachée
//   (degré = commits communs / moyenne de leurs commits). Les commits trop larges (renommages, formatage) sont écartés.
// Il faut l'historique complet (`fetch-depth: 0` en CI) ; un clone superficiel rend des points chauds vides.

import { execFileSync } from 'node:child_process'

export function hotspotMetrics(cfg, files, graph, cyclomaticPerFile) {
  const opts = cfg.hotspots
  const known = new Map(files.map((f) => [f.rel, f]))
  let log
  try {
    log = execFileSync('git', ['log', `--since=${opts.months}.months`, '--no-merges', '--name-only', '--format=%x00%H'], { cwd: cfg.root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return { available: false, commits: 0, hotspots: [], temporal: [] }
  }
  const commits = log.split('\0').slice(1).map((c) => c.split('\n').slice(1).map((s) => s.trim()).filter((s) => known.has(s)))
  const count = new Map()
  const pairs = new Map()
  let used = 0
  for (const c of commits) {
    if (!c.length) continue
    used++
    for (const f of c) count.set(f, (count.get(f) ?? 0) + 1)
    const src = c.filter((f) => !known.get(f).test)
    if (src.length < 2 || src.length > opts.maxFilesPerCommit) continue
    src.sort()
    for (let i = 0; i < src.length; i++) for (let j = i + 1; j < src.length; j++) {
      const k = src[i] + '\0' + src[j]
      pairs.set(k, (pairs.get(k) ?? 0) + 1)
    }
  }
  const linked = new Set(graph.edges.flatMap((e) => [e.from + '\0' + e.to, e.to + '\0' + e.from]))
  const hotspots = [...count]
    .filter(([f]) => !known.get(f).test)
    .map(([file, n]) => ({ file, commits: n, complexity: cyclomaticPerFile[file] ?? 0, codeLines: known.get(file).codeLines }))
    .map((x) => ({ ...x, score: x.commits * Math.max(1, x.complexity) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
  const temporal = [...pairs]
    .filter(([, n]) => n >= opts.minShared)
    .map(([k, n]) => {
      const [a, b] = k.split('\0')
      const degree = n / ((count.get(a) + count.get(b)) / 2)
      return { a, b, shared: n, degree: Math.round(degree * 100) / 100, imports: linked.has(a + '\0' + b) }
    })
    .filter((x) => x.degree >= opts.minDegree)
    .sort((x, y) => Number(x.imports) - Number(y.imports) || y.shared * y.degree - x.shared * x.degree)
    .slice(0, 20)
  return { available: true, months: opts.months, commits: used, hotspots, temporal }
}
