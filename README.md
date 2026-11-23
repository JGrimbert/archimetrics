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
