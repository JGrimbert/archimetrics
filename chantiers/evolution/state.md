# Chantier « évolution » d'ArchiMetrics — état

> Vérifié le **2026-11-23** : AM-0 à AM-3 fusionnés dans `main` (AM-3 validé, code `25e665d`) ; AM-4 validé et
> fusionné dans `main` (code `86be015`) ; `v1` sur `68392ca`.
> Cible du chantier : Phase 2 de `C:\jgr\archi\ARCHI_ROADMAP.md` (lots AM-0 à AM-6). Plan interne : [roadmap.md](roadmap.md).
> Statuts : [CONSTAT] (fichier cité), [INTERPRÉTATION], [HYPOTHÈSE], [À VÉRIFIER].

## Où en est-on

- **AM-0 fait** : audit ci-dessous, [roadmap.md](roadmap.md), baseline initiale ; roadmap, DS-1 et DS-2 **acceptées par
  l'auteur le 2026-11-23** (reportées : D-018, D-019).
- **AM-0 et AM-1 fusionnés dans `main`** (`68392ca`, étiquette `v1`) [CONSTAT `git log`, `git tag --points-at`].
- **AM-1 fait** : `schemaVersion: "archimetrics.metrics/1"`, `schemas/metrics.schema.json`
  et `schemas/metrics-diff.schema.json`, validateur `src/schema.mjs`, `archimetrics diff` (deux fichiers, ou
  `--base <ref> [--head <ref>] [--config f]`), règle de compatibilité dans `README.md`. Détail et preuves :
  « Comparaison vérifiée sur scribe » ci-dessous. `npm test` : **26 tests verts** (15 au départ).
- **DS-3 tranchée par D-020** (validée, option (c)) : chaque côté de `diff --base` garde sa configuration, avec un
  avertissement si elles diffèrent ; à livrer dans AM-2.
- **D-020 livrée dans AM-2** : `diff --base` avertit quand les deux configurations déclarées diffèrent (voir AM-2).
- **AM-2 fait, validé par l'auteur et fusionné dans `main`** le 2026-11-23 (avance rapide depuis `lot/AM-2`, non
  poussé ; l'étiquette `v1` n'a pas bougé) : découverte zero config (`src/discover/`), champs
  `origine` / `confiance` / `indices`, avertissement de D-020. Détail et preuves : « Découverte vérifiée (AM-2) »
  ci-dessous. `npm test` : **35 tests verts** ; `check --root . --no-git` : 0 violation nouvelle, 37 tolérées.
- **AM-3 fait, validé par l'auteur et fusionné dans `main`** le 2026-11-23 (avance rapide depuis `lot/AM-3`, non poussé) : `src/llm/` (interface fournisseur, Ollama, compatible OpenAI,
  JSON validé + réessai, garde `--allow-remote`) et banc `bench/` (10 diffs, `node bench/run.mjs`). Détail et mesures :
  « Banc de revue (AM-3) » ci-dessous. `npm test` : **56 tests verts** ; `check --root .` : 0 violation nouvelle, 37 tolérées.
- **AM-4 fait, validé par l'auteur et fusionné dans `main`** le 2026-11-23 (avance rapide depuis `lot/AM-4`, non
  poussé), critère du banc non tenu au sens de D-035 (validée, (a) + (c)) : `archimetrics review` (`src/review/`,
  `schemas/review.schema.json`, mode `--mode revue` du banc). Détail et mesures : « Revue (AM-4) » ci-dessous.
  `npm test` : **69 tests verts** ; `check --root .` : 0 violation nouvelle, 37 tolérées. Critère du banc : D-035 (validée)
  dans `C:\jgr\archi\ARCHI_DECISIONS.md` ; la revue LLM n'est qu'un avis non bloquant jusqu'à AM-4b.
- **AM-4b fait, validé par l'auteur et fusionné dans `main`** le 2026-11-24 (avance rapide depuis `lot/AM-4b`, non
  poussé) : `archimetrics review
  --contexte fichier`. Au cumul de 3 passages à chaud (`71fbe0e3`), **D-035 (a) tenu** : défauts 6/15, sains 15/15, faux
  0/6, ≈ 30 min le banc. Détail : « Rappel de la revue (AM-4b) » ci-dessous. `npm test` : **73 tests verts** ; `check
  --root .` : 0 violation nouvelle, 37 tolérées. Contexte par défaut de la revue : **D-036** (proposée) dans
  `C:\jgr\archi\ARCHI_DECISIONS.md` ; la revue LLM reste un avis non bloquant.
- **AM-8 fait sur `lot/AM-8`** le 2026-11-27 (ni poussé ni fusionné : à valider par l'auteur) : signatures exportées
  dans `analyzeScript`, `archimetrics contexte` et `archimetrics claude-md` (D-086 (a), volet ArchiMetrics). Détail et
  mesure : « Paquet de contexte (AM-8) » ci-dessous. `npm test` : **82 tests verts** ; `diff --base main` : 0 violation
  ajoutée.
- **Prochain lot** : AM-5 (restitution, avec D-021) au choix de l'auteur.
- **DS-4 acceptée** (option (b), 2026-11-23) : relevé de découverte en champ `discovery` de premier niveau et page
  « Découverte » du rapport, avec AM-5 ; reportée : D-021.
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
| Contrat JSON | **partiel** → **existant** après AM-1 | [CONSTAT] `src/report/index.mjs:47` écrit `metrics.json` (`tool`, `name`, `date`, `commit`, `limits`, `summary`, `groups`, `sizes`, `functions`, `organisation`, `coupling`, `duplication`, `history`, `violations`, `warnings`, `durationMs`, `baselinePath`, `check`) | `schemaVersion`, schéma publié, règle de compatibilité, test de non-régression du format |
| Comparaison avant / après | **partiel** → **existant** après AM-1 | [CONSTAT] `src/baseline.mjs` `compare` (violations face à la baseline) ; `report/index.mjs:34-36` (`history.json`, `summary` du relevé précédent montré dans le rapport) | Comparaison entre **deux relevés** ou **deux commits** (`archimetrics diff`, `--base`), écart par groupe, fichiers apparus / disparus |
| Revue LLM | **absent** → adaptateurs et banc après AM-3 | [CONSTAT] aucun appel réseau ni module `src/llm/` ; aucune commande `review` dans `bin/archimetrics.mjs` | Tout (AM-3, AM-4) |
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

## Comparaison vérifiée sur scribe (AM-1)

Toutes les analyses de scribe ont écrit hors du dépôt (`%TEMP%`) ; `git status --porcelain --branch` de scribe est le
même avant et après la session [CONSTAT] :

```
## master...origin/master
 M tools/produit/roadmap.md
 M tools/produit/state.md
?? backend/src/edition/edit-nodes.ts
```

- **Schéma** [CONSTAT] : le `metrics.json` de scribe (arbre de travail, `954b0bb2`, sa config lue telle quelle, `report
  --out %TEMP% --no-git`, 9 s) et celui d'ArchiMetrics valident `schemas/metrics.schema.json` (0 erreur) ; les
  `avant.json` / `apres.json` des diffs aussi, et chaque `metrics-diff.json` valide `metrics-diff.schema.json`.
- **Diff entre deux commits** : `archimetrics diff --base ad137656 --head 47fe8110 --root C:\jgr\marvarid\scribe`
  (L11b → L11c, 17 s) [CONSTAT] :
  - `summary` : `files` 1 195 → 1 196 (+1), `testFiles` 477 → 478 (+1), `codeLines` +365, `functions` +58,
    `violations` 893 → 897 (+4). **Vérifié à la main** : `git diff --name-status ad137656 47fe8110` n'ajoute que deux
    fichiers de code, `backend/src/edition/edit-undo.ts` (source) et `edit-undo.spec.ts` (test) ; aucun supprimé.
  - Violations : 6 ajoutées, 2 résorbées. **Vérifié à la main** : `edit-undo.ts#step` (ajoutée en `cyclomatic`) n'existe
    pas en `ad137656` (`git cat-file -e` échoue) ; ses points de décision (5 `if`, 1 `for`, 4 `&&`, 1 `||`, 2 `??`,
    3 `?:`) donnent 1 + 16 = **17**, la valeur relevée, pour un seuil de 15. `EditsService.applyNow` (résorbée en
    `functionLines` et `cyclomatic`) passe de 95 lignes (83 de code, cyclomatique 19) à 35 lignes : sa logique est partie
    dans `writeBook` (ajoutée en `functionLines` et `params`).
  - [CONSTAT] `archimetrics.config.json` de scribe n'existe dans aucun des deux commits : chaque côté est alors mesuré
    avec les valeurs par défaut. Relancé avec `--config C:\jgr\marvarid\scribe\archimetrics.config.json` (même config
    des deux côtés) : mêmes violations ajoutées / résorbées, `deadExports` 538 → 539 au lieu de 608 → 609 (alias
    résolus). D'où DS-3.
- **Pré-v1** : scribe n'a pas de branche `metriques` locale (et pas de `fetch`) [CONSTAT]. Simulé : un relevé de scribe
  privé de `schemaVersion` et de `files` est lu avec l'avertissement « lu comme pré-v1 », le diff sort (code 0) et dit
  « Inventaire absent… ». Un fichier vide donne « illisible (Unexpected end of JSON input) » (code 1).
- [CONSTAT] Hors AM-1 : sur l'arbre de travail de scribe, `check` relève 2 violations nouvelles
  (`backend/src/edition/edit-nodes.ts#moveNodeOps`, `cyclomatic` et `cognitive`), dans un fichier non commité de son
  travail en cours.

## Découverte vérifiée (AM-2)

Toutes les analyses ont porté sur des **copies** extraites par `git archive HEAD` dans le scratchpad de la session, avec
une sortie hors dépôt ; `git status --porcelain --branch` de scribe, CC et jgr-ui est le même avant et après [CONSTAT].

- **Scribe sans `archimetrics.config.json`** [CONSTAT] (HEAD `954b0bb2` ; la config, désormais suivie par Git, est
  retirée de la copie ; découverte + liste : 0,8 s ; `report --no-git` : 8,6 s) :

  | | Config de scribe | Découvert sans config |
  |---|---|---|
  | Groupes | frontend, backend, shared (`packages/shared`), nlp-service, tools | les **mêmes 5**, mêmes chemins : 3 workspaces (observé, 1), `nlp-service` et `tools` (inféré, 0,6) |
  | Alias | `@` → `frontend/src` | `@` → `frontend/src` (observé, 0,7 : `frontend/vite.config.js`, `fileURLToPath(new URL('./src', …))`) |
  | Racines Python | `nlp-service` | `nlp-service` (inféré, 0,7 : `nlp-service/app/__init__.py`) |
  | Entrées | `^tools/`, `^frontend/\.storybook/`, `\.worker\.ts$` | `.storybook/` (inféré), `frontend/src/main.js` (`index.html`), `frontend/src/script/sand.js` (`scripts.sand`) ; `*.worker.*` est devenu une entrée par défaut |

  Relevés complets : **arêtes 4 545 = 4 545, imports non résolus 6 = 6, exports morts 547 = 547**, mêmes 5 groupes et
  mêmes effectifs ; violations 902 contre 903. Les seuls écarts viennent de choix propres à scribe, pas de la découverte :
  orphelins 118 contre 2 (`^tools/` déclaré : des scripts lancés à la main), `docRequired` 0 contre 11 et `docLinks` 48
  contre 38 (`docRequiredFrom`, `docLinksIgnore` déclarés). Critère « groupes et alias ≥ config » : **atteint**.
- **Diff entre deux commits de scribe sans config** [CONSTAT] : `diff --base ad137656 --head 47fe8110` (21 s) donne
  `deadExports` **538 → 539**, ce qu'AM-1 n'obtenait qu'avec `--config` (608 → 609 sans) ; violations 893 → 897, 6
  ajoutées, 2 résorbées, comme en AM-1 ; aucune des deux révisions n'a de config : **pas d'avertissement**.
- **D-020 sur scribe** [CONSTAT] : `diff --base ad137656` contre l'arbre de travail (qui a sa config ; 20 s) affiche
  « les deux côtés n'ont pas la même configuration (archimetrics.config.json absente côté ad137656) ; … passer --config
  <fichier> pour imposer la même (D-020) », dans la console, `metrics-diff.json` et `metrics-diff.md`. Avec `--config`,
  rien (test `diff.test.mjs`). La config d'une révision est lue par `git archive <sha> -- archimetrics.config.json`.
- **Deux dépôts inconnus de l'outil** (aucune config) [CONSTAT] :
  - `C:\jgr\CC` (`1f08fb6`, monorepo `apps/*` + `packages/*`, TS + Vue, 368 fichiers de code, 1,6 s) : 0 erreur, 0
    avertissement, schéma valide ; 26 workspaces observés + `scripts` inféré ; 6 alias de `tsconfig` ; 39 entrées. Les
    imports non résolus sont tombés de **50 à 2** quand un paquet se résout depuis le dossier de son point d'entrée
    (`main: src/index.ts` → `packages/x/src`) ; les 2 restants visent `../generated/prisma`, écarté comme généré.
  - `C:\jgr-ui` (Svelte 5, 10 fichiers analysables, 0,1 s) : 0 erreur, schéma valide ; alias `$lib` → `src/lib` ;
    entrées `src/index` (`exports`, `dist/index.js` ramené à la source) et `src/routes/` (SvelteKit) ; 45 fichiers de
    `.svelte-kit/` (suivis par Git) écartés comme générés. Les `.svelte` ne sont pas analysés (limite notée au README).
- **ArchiMetrics lui-même** [CONSTAT] : groupes `bin`, `src` (le groupe vide `test` n'est plus émis) ; entrée
  `bin/archimetrics.mjs` (`package.json` `bin` et `scripts.self`).
- [INTERPRÉTATION] `origine` : **observé** = lu dans un fichier du projet (manifeste, configuration d'outil, en-tête) ;
  **inféré** = déduit d'une convention (dossier de premier niveau, `__init__.py`, routes de framework) ; **déclaré** =
  `archimetrics.config.json`. Ils sont émis sur `groups` et dans `coupling.resolution` ; pas sur `coupling.modules`,
  qui sont des dossiers, tous observés par construction.
- [INTERPRÉTATION] Le relevé de découverte est rangé dans `coupling.resolution` (ce qui a servi à résoudre les imports et
  à reconnaître les entrées), parce que `src/metrics/index.mjs`, qui compose `metrics.json`, est hors du périmètre du
  lot. DS-4 (acceptée, option (b)) le déplacera dans un champ `discovery` avec AM-5.
- [CONSTAT] Test existant fragile, corrigé : `--base … dossier temporaire intacts` comparait tout le contenu de
  `os.tmpdir()` ; l'analyseur Python (`src/analyze/python.mjs`) y crée aussi des dossiers `archimetrics-*` et le nouveau
  `test/discover.test.mjs` (qui analyse du Python) tourne en parallèle. Le test ne regarde plus que les dossiers nouveaux.

## Banc de revue (AM-3)

- **Adaptateurs** [CONSTAT] `src/llm/` : `createProvider(spec, { allowRemote })` (seule porte d'entrée) choisit `ollama`
  (`POST /api/chat`, schéma dans `format`, température 0, graine 42) ou `openai-compatible` (`POST <base>/chat/completions`,
  `response_format` `json_schema`, clé lue dans la variable nommée par `apiKeyEnv`) ; `completeJson` extrait le JSON
  (clôture Markdown, `<think>`), valide par `src/schema.mjs` plus un contrôle de cohérence, et réessaie (2 fois par défaut)
  en rendant les erreurs au modèle. `fetch` natif, aucune dépendance.
- **Garde** [CONSTAT] `test/llm.test.mjs`, `test/bench.test.mjs` : une adresse hors boucle locale (`localhost`, `*.localhost`,
  `127.x`, `::1`) lève `RemoteRefusedError` avant toute requête ; avec `allowRemote`, une ligne « appel distant autorisé
  (--allow-remote) vers <hôte> » sur la sortie d'erreur, sans la clé ; `node bench/run.mjs --base-url https://…` sort en
  code 1 sans rien lire. Les tests piègent le `fetch` global (0 appel) et injectent de faux `fetch`.
- **Banc** [CONSTAT] `bench/cas.json` : 5 défauts (4 correctifs renversés : scribe `ffc41a81`, `22926469`, `6ad6a8e0`,
  ArchiMetrics `c82f829` ; 1 reconstitué d'après le journal d'AM-2) et 5 commits sains ; diffs extraits par `git show` /
  `git diff` (lecture seule). **D-034** (validée, option (b) : ArchiMetrics est public, scribe privé) : seuls les 3 diffs
  d'ArchiMetrics sont figés dans `bench/cas/` ; les 7 de scribe ne sont versionnés que par leur référence (commit, mode,
  fichiers) et extraits à la volée, en mémoire (`bench/extract.mjs`, `git show` / `git diff` seulement), du dépôt nommé
  par `--repo` ou `bench/depots.local.json` (ignoré) ; sans scribe, ses cas sont sautés (« partiel »). Les détails des
  passages (`bench/resultats/`, qui citent le code) sont ignorés par Git. `git status` de scribe identique avant et après.
- **Mesure de Qwen** [CONSTAT] `bench/resultats.md`, `qwen3:4b-instruct-2507-q4_K_M` sur Ollama local, banc `778e1cf7`
  (diffs extraits identiques octet pour octet aux diffs figés du banc `87b36ae4`, vérifié), 6 passages. **À chaud**
  (4 passages identiques) : format **10/10 au 1er essai**, défauts trouvés **2/5** (s1, a2), cas sains conclus « rien »
  **2/5** (s4, s6), constats faux **8/11**, latence médiane **7,6–7,8 s**, max 21–22 s, **78–79 s** pour le banc, 1 826
  jetons de sortie. **Premier passage après chargement du modèle** (2 passages identiques entre eux, avec ou sans graine) :
  a1 trouvé en plus (3/5), 7/12 faux, 2 042 jetons. La graine fixe (42) ne supprime donc pas cet écart. Relu à la main : la notation par mots-clés est
  indulgente (a2 trouvé avec un raisonnement en partie faux) ; les constats sur a3 sont faux (lecture erronée du code).
- [INTERPRÉTATION] Qwen 4B, diff seul, est loin du critère d'AM-4 (≤ 1 constat faux sur 5) : la revue devra lui donner du
  contexte (fichier entier, voisins, métriques), segmenter, et filtrer les constats (preuve exigée, gravité), et la
  partie déterministe porter l'essentiel. Le banc mesure ces progrès à empreinte égale.

## Revue (AM-4)

- **Commande** [CONSTAT `src/review/cli.mjs`] : `archimetrics review [<commit>|<a>..<b>|<a>...<b>] [--root .] [--out d]
  [--no-llm] [--no-metrics] [--provider …] [--model …] [--base-url …] [--api-key-env …] [--allow-remote]` → `review.json`
  (`archimetrics.review/1`, `schemas/review.schema.json`) et `review.md` (par défaut `.archimetrics/review/`), code 0.
  HEAD par défaut ; un premier commit se compare à l'arbre vide.
- **Collecte** [CONSTAT `src/review/collect.mjs`, `git.mjs`, `context.mjs`] : message (ou liste des commits), fichiers
  (statut, ajouts, retraits), diff, début de chaque fichier après le changement, puis contexte mesuré : les deux
  révisions extraites par `git archive` dans un dossier temporaire, relevées sans Git ; voisins (importeurs, imports) par
  le graphe de la révision d'arrivée ; lignes de code avant/après ; violations touchées (nouvelle, existante, résorbée).
  Git : `rev-parse`, `log`, `diff`, `show`, `merge-base`, `archive` seulement (testé : dépôt inchangé).
- **Exclusions** [CONSTAT `src/review/exclude.mjs`, testé] : secrets par le nom (`.env*` sauf `.example`/`.sample`…,
  clés, `credentials*`, `.npmrc`…), binaires, générés (verrous, `.min.js`, cartes, instantanés, dossiers générés,
  marque d'en-tête : même règle que la découverte), diff > 200 000 caractères. Lignes de secret (clé privée, jetons
  GitHub, AWS, Slack, Google, `sk-…`, `password = "…"`) **masquées avant toute passe** : test que ni le modèle, ni
  `review.json`, ni `review.md` ne contiennent la valeur.
- **Déterministe** [CONSTAT `src/review/deterministic.mjs`] : marqueur de conflit, `.only` dans un test, `debugger`, secret
  ajouté, violation nouvelle dans un fichier touché. C'est toute la revue LLM éteint (`--no-llm`) ou injoignable
  (`llm.statut` : `éteint` ou `indisponible`), testé.
- **Passes** [CONSTAT `src/review/passes.mjs`, consigne `revue-am4-3`] : segments d'au plus 6 000 caractères par fichier ;
  examen par `completeJson` (schéma sans champ « conclusion ») ; preuve = une ligne changée du segment, sinon écarté ;
  contre-vérification en deux vues (avant/après, puis diff), justification avant verdict, gardé seulement sur deux
  « confirmé ». Les écartés restent dans `ecartes` avec leur raison. Fournisseur par `createProvider` : distant refusé
  sans `--allow-remote` avant tout appel (testé, 0 `fetch`).
- **Mesure de Qwen** [CONSTAT `bench/resultats.md`, `node bench/run.mjs --mode revue`, banc `03ad2d95` : mêmes cas et
  mêmes diffs que `778e1cf7`, empreinte changée par la consigne] : format 10/10 au 1er essai ; sains « rien » **5/5**
  (AM-3 : 2/5) ; constats faux / émis **0/1** (19:39, non écrit), **1/1** (19:52), **0/0** (20:15), soit 1 faux pour 2 émis sur trois passages (AM-3 : 8/11) ; défauts trouvés
  **1/15 sur les trois passages** (AM-3 : 2/5 par passage) ; latence médiane 55–66 s par cas, 585–622 s le banc, ≈ 13 000 jetons de sortie (AM-3 : 7,8 s,
  78 s, 1 826) : 3 à 5 appels par cas.
- [INTERPRÉTATION] Les filtres tiennent la précision, mais Qwen 4B ne trouve presque plus rien : le critère « ≤ 1 faux
  sur 5 » est tenu ou non selon le passage, sur 1 ou 2 constats. La relecture du constat compté faux (a1) en montre le
  bon mécanisme. Comment juger le critère et où chercher le rappel : **D-035** (validée, (a) + (c) : 3 passages au moins, plancher de rappel ; AM-4b). Variantes essayées et
  abandonnées : champ « conclusion » en tête (`7ad80874`, muet), une seule contre-vérification (`598da884`, 3/5 faux ;
  `26e27538`, 2/3), avant/après aussi à l'examen (`5801ea3f`, muet).
- Limites [CONSTAT] : les fichiers non-code (Markdown) passent aussi par le LLM ; au-delà de `--max-segments` (40), les
  segments ne sont pas revus (avertissement) ; la revue n'est pas encore branchée dans `archi verify` (après validation).

## Rappel de la revue (AM-4b)

- **Option** [CONSTAT `src/review/passes.mjs`, `collect.mjs`, `cli.mjs`] : `archimetrics review --contexte fichier
  [--num-ctx <n>]`. L'examen et les deux contre-vérifications voient aussi le fichier après le changement, lu par `git
  show` à la révision d'arrivée, lignes numérotées, entier jusqu'à 12 000 caractères, sinon une fenêtre autour du
  segment ; consigne `revue-am4b-1+fichier-1`. `--num-ctx` passe `options.num_ctx` à Ollama (8192 sur le banc).
  `--contexte diff` reste le défaut (D-036, proposée). Testé sans réseau (`fetch` global piégé).
- **Filtre de preuve** [CONSTAT `locateProof`, testé] : la preuve citée se découpe aussi sur les « \n » littéraux. Qwen
  cite parfois un bloc ainsi, et le filtre écartait à tort le bon constat de s1. Consigne `revue-am4b-1`.
- **Banc** [CONSTAT `bench/extract.mjs`, `lib.mjs`] : fichiers après le changement lus par `git show` du blob d'arrivée
  (ligne `index` du diff), sinon reconstitués en appliquant le diff au fichier du commit du cas ; hachés dans
  l'empreinte. Lecture seule (testé : dépôt intact).
- **Mesures** [CONSTAT `bench/resultats.md`, Qwen 4B, graine 42, 3 passages à chaud chacun, cumul] :

  | Banc | Contexte, consigne | Défauts | Sains « rien » | Faux / émis | Latence médiane | Banc | D-035 (a) |
  |---|---|---|---|---|---|---|---|
  | `03ad2d95` (AM-4) | diff, `revue-am4-3` | 1/15 | 15/15 | 1/2 | 55–66 s | ≈ 10 min | non |
  | `864bf925` | fichier, `revue-am4-3+fichier-1` | 3/15 | 15/15 | 0/3 | 127–134 s | ≈ 27 min | non (rappel) |
  | `1880f419` | diff, `revue-am4b-1` | 3/15 | 12/15 | 2/5 | 53–60 s | ≈ 11 min | non |
  | `71fbe0e3` | fichier, `revue-am4b-1+fichier-1` | **6/15** | **15/15** | **0/6** | 141–142 s | ≈ 30 min | **oui** |

- [INTERPRÉTATION] Le rappel vient de deux causes : le filtre de preuve, qui écartait un bon constat (s1, retrouvé dans
  les deux contextes), et le fichier entier, sans lequel a2 n'est pas trouvé. Le fichier tient aussi la précision : le
  faux de s6 n'apparaît qu'en contexte `diff`. Le critère est tenu **au plancher exact** sur un banc de 5 défauts : un
  défaut de moins le ferait tomber. s2, s3 et a1 restent manqués (s3 et a1 réfutés par la contre-vérification, s2 sans
  constat).
- **Pistes non faites** : modèle plus grand, reportée par l'auteur (4 Go de VRAM, aucun Qwen 8B/14B installé) ; passes
  réservées aux fichiers de code, sans objet sur ce banc (les 10 cas ne touchent que du code).

## Paquet de contexte (AM-8)

- **Signatures** [CONSTAT `src/contexte/signatures.mjs`, appelé par `analyzeScript` : champ `signatures`] : pour chaque
  export d'un script JS / TS, nom, genre, signature (paramètres tels qu'écrits, type de retour écrit), JSDoc, à défaut le
  commentaire `//` qui précède, lignes. Fonctions, classes (membres publics), constantes, types, ré-exports, `default` ;
  surcharges fondues. Champ non sérialisé dans `metrics.json` (le relevé ne garde pas l'analyse par fichier).
- **`archimetrics contexte`** [CONSTAT `src/contexte/paquet.mjs`, `cli.mjs`, README] : cibles par chemin, `fichier#nom`
  ou nom seul (refusé et nommé s'il est ambigu, code 2) ; voisins jusqu'à `--profondeur` en signatures ; tests qui
  importent une cible ; jetons estimés à 4 caractères par jeton ; `--budget` retire d'abord les plus lointains ;
  `--json` au format `archimetrics.contexte/1` (documenté dans le README, sans schéma publié).
- **`archimetrics claude-md`** [CONSTAT `src/contexte/claude-md.mjs`] : bloc calculé entre les balises du README
  (`src/readme.mjs`), texte manuel gardé, aucune date ; rien n'est écrit sans `--ecrire`. Aucun `CLAUDE.md` généré
  dans un dépôt : geste de l'auteur (fiche AM-8).
- **Mesure** [CONSTAT, calculée sur `b4b0a22`, profondeur 1, sans budget] : jetons du paquet (`contexte <cible> --json`,
  champ `jetons`) comparés à la somme des jetons des fichiers lus en entier, cibles et voisins du même paquet (même
  estimation, 4 caractères par jeton, fins de ligne LF). Calcul : `node <script> <racine> <cibles>`, qui lance
  `contexte --json` et lit les fichiers nommés dans `cibles` et `voisins`.

  | Cible | Voisins | Cibles | Voisins (signatures) | Tests | Paquet | Fichiers entiers | Paquet / entiers |
  |---|---|---|---|---|---|---|---|
  | `src/graph.mjs` | 4 | 1477 | 371 | 6 | 1854 | 5204 | 36 % |
  | `src/analyze/script.mjs` | 3 | 4226 | 176 | 13 | 4415 | 8184 | 54 % |
  | `src/review/cli.mjs` | 4 | 977 | 311 | 6 | 1294 | 3540 | 37 % |

- [INTERPRÉTATION] Le gain tient aux voisins (environ 8 à 22 fois moins de jetons que lus en entier). La cible, rendue
  entière, en est le plancher : le paquet de `script.mjs` (gros fichier, peu de voisins) garde 54 %. Une cible symbole
  (`contexte analyzeScript`) réduit la cible à la déclaration. La mesure ne dit pas si le paquet suffit à une session :
  cela reste à éprouver à l'usage.

## Décisions à soumettre

- **D-036** (proposée, `C:\jgr\archi\ARCHI_DECISIONS.md`) : contexte par défaut d'`archimetrics review`
  après AM-4b (`fichier` ou `diff`), et place de la revue LLM dans V-1.

## Décisions tranchées

### DS-4 — Où publier le relevé de découverte dans `metrics.json` — **tranchée : D-021, option (b)**
- **Décision** : acceptée par l'auteur le 2026-11-23, option **(b)** : un champ de premier niveau `discovery`
  (facultatif, `archimetrics.metrics/1` inchangé) et une page « Découverte » dans le rapport Markdown. **À livrer avec
  AM-5** (dont le périmètre devra inclure `src/metrics/index.mjs` et `src/report/markdown.mjs`), sauf lot dédié décidé
  d'ici là. `coupling.resolution`, non garanti, pourra alors être retiré sans changer de version. Pas encore codé.
- **Contexte** : AM-2 range alias, paquets, racines Python, entrées et code généré dans `coupling.resolution` (non
  garanti), faute de pouvoir toucher `src/metrics/index.mjs` dans ce lot.
- **Options** : (a) garder `coupling.resolution` ; (b) un champ de premier niveau `discovery` (facultatif, sans `/2`),
  dans un lot dont le périmètre inclut `src/metrics/index.mjs`, et une page « Découverte » dans le rapport Markdown
  (`src/report/markdown.mjs`, hors périmètre aussi).
- **Recommandation** : **(b)**, avec AM-5 (restitution) ou un petit lot dédié : la découverte concerne tout le relevé,
  pas seulement le couplage, et le lecteur du rapport doit voir ce qui a été deviné.

### DS-3 — Configuration employée par `diff --base` — **tranchée : D-020, option (c)**
- **Décision** : D-020 (validée) retient **(c)** : chaque côté garde sa configuration ; un avertissement est émis quand
  les deux configurations diffèrent. **À livrer dans AM-2** (pas encore codé).
- **Contexte** : une révision ancienne peut ne pas avoir la config actuelle (cas réel : scribe ci-dessus). Mesurée avec
  sa propre config, elle n'est pas vue avec les mêmes alias, groupes et seuils que l'autre côté.
- **Options** : (a) **chaque côté sa config** (comportement livré), `--config` pour imposer la même ; (b) par défaut,
  la config de l'arbre de travail (ou de `--head`) pour les deux côtés, `--own-config` pour revenir à (a) ; (c) (a) plus
  un avertissement quand les deux configs diffèrent.
- **Recommandation** : **(c)**. Le défaut reste fidèle à chaque révision (un changement de seuils fait partie de
  l'histoire), et l'avertissement signale le cas où la comparaison mélange deux lunettes. Petit ajout, pour AM-2 qui
  touche à la config.

### DS-1 — Forme garantie de `violations` dans `metrics.json` v1 — **tranchée : D-018, option (a)**
- **Contexte** : P2 décrit `violations` comme « règle → liste de clés » ; le code produit « règle → liste d'objets »
  `{ key, value, limit, detail }` [CONSTAT].
- **Options** : (a) **garantir des objets dont seul `key` (chaîne) est requis** ; `value`, `limit`, `detail` décrits,
  non garantis ; (b) changer la sortie en listes de clés (casse le rapport Markdown et la branche `metriques` de scribe) ;
  (c) garantir les quatre champs.
- **Recommandation** : **(a)**. Aucune sortie ne change ; le diff et la baseline n'ont besoin que de `key` ; `value` et
  `detail` peuvent encore évoluer (ex. `detail: "ligne 16"` → numéro de ligne) sans passer à `/2`.

### DS-2 — Champs garantis de `groups` — **tranchée : D-019, option (a)**
- **Options** : (a) **garantir `name` et `path` (chaînes), décrire `files`, `codeLines`, `functions`, `complexity`
  (entiers) comme garantis aussi** — ils existent depuis 0.1 et le diff par groupe en a besoin ; (b) ne garantir que
  `name` et `path`.
- **Recommandation** : **(a)** : l'écart par groupe d'`archimetrics diff` s'appuie sur ces quatre nombres. AM-2 ajoutera
  `origine` / `confiance` / `indices` comme champs facultatifs (sans changer de version).

## Journal

- **2026-11-23** — Ouverture du chantier (AM-0) : branche `lot/AM-0` depuis `main` (`bcb1e3f`) ; `chantiers/ecosysteme/`
  supprimé ; audit ; roadmap ; `check --no-git` = 37 violations ; baseline écrite ; `npm test` 15/15. Commit `03177a2`.
- **2026-11-23** — Roadmap, DS-1 et DS-2 acceptées par l'auteur. AM-1 sur `lot/AM-1` : tous les appels Git passent par
  `src/git.mjs` (liste de lecture, observateur pour les tests) ; `cfg.useGit = false` pour une révision extraite ;
  inventaire `files` (non garanti) ajouté à `metrics.json` pour les fichiers apparus / disparus ; extraction de
  `git archive` par un lecteur tar minimal (`src/tar.mjs`, pas de dépendance au `tar` du système) ; `--config` ajouté à
  `diff --base` (DS-3). `npm test` 26/26 ; `check --root . --no-git` : 0 violation nouvelle, 37 tolérées.
- **2026-11-23** — AM-0 et AM-1 fusionnés dans `main` (`68392ca`, étiquette `v1`). DS-3 tranchée par D-020 (option (c),
  avertissement à livrer dans AM-2). Prochain lot : AM-2.
- **2026-11-23** — AM-2 sur `lot/AM-2` (depuis `chantier/etat-apres-AM-1`) : `src/discover/` (`scan`, `workspaces`,
  `aliases`, `python`, `entries`, `generated`, `index`), branché dans `loadConfig` ; `groups.mjs` (origine, plus de groupe
  de tests seuls) ; `coupling.mjs` (`*.worker.*`, `resolution`) ; D-020 dans `diff-cli.mjs` / `diff.mjs` ; schéma
  (champs facultatifs) ; README. Essais sur scribe, CC, jgr-ui (copies hors dépôt). `npm test` 35/35 ; `check` : 0
  violation nouvelle, 37 tolérées. DS-4 proposée.
- **2026-11-23** — DS-4 acceptée par l'auteur, option (b) : `discovery` de premier niveau et page « Découverte », avec
  AM-5 ; reportée dans `ARCHI_DECISIONS.md` : D-021.
- **2026-11-23** — AM-2 validé par l'auteur ; `lot/AM-2` fusionné dans `main` par avance rapide (35 tests verts, 0
  violation nouvelle sur la pointe du lot) ; rien de poussé ; `v1` inchangée.
- **2026-11-23** — AM-3 sur `lot/AM-3` (depuis `main`, `b972799`) : `src/llm/` (`provider`, `ollama`, `openai-compatible`,
  `http`, `json`, `index`) ; `bench/` (`cas.json`, 10 diffs, `lib.mjs`, `run.mjs`, `README.md`, `resultats.md`) ; tests
  `llm.test.mjs` et `bench.test.mjs`. `npm test` 56/56 ; `check` : 0 violation nouvelle, 37 tolérées. Fins de ligne du
  banc ramenées à LF (empreinte stable sous `core.autocrlf`). D-034 (b) appliquée avant tout push : diffs de scribe
  extraits à la volée, et commits du lot refaits pour qu'aucun ne contienne d'extrait de scribe. Ni push ni fusion : à
  valider par l'auteur.
- **2026-11-23** — AM-3 validé par l'auteur ; `lot/AM-3` fusionné dans `main` par avance rapide (56 tests verts, 0 violation
  nouvelle, `archi verify` ok sur la pointe du lot) ; rien de poussé ; `v1` inchangée.
- **2026-11-24** — AM-4b sur `lot/AM-4b` (depuis `main`, `117d7b7`) : `--contexte fichier` et `--num-ctx` (revue et
  banc), filtre de preuve sur les « \n » littéraux (consigne `revue-am4b-1`), fichiers après le changement dans le banc
  (`780dd51`). Mesures : `71fbe0e3` tient D-035 (a) (6/15, 15/15, 0/6) ; `1880f419` (diff) non. `npm test` 73/73 ;
  `check` : 0 violation nouvelle, 37 tolérées. D-036 proposée. Ni push ni fusion : à valider par l'auteur.
- **2026-11-24** — AM-4b validé par l'auteur ; `lot/AM-4b` fusionné dans `main` par avance rapide (73 tests verts) ; rien de
  poussé ; `v1` inchangée. D-036 reste proposée.
- **2026-11-27** — AM-8 sur `lot/AM-8` (depuis `main`, `a97a48a`) : `src/contexte/` (`signatures`, `model`, `paquet`,
  `claude-md`, `cli`), `analyzeScript.signatures`, sous-commandes `contexte` et `claude-md`, README, `test/contexte.test.mjs`.
  Mesure sur 3 cibles : paquet à 36 %, 54 % et 37 % des fichiers lus en entier. `npm test` 82/82 ; `diff --base main` :
  0 violation ajoutée. Ni push ni fusion : à valider par l'auteur.
