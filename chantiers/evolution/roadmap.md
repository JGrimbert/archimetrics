# Chantier « évolution » d'ArchiMetrics — roadmap interne

> Cible, livrables et critères de fin de chaque lot : **Phase 2** de `C:\jgr\archi\ARCHI_ROADMAP.md` (seule référence,
> non recopiée ici). Ce document n'ajoute que ce qui est propre au dépôt : fichiers touchés, ordre interne, risques,
> et ce que l'audit de [state.md](state.md) retire ou ajoute à chaque lot.
> Statut : **validée par l'auteur le 2026-11-23** (fin d'AM-0). AM-1 : fait sur `lot/AM-1` (voir [state.md](state.md)).

Ordre : AM-1 → (AM-2 ‖ AM-3) → AM-4 → AM-5 → AM-6. Une branche `lot/AM-n` par lot, partie de la précédente tant que
rien n'est fusionné.

## AM-1 · Contrat `metrics.json` v1 et `archimetrics diff`

- **Réduit par l'existant** : `metrics.json` existe déjà avec tous les champs garantis ; la logique « ajoutées /
  résorbées par clé » existe dans `src/baseline.mjs` `compare` et peut être reprise (sans la modifier) pour le diff.
- **Fichiers** : `src/metrics/index.mjs` (ajout de `schemaVersion` en tête de `result`) ; `src/report/index.mjs`
  (inchangé sauf si l'ordre des clés l'exige) ; nouveaux : `schemas/metrics.schema.json`,
  `schemas/metrics-diff.schema.json` [HYPOTHÈSE : utile au consommateur, peu coûteux], `src/schema.mjs` (validateur
  minimal), `src/diff.mjs` (calcul + Markdown), `src/git-base.mjs` (`git archive` vers `os.tmpdir()`) ;
  `bin/archimetrics.mjs` (commande `diff`) ; `README.md` (règle de compatibilité, commande `diff`) ;
  `package.json` (`files` : ajouter `schemas`) ; tests : `test/schema.test.mjs`, `test/diff.test.mjs`, fixtures sous
  `test/fixtures/`.
- **Ordre interne** : validateur + schéma + test de non-régression → `diff` sur deux fichiers → lecture pré-v1 →
  `--base` → essai sur scribe (sortie hors dépôt).
- **Livré** (écart au plan) : `src/tar.mjs` (lecteur tar minimal, retenu plutôt que le `tar` du système), `src/git.mjs`
  (tous les appels Git), `src/diff-cli.mjs` ; `src/report/index.mjs` exporte `metricsDocument` ; `--config` sur
  `diff --base`.
- **Risques** (au départ) : `--base` sur Windows (extraire l'archive sans dépendance npm) ; durée d'analyse de scribe deux fois
  (borne de 2 min de P2) ; `commit` vaut `null` dans le dossier extrait → le diff doit afficher la référence demandée.
  Décisions DS-1 et DS-2 de [state.md](state.md) à trancher avant d'écrire le schéma.

## AM-2 · Découverte zero config

- **Réduit par l'existant** : valeurs par défaut, workspaces npm sans motif, groupes par dossiers, résolution des alias
  et des racines Python **une fois connus** (`src/graph.mjs`) : il ne manque que la **découverte**.
- **À faire, nommé par l'audit** : workspaces à motif (`packages/*`) ; alias depuis `tsconfig`/`jsconfig`
  (`compilerOptions.paths`, `baseUrl`) et `vite.config` (lecture statique de `resolve.alias`, sans exécuter le fichier) ;
  racines Python (`pyproject.toml`, dossiers à `__init__.py`) ; points d'entrée depuis `package.json`
  (`bin`, `main`, `exports`) et routes de frameworks ; code généré (en-têtes « generated », dossiers connus) ;
  champs `origine` / `confiance` / `indices` (facultatifs dans le schéma v1) ; groupe vide `test` à ne plus émettre ;
  DS-3 (avertir quand les deux côtés d'un `diff --base` n'ont pas la même config).
- **Fichiers** : `src/config.mjs`, nouveau `src/discover/` (un module par source d'indices), `src/metrics/groups.mjs`,
  `src/metrics/coupling.mjs` (`ENTRY`), `schemas/metrics.schema.json`.
- **Risques** : lire `vite.config` sans l'exécuter ne couvre que les formes littérales → `confiance` basse et indice
  explicite ; la déclaration (`archimetrics.config.json`) doit toujours l'emporter (`origine: déclaré`).
- **Livré** (écart au plan) : `src/discover/scan.mjs` (repérage borné des fichiers-indices, sans Git, pour servir aussi
  aux révisions extraites) ; un paquet se résout depuis le dossier de son point d'entrée (`src/`), sans toucher
  `src/graph.mjs` ; `*.worker.*` ajouté à `ENTRY` ; le relevé de découverte est dans `coupling.resolution` (DS-4) ;
  `test/diff.test.mjs` : test des dossiers temporaires rendu robuste au parallélisme.

## AM-3 · Adaptateurs LLM et banc

- **Existant** : rien [CONSTAT].
- **Fichiers** : `src/llm/` (interface, `ollama.mjs`, `openai-compatible.mjs`, validation JSON + réessai via
  `src/schema.mjs` d'AM-1) ; `bench/` (10 diffs annotés, script de mesure) ; tests avec un faux serveur HTTP local.
- **Dépend de** D-007 (proposée) pour le local par défaut et `--allow-remote`.
- **Risques** : aucun appel réseau dans `npm test` (faux serveur sur `127.0.0.1` uniquement) ; `fetch` natif de
  Node ≥ 20 suffit, pas de dépendance.

## AM-4 · `archimetrics review`

- **Réduit par AM-1** : métriques avant/après et violations touchées viennent de `diff` ; voisins par le graphe
  d'imports viennent de `src/graph.mjs`.
- **Fichiers** : `src/review/` (collecte, exclusions, segmentation, passes), `schemas/review.schema.json`
  (`archimetrics.review/1`), `bin/archimetrics.mjs`.
- **Risques** : fuite de secrets dans le contexte envoyé (exclusion testée) ; la partie déterministe doit tourner LLM
  éteint.

## AM-5 · Restitution en quatre niveaux

- **Réduit par l'existant** : l'accueil `README.md` du rapport et les six pages thématiques couvrent déjà « vue
  d'ensemble » et « exploration » [INTERPRÉTATION].
- **À faire** : « points d'attention » (hiérarchie à partir des violations, points chauds, cycles) et
  « recommandations » ; réorganisation de `src/report/markdown.mjs` (aujourd'hui `pages` est en baseline : 231 lignes
  pour 60 tolérées [CONSTAT]) — le lot doit le découper plutôt que l'allonger.

## AM-6 · Autodiagnostic

- **Réduit par l'existant** : `warnings`, `sizes.byLang`, passage sur soi-même en CI.
- **À faire** : constructions non reconnues comptées (imports calculés, `require` dynamiques), section `limits`
  connues dans le JSON (aujourd'hui seulement dans `README.md`), lecture du couplage interne ; résorber une partie des
  37 violations tolérées (`src/report/mermaid.mjs#diagrams`, `src/report/markdown.mjs#pages` en tête).

## Risques transverses

- Élargir le périmètre avant d'avoir figé le contrat (registre d'`archi`) : AM-1 d'abord, sans exception.
- `schemaVersion` et l'étiquette `v1` de l'Action sont indépendants : aucun lot ne déplace l'étiquette (publication =
  auteur).
- Baseline stricte : corriger une violation oblige à régénérer la baseline dans le même commit.
