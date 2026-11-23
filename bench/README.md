# Banc de revue (AM-3)

Dix diffs annotés, tirés de l'historique de scribe et d'ArchiMetrics, pour mesurer un modèle de revue : respect du
format JSON, défauts trouvés, constats faux, conclusions « rien de significatif » justes, latence. Il sert de référence à
`archimetrics review` (AM-4, dont le critère est « pas plus de 1 constat faux sur 5 »).

```powershell
node bench/run.mjs                                   # Ollama local, qwen3:4b-instruct-2507-q4_K_M (D-007)
node bench/run.mjs --model qwen3:1.7b --case s1-nbsp-entite,a2-marque-generee --no-write
node bench/run.mjs --provider openai-compatible --base-url http://127.0.0.1:1234/v1 --model <nom>
node bench/run.mjs --mode revue                      # AM-4 : par archimetrics review, ≈ 10 min (3 à 5 appels par cas)
```

Deux modes, mêmes cas, mêmes diffs, même notation : `--mode brut` (défaut, AM-3), une question par cas sur le diff ;
`--mode revue` (AM-4), chaque cas passe par `archimetrics review` (« Le mode revue » plus bas). La consigne fait partie de
l'empreinte : les deux modes ont chacun la leur.

Une adresse qui n'est pas locale est refusée sans `--allow-remote` ; la clé d'un service se lit dans la variable
d'environnement nommée par `--api-key-env`, jamais dans un fichier. Chaque passage ajoute une ligne à
[resultats.md](resultats.md) et écrit le détail (revues, essais) dans `resultats/`.

## Les cas

`cas.json` (format `archimetrics.bench/1`). Les cas d'ArchiMetrics ont leur diff figé dans `cas/`. Les cas de scribe
(dépôt privé, D-034) n'ont que leur **référence** (commit, mode, fichiers) : leur diff est extrait à la volée du dépôt
local, en mémoire, par `git show` ou `git diff <c> <c>^` (`extract.mjs`, lecture seule). Le chemin vient de
`--repo scribe=<chemin>` ou de `bench/depots.local.json` (ignoré par Git : `{ "scribe": "C:/…/scribe" }`). Sans scribe, ses
7 cas sont sautés et le passage est marqué `-partiel`. Le détail des passages (`resultats/`) est ignoré par Git : les
revues citent le code des cas ; seul le tableau `resultats.md` (des chiffres) est versionné.

| Cas | Dépôt | Origine | Attendu |
|---|---|---|---|
| `s1-nbsp-entite` | scribe | `ffc41a81` renversé | l'entité `&nbsp;` n'est plus protégée |
| `s2-bascule-course` | scribe | `22926469` renversé | lire puis cliquer : la section se referme (course) |
| `s3-feuille-relative` | scribe | `6ad6a8e0` renversé (`paginate.js`) | feuille de style en chemin relatif, perdue sous une route imbriquée |
| `s4-temporel-natif` | scribe | `b2f4598a` | rien (sortie identique, plus rapide) |
| `s5-etats-module` | scribe | `d89163f0` | rien |
| `s6-pastille-titre` | scribe | `c81b2c04` | rien |
| `s7-frise-selecteur` | scribe | `b423d6a0` (recettes) | rien |
| `a1-tmpdir-parallele` | archimetrics | `c82f829` renversé (`test/diff.test.mjs`) | test sensible aux tests lancés en parallèle |
| `a2-marque-generee` | archimetrics | reconstitué d'après le journal d'AM-2 | marque « généré » reconnue hors d'une tête de commentaire |
| `a3-groupes-origine` | archimetrics | `c82f829` (`groups.mjs`) | rien |

« Renversé » : le diff d'un correctif inversé réintroduit le défaut que le correctif nomme ; le message du commit n'est
pas montré au modèle (il décrirait le correctif). Limite : un diff renversé retire aussi le commentaire qui expliquait le
correctif, ce qui aide le modèle.

## La notation

Sans LLM (`lib.mjs`, `scoreCase`) : un constat de nature `avéré` ou `risque` **trouve** un défaut attendu quand sa
description contient l'un des mots-clés du cas (casse et accents ignorés) ; sinon il est **faux**. Les `suggestion` ne
comptent pas. Un cas sain est juste quand aucun constat avéré ou risqué n'est émis. La notation par mots-clés est
indulgente : un constat qui nomme le bon mécanisme avec un raisonnement en partie faux compte comme trouvé ; le détail
de `resultats/` permet de relire.

L'**empreinte** (8 caractères) couvre les dépôts décrits, chaque cas (attendu, mots-clés), le texte des diffs (figés ou
extraits), la consigne et sa version (`PROMPT_VERSION`), pas la forme de `cas.json` : deux lignes
ne se comparent qu'à empreinte égale. L'adaptateur Ollama fixe température 0 et graine 42 ; cela ne suffit pas : le
premier passage après chargement du modèle diffère des passages à chaud (voir `resultats.md`). Comparer à chaud.

## Le mode revue (AM-4)

`revue.mjs` passe chaque cas à `reviewChange` (`src/review/index.mjs`) : exclusions et masquage des secrets, constats
déterministes, segmentation, puis trois filtres sur les constats du modèle. (1) L'examen d'un segment rend des
constats sans champ « conclusion » (avec ce champ en tête du schéma, Qwen 4B conclut « rien » sur les 10 cas : la
sortie contrainte écrit d'abord la conclusion). (2) La preuve doit être une ligne changée du segment. (3) Une
contre-vérification en deux vues, l'avant et l'après puis le diff, avec la justification écrite avant le verdict ; seul
un double « confirmé » garde le constat. Le message du commit n'est pas montré (comme au mode brut). Le format compte
« au 1er essai » quand tous les appels d'un cas l'ont été. Le coût se lit dans les colonnes de latence et de jetons ;
`resultats/` garde, par cas, le document `review.json` complet (constats gardés et écartés, avec leurs raisons).
