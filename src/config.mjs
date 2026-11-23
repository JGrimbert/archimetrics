// LA CONFIGURATION : `archimetrics.config.json` à la racine du projet analysé, fondue sur les valeurs par défaut (un niveau
// de profondeur : `limits`, `duplication`, `diagrams`, `hotspots` se complètent clé par clé, le reste se remplace).

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const DEFAULTS = {
  // Nom affiché dans les rapports (par défaut : le `name` du package.json racine, sinon le dossier).
  name: null,
  // Racines lues, relatives au projet ; seuls les fichiers suivis par Git (ou non ignorés) sont lus quand le projet est un dépôt.
  include: ['.'],
  // Segments de chemin ignorés (un nom de dossier, ou un motif d'expression régulière préfixé par `re:`).
  exclude: ['node_modules', 'dist', 'build', 'coverage', '.git', '.venv', 'venv', '__pycache__', '.archimetrics', 'storybook-static', 'playwright-report', 'test-results'],
  // Ce qui est un fichier de test (expressions régulières, sur le chemin relatif en barres obliques).
  tests: ['\\.(test|spec|stories)\\.[a-z]+$', '(^|/)(tests?|e2e|__tests__|__mocks__)/', '(^|/)conftest\\.py$', '(^|/)test_[^/]*\\.py$'],
  extensions: ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.py'],
  // Alias d'imports : { "@": "frontend/src" } (`@/x` → `frontend/src/x`). Les paquets des workspaces npm sont détectés seuls.
  aliases: {},
  packages: {},
  // Dossiers d'où partent les imports absolus de Python (`from app.services import x` → `<racine>/app/services/x.py`).
  pythonRoots: [],
  // Les seuils. `null` désactive une règle.
  limits: {
    fileCodeLines: 400,   // lignes de code d'un fichier (sans commentaires ni lignes vides ; un .vue : tous ses blocs)
    functionLines: 60,    // lignes de code d'une fonction
    params: 5,            // paramètres d'une fonction
    cyclomatic: 15,       // complexité cyclomatique d'une fonction (McCabe)
    cognitive: 20,        // complexité cognitive d'une fonction (au sens de SonarSource, approchée)
    nesting: 5,           // imbrication des structures de contrôle dans une fonction
    filesPerDir: 40,      // fichiers de code directs d'un dossier (tests à part)
    docMaxLines: 200,     // lignes d'un fichier de doc de dossier (`docName`)
    docRequiredFrom: null, // à partir de combien de fichiers de code un dossier doit avoir son `docName` (null : jamais exigé)
    lcom: null,           // LCOM4 d'une classe (composantes de méthodes sans champ commun) ; null : rapporté, jamais bloquant
    cycles: true,         // un cycle d'imports entre fichiers est une violation
    docLinks: true,       // un chemin cité dans un `docName` qui n'existe plus est une violation
  },
  docName: 'CLAUDE.md',
  // Chemins cités volontairement hors du dépôt (expressions régulières) : jamais signalés comme morts.
  docLinksIgnore: [],
  // Points d'entrée (expressions régulières) : un fichier sans importeur qui y répond n'est pas orphelin.
  entries: [],
  duplication: { minTokens: 70, includeTests: false, maxPercent: null },
  // Découpage pour le couplage et les diagrammes : [{ name, path }]. Vide : les workspaces npm, puis les dossiers de premier niveau.
  groups: [],
  diagrams: { depth: 2, maxNodes: 45, maxEdges: 200, maxClassMembers: 10 },
  prisma: null, // chemin d'un schema.prisma (diagramme du modèle de données) ; détecté seul s'il n'y en a qu'un
  hotspots: { months: 12, maxFilesPerCommit: 30, minShared: 5, minDegree: 0.5 },
  baseline: 'archimetrics.baseline.json',
  // Garde-fou strict : une violation tolérée qui a disparu doit sortir de la baseline (la liste ne fait que rétrécir).
  strictBaseline: true,
  // Publication : adresse brute de la branche des rapports, pour le bloc du README (déduite du remote `origin` si absente).
  publish: { branch: 'metriques', repo: null },
}

const MERGED = ['limits', 'duplication', 'diagrams', 'hotspots', 'publish']

export function loadConfig(root, file = null) {
  const path = resolve(root, file ?? 'archimetrics.config.json')
  let user = {}
  if (existsSync(path)) user = JSON.parse(readFileSync(path, 'utf8'))
  else if (file) throw new Error(`Configuration introuvable : ${path}`)
  const cfg = { ...DEFAULTS, ...user }
  for (const k of MERGED) cfg[k] = { ...DEFAULTS[k], ...(user[k] ?? {}) }
  cfg.root = resolve(root)
  cfg.configPath = existsSync(path) ? path : null
  if (!cfg.name) cfg.name = readName(cfg.root)
  cfg.packages = { ...detectWorkspaces(cfg.root), ...cfg.packages }
  cfg.testRes = cfg.tests.map((s) => new RegExp(s))
  cfg.excludeNames = new Set(cfg.exclude.filter((s) => !s.startsWith('re:')))
  cfg.excludeRes = cfg.exclude.filter((s) => s.startsWith('re:')).map((s) => new RegExp(s.slice(3)))
  return cfg
}

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}

function readName(root) {
  return readJson(join(root, 'package.json'))?.name ?? root.split(/[\\/]/).pop()
}

// Les workspaces npm (`"workspaces": ["frontend", "packages/*"]`) : nom du paquet → dossier.
export function detectWorkspaces(root) {
  const pkg = readJson(join(root, 'package.json'))
  const ws = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages ?? []
  const out = {}
  for (const w of ws) {
    if (w.includes('*')) continue // un motif : non suivi (déclarer les paquets dans `packages`)
    const name = readJson(join(root, w, 'package.json'))?.name
    if (name) out[name] = w.replace(/\\/g, '/').replace(/\/$/, '')
  }
  return out
}

export function workspaceDirs(root) {
  return Object.values(detectWorkspaces(root))
}
