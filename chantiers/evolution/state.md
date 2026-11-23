# Chantier « évolution » d'ArchiMetrics — état

> Vérifié le **2026-11-23** sur **`bcb1e3f`** (`main`), branche de travail `lot/AM-0`.
> Cible du chantier : Phase 2 de `C:\jgr\archi\ARCHI_ROADMAP.md` (lots AM-0 à AM-6). Plan interne : [roadmap.md](roadmap.md).
> Statuts : [CONSTAT] (fichier cité), [INTERPRÉTATION], [HYPOTHÈSE], [À VÉRIFIER].

## Où en est-on

- **AM-0 en cours** : audit ci-dessous, [roadmap.md](roadmap.md), baseline initiale. En attente de la validation de la
  roadmap par l'auteur (critère de fin d'AM-0) avant d'ouvrir `lot/AM-1`.
- `chantiers/ecosysteme/` (dossier vide) supprimé par `rmdir` [CONSTAT].
- **Baseline** : `node bin/archimetrics.mjs check --root . --no-git` relève **37 violations**, comme attendu (aucun
  écart avec 37) [CONSTAT] : `functionLines` 8, `cyclomatic` 12, `cognitive` 16, `nesting` 1. Elles sont toutes
  tolérées par `archimetrics.baseline.json` (écrit par `archimetrics baseline --root .`). À partir de ce commit, toute
  violation nouvelle fait échouer `check`, et la CI (`.github/workflows/ci.yml`, qui passe l'Action sur le dépôt) aussi
  [INTERPRÉTATION] ; en mode strict, une violation corrigée doit aussi sortir de la baseline.
- Point de départ [CONSTAT] : 23 fichiers, 2 387 lignes de code, 409 fonctions, duplication 1,1 %, 0 cycle,
  13 exports morts ; `npm test` : 15 tests verts.

## Audit de l'existant face à la cible de la Phase 2

| Capacité | État | Preuve | Ce qui manque |
|---|---|---|---|
| Découverte zero config | **partiel** | [CONSTAT] `src/config.mjs` (`DEFAULTS` complets, config facultative ; `detectWorkspaces` lit `workspaces` du `package.json`) ; `src/metrics/groups.mjs` (groupes déduits) | [CONSTAT] les workspaces à motif (`packages/*`) sont ignorés (`config.mjs`, `if (w.includes('*')) continue`) ; aucune lecture de `vite.config` / `tsconfig` / `jsconfig` ; aucune détection de code généré (seul `exclude` par nom de dossier) |
| Groupes et alias | **partiel** | [CONSTAT] groupes : `groups.mjs` (config, sinon workspaces, sinon dossiers de premier niveau) ; alias : `src/graph.mjs:36,80`, lus seulement dans `cfg.aliases` | Alias jamais déduits ; [CONSTAT] sur ArchiMetrics lui-même, `test/` devient un groupe vide (0 fichier source) dans `groups` — bruit mineur |
| Racines Python | **partiel** | [CONSTAT] `graph.mjs:38` résout les imports absolus sous `cfg.pythonRoots` | Aucune détection (`pyproject.toml`, `setup.cfg`, dossiers à `__init__.py`) : scribe les déclare dans `archimetrics.config.json` [CONSTAT registre d'`archi`] |
| Points d'entrée | **partiel** | [CONSTAT] `src/metrics/coupling.mjs:14` (`ENTRY` : `main`/`index`/`app`/`server`/`cli`, `*.config.*`, `bin/`, `__main__.py`…) + `cfg.entries` déclarés | Ni `bin`/`main`/`exports` du `package.json`, ni routes de frameworks (pages Vue/Nuxt, contrôleurs Nest, routeurs FastAPI) |
| Niveaux observé / inféré / déclaré | **absent** | [CONSTAT] aucune occurrence de `origine` ni `confiance` dans `src/` | Tout : champ `origine`, `confiance`, `indices` sur groupes et modules |
| Contrat JSON | **partiel** | [CONSTAT] `src/report/index.mjs:47` écrit `metrics.json` (`tool`, `name`, `date`, `commit`, `limits`, `summary`, `groups`, `sizes`, `functions`, `organisation`, `coupling`, `duplication`, `history`, `violations`, `warnings`, `durationMs`, `baselinePath`, `check`) | `schemaVersion`, schéma publié, règle de compatibilité, test de non-régression du format |
| Comparaison avant / après | **partiel** | [CONSTAT] `src/baseline.mjs` `compare` (violations face à la baseline) ; `report/index.mjs:34-36` (`history.json`, `summary` du relevé précédent montré dans le rapport) | Comparaison entre **deux relevés** ou **deux commits** (`archimetrics diff`, `--base`), écart par groupe, fichiers apparus / disparus |
| Revue LLM | **absent** | [CONSTAT] aucun appel réseau ni module `src/llm/` ; aucune commande `review` dans `bin/archimetrics.mjs` | Tout (AM-3, AM-4) |
| Restitution en quatre niveaux | **partiel** | [CONSTAT] `src/report/markdown.mjs` : `README.md` (accueil), puis pages thématiques `taille`, `complexite`, `couplage`, `redondances`, `organisation`, `historique` ; `svg.mjs`, `mermaid.mjs` | [INTERPRÉTATION] l'accueil tient lieu de vue d'ensemble et les pages thématiques d'exploration ; **absents** : « points d'attention » hiérarchisés et « recommandations » (aucune occurrence dans `src/report`) |
| Autodiagnostic | **partiel** | [CONSTAT] `warnings` (`src/analyze/index.mjs` : fichier illisible, analyse en échec, Python absent) ; `sizes.byLang` (`src/metrics/sizes.mjs`) ; `npm run self` et la CI passent l'outil sur lui-même | Constructions non reconnues (imports calculés, `require` dynamiques…), limites connues dans le JSON (elles ne sont que dans `README.md` §« Limites connues »), couplage interne d'ArchiMetrics commenté |

### Constats annexes

- [CONSTAT] `metrics.json` : `violations` est un objet `règle → liste d'objets { key, value, limit, detail }`, pas une
  liste de clés (`src/metrics/index.mjs`, sortie relevée). Voir « Décisions à soumettre ».
- [CONSTAT] `commit` est calculé par `git rev-parse --short HEAD` même avec `--no-git` (`--no-git` ne coupe que les
  points chauds) ; il vaut `null` hors dépôt Git.
- [CONSTAT] `.idea/` est suivi par Git (4 fichiers, `git ls-files`) : hors périmètre de P2, non touché.
- [CONSTAT] `stash@{0}` (les documents d'origine, D-016) est toujours là : non touché.
- [CONSTAT] Python 3.11 (`python`) et 3.13 (`py -3`) sont présents sur la machine.

## Décisions à soumettre

### DS-1 — Forme garantie de `violations` dans `metrics.json` v1 (à reporter dans `ARCHI_DECISIONS.md`)
- **Contexte** : P2 décrit `violations` comme « règle → liste de clés » ; le code produit « règle → liste d'objets »
  `{ key, value, limit, detail }` [CONSTAT].
- **Options** : (a) **garantir des objets dont seul `key` (chaîne) est requis** ; `value`, `limit`, `detail` décrits,
  non garantis ; (b) changer la sortie en listes de clés (casse le rapport Markdown et la branche `metriques` de scribe) ;
  (c) garantir les quatre champs.
- **Recommandation** : **(a)**. Aucune sortie ne change ; le diff et la baseline n'ont besoin que de `key` ; `value` et
  `detail` peuvent encore évoluer (ex. `detail: "ligne 16"` → numéro de ligne) sans passer à `/2`.

### DS-2 — Champs garantis de `groups` (même report)
- **Options** : (a) **garantir `name` et `path` (chaînes), décrire `files`, `codeLines`, `functions`, `complexity`
  (entiers) comme garantis aussi** — ils existent depuis 0.1 et le diff par groupe en a besoin ; (b) ne garantir que
  `name` et `path`.
- **Recommandation** : **(a)** : l'écart par groupe d'`archimetrics diff` s'appuie sur ces quatre nombres. AM-2 ajoutera
  `origine` / `confiance` / `indices` comme champs facultatifs (sans changer de version).

## Journal

- **2026-11-23** — Ouverture du chantier (AM-0) : branche `lot/AM-0` depuis `main` (`bcb1e3f`) ; `chantiers/ecosysteme/`
  supprimé ; audit ; roadmap ; `check --no-git` = 37 violations ; baseline écrite ; `npm test` 15/15.
