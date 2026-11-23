// LES RACINES PYTHON (d'où partent les imports absolus, `from app.services import x`) :
// - un dossier qui porte `pyproject.toml`, `setup.cfg` ou `setup.py` : observé, confiance 0,9 (son `src/` s'il suit la
//   disposition « src ») ;
// - le parent d'un paquet de premier niveau (dossier à `__init__.py` dont le parent n'en a pas) : inféré, confiance 0,7.

import { dirName } from './scan.mjs'

const MANIFESTS = new Set(['pyproject.toml', 'setup.cfg', 'setup.py'])

/**
 * @param {string[]} hintFiles
 * @returns {{ path: string, origine: string, confiance: number, indices: string[] }[]}
 */
export function discoverPythonRoots(hintFiles) {
  const inits = new Set(hintFiles.filter((f) => f.endsWith('__init__.py')).map(dirName))
  const roots = new Map()
  const add = (path, origine, confiance, indice) => {
    const prev = roots.get(path)
    if (!prev) roots.set(path, { path, origine, confiance, indices: [indice] })
    else {
      prev.indices.push(indice)
      if (confiance > prev.confiance) Object.assign(prev, { origine, confiance })
    }
  }
  for (const f of hintFiles) {
    const name = f.split('/').pop()
    if (!MANIFESTS.has(name)) continue
    const dir = dirName(f)
    const src = dir ? `${dir}/src` : 'src'
    const srcLayout = [...inits].some((d) => dirName(d) === src)
    add(srcLayout ? src : dir, 'observé', 0.9, `${f}${srcLayout ? ' (disposition src/)' : ''}`)
  }
  for (const pkg of inits) {
    const parent = dirName(pkg)
    if (!inits.has(parent)) add(parent, 'inféré', 0.7, `paquet de premier niveau : ${pkg}/__init__.py`)
  }
  return [...roots.values()].sort((a, b) => (a.path < b.path ? -1 : 1))
}
