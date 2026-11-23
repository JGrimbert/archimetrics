# archimetrics

Métriques et garde-fous d'architecture pour les dépôts JS / TS / Vue / Python, et un rapport publié sur une **branche
orpheline** du projet analysé : sa page d'accueil GitHub affiche les chiffres sans qu'aucun commit de robot ne touche
l'historique du code.

- **Tailles** : lignes de code (sans commentaires ni lignes vides) par fichier et par bloc `.vue`, par fonction ; paramètres.
- **Complexité** : cyclomatique (McCabe), cognitive (SonarSource, approchée), imbrication.
- **Couplage et cohésion** : Ca / Ce / instabilité par dossier (R. C. Martin), cohésion des dossiers, fan-in / fan-out,
  matrice entre groupes, cycles d'imports (Tarjan), LCOM4 des classes, injections, exports jamais importés, fichiers sans importeur.
- **Redondances** : clones « au renommage près » (jetons normalisés, empreinte roulante).
- **Organisation** : fichiers par dossier, doc de dossier (par défaut `CLAUDE.md`) — longueur, présence, chemins cités morts.
- **Historique Git** : points chauds (commits × complexité) et couplage temporel (A. Tornhill).
- **Diagrammes Mermaid** : vue d'ensemble, chaque groupe découpé par dossiers, classes (par module Nest s'il y en a),
  composants Vue (qui emploie qui), modèle de données Prisma.
- **Images SVG** pour le README : résumé, évolution, carte du code (treemap), points chauds.

Analyse statique seulement (arbre syntaxique de TypeScript, `@vue/compiler-sfc`, `ast` de Python) : rien n'est exécuté ni
compilé. Python 3.9+ est employé s'il est là (`$ARCHIMETRICS_PYTHON`, `python3`, `python`, `py -3`).

## Dans la CI d'un projet

```yaml
  metriques:
    runs-on: ubuntu-latest
    permissions:
      contents: write          # pour publier sur la branche des rapports
    concurrency:
      group: metriques-${{ github.ref }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0       # l'historique complet, pour les points chauds
      - uses: JGrimbert/archimetrics@v1
```

Sur un pull request : relevé, garde-fous, compte rendu dans le résumé du job, rapport en pièce jointe. Sur un push de la
branche par défaut : en plus, le rapport est publié sur la branche `metriques` (créée orpheline au premier passage).

Entrées : `root`, `config`, `branch` (`metriques`), `publish` (`auto` | `true` | `false`), `check` (`true`),
`setup-node` (`true`), `artifact` (`true`).

## Versions : l'étiquette `v1`

La ligne `uses: JGrimbert/archimetrics@v1` ne prend pas la dernière version du code. Elle prend le commit qui porte
l'**étiquette** (le *tag*) `v1`, un marque-page posé sur un commit précis. Sans cette étiquette sur GitHub, le job du
projet échoue : GitHub ne trouve rien à exécuter.

L'intérêt : on travaille sur archimetrics sans casser les projets qui l'emploient. Les nouveaux commits ne déplacent
pas l'étiquette, et les projets gardent la version étiquetée tant qu'on ne l'a pas déplacée.

**Première fois**, après le premier commit poussé :

```
git tag v1              # pose l'étiquette v1 sur le dernier commit (en local)
git push origin v1      # l'envoie sur GitHub (un simple `git push` n'envoie pas les étiquettes)
```

Sur GitHub, le sélecteur de branches a un onglet **Tags** qui doit afficher `v1`.

**Quand une nouvelle version est prête** (tests passés, essayée en local sur un projet) :

```
git tag -f v1           # déplace l'étiquette sur le dernier commit (-f : elle existe déjà, Git refuserait sinon)
git push -f origin v1   # remplace celle de GitHub
```

Seule l'étiquette bouge : l'historique des commits reste le même. Au prochain passage de leur CI, les projets prennent
la nouvelle version.

**Un changement qui casse** l'usage (une option renommée, un format de baseline modifié) : poser plutôt une nouvelle
étiquette `v2`, et passer chaque projet de `@v1` à `@v2` quand il est prêt.

**Sans étiquette** : `uses: JGrimbert/archimetrics@main` prend toujours la dernière version, même inachevée.
C'est plus simple, mais un commit en cours sur archimetrics peut alors faire échouer la CI d'un projet.

## En local, sans rien installer dans le projet

```
git clone https://github.com/JGrimbert/archimetrics && cd archimetrics && npm ci
node bin/archimetrics.mjs all --root ../mon-projet            # rapport dans ../mon-projet/.archimetrics + garde-fous
node bin/archimetrics.mjs check --root ../mon-projet --no-git  # garde-fous seuls
node bin/archimetrics.mjs baseline --root ../mon-projet         # tolérer l'existant (écrit archimetrics.baseline.json)
node bin/archimetrics.mjs readme --root ../mon-projet --write README.md   # pose le bloc des images dans le README
```

(`npx github:JGrimbert/archimetrics all --root .` marche aussi.) Ajouter `.archimetrics/` au `.gitignore` du projet.

## Ce que le projet garde

- `archimetrics.config.json` — seuils et découpage (tout est facultatif) :

```json
{
  "name": "Mon projet",
  "aliases": { "@": "frontend/src" },
  "pythonRoots": ["service"],
  "groups": [{ "name": "front", "path": "frontend" }, { "name": "api", "path": "backend" }],
  "limits": { "fileCodeLines": 400, "functionLines": 60, "params": 5, "cyclomatic": 15, "cognitive": 20,
              "nesting": 5, "filesPerDir": 40, "docMaxLines": 200, "docRequiredFrom": 8, "lcom": null },
  "docName": "CLAUDE.md",
  "docLinksIgnore": ["^HorsDuDepot/"],
  "entries": ["^scripts/"],
  "diagrams": { "depth": 2, "links": [{ "from": "front", "to": "api", "label": "HTTP" }] },
  "publish": { "branch": "metriques", "repo": "proprietaire/depot" }
}
```

Les paquets des workspaces npm sont reconnus seuls ; un seuil à `null` désactive sa règle.

- `archimetrics.baseline.json` — les violations tolérées. Le garde-fou échoue sur une violation **nouvelle** ; en mode
  strict (`strictBaseline`, par défaut), aussi sur une violation tolérée qui a disparu : elle doit sortir de la liste, qui
  ne fait que rétrécir.

## Le relevé `metrics.json` et sa version

`metrics.json` (écrit par `report` / `all`) porte en tête `"schemaVersion": "archimetrics.metrics/1"`. Son schéma (JSON
Schema 2020-12) est publié dans [`schemas/metrics.schema.json`](schemas/metrics.schema.json).

- **Garantis en v1** : `schemaVersion`, `tool`, `name`, `date`, `commit` (chaîne ou `null`), `limits`, `summary` (tous
  ses champs), `violations` (règle → liste de violations, dont seul `key` est garanti), `groups` (`name`, `path`,
  `files`, `codeLines`, `functions`, `complexity`), `check` (objet ou `null`).
- **Décrits, non garantis en v1** : `files`, `sizes`, `functions`, `organisation`, `coupling`, `duplication`, `history`,
  `warnings`, `durationMs`, `baselinePath`, et les champs `value` / `limit` / `detail` d'une violation.

**Règle de compatibilité.** Ajouter un champ facultatif ne change pas la version. Retirer, renommer ou changer le type
d'un champ garanti oblige à passer à `archimetrics.metrics/2`. Cette version du format et l'étiquette `v1` de l'Action
sont deux choses distinctes : l'une ne suit pas l'autre.

## Comparer deux relevés : `archimetrics diff`

```
node bin/archimetrics.mjs diff avant/metrics.json apres/metrics.json --out /tmp/diff
node bin/archimetrics.mjs diff --base main --root ../mon-projet --out /tmp/diff               # main → arbre de travail
node bin/archimetrics.mjs diff --base 1a2b3c4 --head 5d6e7f8 --root ../mon-projet --out /tmp/diff  # entre deux commits
```

Écrit `metrics-diff.json` (`"schemaVersion": "archimetrics.metrics-diff/1"`, schéma
[`schemas/metrics-diff.schema.json`](schemas/metrics-diff.schema.json)) et `metrics-diff.md` (par défaut dans
`<root>/.archimetrics/diff`) : l'écart de chaque champ de `summary`, les violations ajoutées et résorbées par règle (par
clé), l'écart par groupe, les fichiers apparus et disparus quand les deux relevés ont leur inventaire `files`. Le code
de sortie est 0 : le diff informe, `check` juge.

- **`--base <ref>`** analyse une révision **sans toucher au dépôt** : `git archive` de la révision vers un dossier
  temporaire du système, analyse sans Git (ni points chauds), dossier supprimé à la fin. Ni `checkout`, ni `stash`, ni
  `worktree` : archimetrics ne lance que des commandes Git de lecture (`src/git.mjs` refuse les autres). Sans `--head`,
  l'autre côté est l'arbre de travail (fichiers suivis ou non ignorés). Chaque côté est mesuré avec **sa** configuration
  (`archimetrics.config.json` de la révision, ou les valeurs par défaut si elle n'en a pas), sauf avec `--config <f>`,
  qui impose la même aux deux côtés (utile pour une révision antérieure à la config) ; la mesure est toujours faite par
  la version courante d'archimetrics. Les deux relevés comparés sont écrits à côté (`avant.json`, `apres.json`). Un fichier marqué `export-ignore` dans `.gitattributes` n'est pas extrait.
- Un relevé **sans `schemaVersion`** (antérieur à v1, par exemple sur une branche `metriques` déjà publiée) est lu comme
  « pré-v1 », avec un avertissement, s'il a au moins `summary` et `violations` ; sinon, l'erreur le dit.

## Limites connues

- Complexité cognitive approchée : ni sauts étiquetés ni récursion ; une fonction imbriquée est mesurée à part.
- Une fonction est repérée par son nom : la renommer la fait sortir puis entrer dans la baseline.
- Exports morts et fichiers sans importeur sont indicatifs : un import calculé, un point d'entrée inconnu y échappent.
- Les images du README sont lues sur `raw.githubusercontent.com` : un dépôt privé ne les montre qu'aux comptes qui y ont accès.

## Développement

```
npm ci
npm test          # node --test
npm run self      # l'outil passé sur lui-même
```

Licence MIT.
