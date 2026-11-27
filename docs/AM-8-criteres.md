# AM-8 — critères d'acceptation (copie de travail)

- [x] `analyzeScript` rend, pour chaque export, son nom, sa signature et sa JSDoc (fonctions, classes, constantes,
      ré-exports) (tests sur des sources en mémoire)
- [x] `contexte` : cibles en entier, voisins en signatures, tests associés, jetons par section ; une cible peut être
      un chemin ou un symbole exporté ; un symbole ambigu est refusé et la sortie le nomme (tests sur un dépôt fixture)
- [x] `--profondeur <n>` étend le voisinage ; `--budget` coupe d'abord les voisins les plus lointains et la sortie
      dit où elle a coupé (tests)
- [x] `--json` : sortie stable, documentée dans `README.md` (test)
- [x] `claude-md` : bloc généré entre balises ; texte manuel hors balises préservé ; deux passages successifs rendent
      un fichier identique ; sans `--ecrire`, rien n'est écrit (tests dans un dossier temporaire)
- [x] Mesure sur ArchiMetrics même, pour 3 fichiers cibles : jetons du paquet comparés à la somme des fichiers lus
      en entier (cibles et voisins), consignée dans `chantiers/evolution/state.md` (calculée, D-029)
- [x] `npm test` vert ; `archi verify AM-8` : 0 violation ajoutée

Preuves : `test/contexte.test.mjs` (9 tests) ; `npm test` 82/82 ; `node bin/archimetrics.mjs diff --base main` :
0 violation ajoutée (le critère « archi verify » est tenu par ce diff, consigne de session ; `archi verify` lui-même
n'a pas été lancé, Archi étant en lecture seule pour ce lot).
