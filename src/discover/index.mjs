// LA DÉCOUVERTE ZERO CONFIG : ce que le projet dit de lui-même (manifestes, configurations d'outils, disposition des
// dossiers), relevé sans rien exécuter, puis fondu avec la déclaration (`archimetrics.config.json`), qui l'emporte
// toujours :
// - `aliases`, `packages` : fusion clé par clé, la clé déclarée gagne ;
// - `pythonRoots` : la liste déclarée, si elle n'est pas vide, remplace la liste découverte ;
// - `entries` : réunion (une entrée de plus ne fait que retirer un faux orphelin) ;
// - `groups` : la liste déclarée, si elle n'est pas vide, remplace le découpage déduit (`src/metrics/groups.mjs`) ;
// - code généré : écarté, sauf `discover: false`.
// Chaque élément porte `origine` (observé : lu dans un fichier du projet · inféré : déduit d'une convention · déclaré :
// lu dans la config d'archimetrics), `confiance` (0 à 1) et `indices` (d'où il vient). Tout est rangé dans
// `cfg.discovery`. `discover: false` coupe la découverte (seuls les workspaces restent détectés, comme en 0.1).

import { discoverAliases } from './aliases.mjs'
import { discoverEntries, manifestTargets, sourceOf } from './entries.mjs'
import { generatedFilter } from './generated.mjs'
import { discoverPythonRoots } from './python.mjs'
import { joinRel, readJsonc, scanHints } from './scan.mjs'
import { discoverWorkspaces } from './workspaces.mjs'

const declared = (indice) => ({ origine: 'déclaré', confiance: 1, indices: [indice ?? 'configuration'] })

/**
 * Découvre et fond dans `cfg` (modifié) ; `user` est la configuration déclarée telle que lue.
 * @param {any} cfg configuration fondue sur les valeurs par défaut, `root`, `excludeNames`, `excludeRes` déjà posés
 * @param {any} user
 */
export function applyDiscovery(cfg, user) {
  const source = cfg.configPath ? 'archimetrics.config.json' : null
  const scan = scanHints(cfg.root, (name) => cfg.excludeNames.has(name))
  const on = cfg.discover !== false
  const workspaces = discoverWorkspaces(cfg.root, scan.files)
  const found = on
    ? { aliases: discoverAliases(cfg.root, scan.files), pythonRoots: discoverPythonRoots(scan.files), entries: discoverEntries(cfg.root, scan.files, scan.dirs) }
    : { aliases: [], pythonRoots: [], entries: [] }

  const aliases = mergeByKey(found.aliases, user.aliases, 'alias', source)
  const packages = mergeByKey(workspaces.map((w) => packageOf(cfg.root, w, on)), user.packages, 'alias', source)
  const pythonRoots = user.pythonRoots?.length ? user.pythonRoots.map((p) => ({ path: p, ...declared(source) })) : found.pythonRoots
  const entries = [...(user.entries ?? []).map((p) => ({ pattern: p, ...declared(source) })), ...found.entries.filter((e) => !(user.entries ?? []).includes(e.pattern))]

  cfg.aliases = Object.fromEntries(aliases.map((a) => [a.alias, a.path]))
  cfg.packages = Object.fromEntries(packages.map((p) => [p.alias, p.path]))
  cfg.pythonRoots = pythonRoots.map((p) => p.path)
  cfg.entries = entries.map((e) => e.pattern)

  let generated = []
  if (on) {
    const g = generatedFilter(cfg.root, new Set(cfg.extensions))
    cfg.excludeRes = [...cfg.excludeRes, g.filter]
    generated = g.found
  }
  cfg.discovery = {
    enabled: on,
    workspaces: workspaces.map(({ name, path, origine, confiance, indices }) => ({ name, path, origine, confiance, indices })),
    aliases,
    packages: packages.map(({ alias, path, origine, confiance, indices }) => ({ name: alias, path, origine, confiance, indices })),
    pythonRoots,
    entries,
    generated,
  }
  return cfg
}

/**
 * Le paquet d'un workspace, pour la résolution des imports : son dossier, ou, quand son point d'entrée (`exports["."]`,
 * sinon `main`) est un `index` dans un sous-dossier (`src/index.ts`, `dist/index.js` ramené à `src/`), ce sous-dossier
 * (`@moi/commun` → `packages/commun/src/index.ts`, `@moi/commun/x` → `packages/commun/src/x`).
 */
function packageOf(root, w, on) {
  const pkg = { ...w, alias: w.name, indices: [...w.indices] }
  if (!on) return pkg
  const manifest = readJsonc(root, `${w.path}/package.json`) ?? {}
  const targets = manifestTargets(manifest)
  const entry = targets.find((t) => /^exports(\[\.\](\[[^.\]][^\]]*\])*)?$/.test(t.field)) ?? targets.find((t) => t.field === 'main')
  const src = entry && sourceOf(joinRel(w.path, entry.path))
  const m = src?.path.match(/^(.*)\/index(\.[\w]+)?$/)
  if (m && m[1] !== w.path && m[1].startsWith(w.path + '/')) {
    pkg.path = m[1]
    pkg.indices.push(`imports résolus depuis ${m[1]}/ (${entry.field} : ${entry.path})`)
  }
  return pkg
}

/** Fusion clé par clé : les éléments découverts, puis la déclaration (`{ clé: chemin }`) par-dessus. */
function mergeByKey(found, declaredMap, key, source) {
  const out = new Map(found.map((x) => [x[key], x]))
  for (const [k, path] of Object.entries(declaredMap ?? {})) {
    const prev = out.get(k)
    const indices = [source ?? 'configuration']
    if (prev && prev.path !== path) indices.push(`découvert autrement : ${prev.path} (${prev.indices.join(', ')})`)
    out.set(k, { [key]: k, path: String(path).replace(/\\/g, '/').replace(/\/$/, ''), origine: 'déclaré', confiance: 1, indices })
  }
  return [...out.values()].sort((a, b) => (a[key] < b[key] ? -1 : 1))
}
