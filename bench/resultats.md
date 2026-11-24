# Banc de revue — résultats

Une ligne par passage (`node bench/run.mjs`). Les lignes ne se comparent qu'à banc (empreinte) égal.

AM-3, 2026-11-23. Banc `87b36ae4` : diffs de scribe encore figés dans le dépôt ; `778e1cf7` : mêmes cas, diffs de scribe extraits à la volée (D-034), **identiques octet pour octet** (vérifié) ; seule la forme de l'empreinte a changé. Les deux premières lignes sont antérieures à la graine fixe (`seed: 42`). Avec ou sans graine, Qwen donne deux résultats : le **premier passage après chargement du modèle** (3/5, 7/12, 2 042 jetons) et les **passages à chaud** (2/5, 8/11, 1 826 jetons), chacun reproduit à l'identique.

AM-4, 2026-11-23. Mode `--mode revue` (`archimetrics review`), fournisseur noté « ollama (revue) ». Mêmes cas et mêmes diffs que `778e1cf7` ; l'empreinte change avec la consigne (`REVIEW_PROMPT_VERSION`). `03ad2d95` = consigne `revue-am4-3`, celle d'`archimetrics review` à la fin d'AM-4. `5801ea3f` = variante `revue-am4-4` (avant/après montrés aussi à l'examen), essayée puis abandonnée (aucun constat émis). Passages de mise au point non écrits (`--no-write`), même modèle : `7ad80874` (champ « conclusion » en tête : 0/5, 5/5, 0/0), `598da884` (une seule contre-vérification sur le diff : 2/5, 4/5, 3/5 faux), `26e27538` (une seule, en avant/après : 1/5, 5/5, 2/3), et `03ad2d95` à 19:39 (1/5, 5/5, **0/1**, 585 s). Avec la même graine, deux passages à chaud de `03ad2d95` diffèrent : le mode revue enchaîne des appels dont l'ordre et le cache varient [HYPOTHÈSE].

AM-4b, 2026-11-23/24. `--contexte fichier` (fournisseur « ollama (revue, fichier) », `--num-ctx 8192`) : les passes voient
aussi le fichier après le changement. `864bf925` = consigne `revue-am4-3+fichier-1`, avant le correctif du filtre de
preuve. Depuis `780dd51`, la preuve citée se découpe aussi sur les « \n » littéraux : consigne `revue-am4b-1`, d'où
`1880f419` (contexte `diff`) et `71fbe0e3` (contexte `fichier`). Chaque série est précédée d'une chauffe sur a3 seul
(ligne « -partiel », hors tableau ci-dessous et hors cumul). Cumuls des 3 passages à chaud :
`864bf925` 3/15 défauts, 15/15 sains, 0 faux / 3 émis ; `1880f419` 3/15 défauts (s1), 12/15 sains, **2 faux / 5 émis**
(s6, deux fois ; à 22:14, s7 hors délai à 120 s) : D-035 (a) **non tenu** ; `71fbe0e3` **6/15** défauts (s1 et a2 à
chaque passage), **15/15** sains, **0 faux / 6 émis**, trois passages identiques : D-035 (a) **tenu**, au plancher exact
du rappel (2/5 par passage) ; latence médiane 141–142 s par cas, max 440 s (a2), ≈ 1 770 s le banc (2,5 × `1880f419`).
Relecture par l'agent (`resultats/202611240009-…json`) : le constat de s1 (l'entité `&nbsp;` n'est plus protégée) et
celui de a2 (`COMMENT` retiré de la regex de la marque) décrivent le bon mécanisme ; le faux de s6 en contexte `diff`
reproche à `chipTitle` d'écraser le titre d'origine, sur un cas sain.

| Date (UTC) | Banc | Fournisseur | Modèle | Format 1er essai | Format final | Défauts trouvés | Sains « rien » | Constats faux / émis | Latence médiane | Latence max | Total | Jetons sortie |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-23 17:59 | 87b36ae4 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 3/5 | 2/5 | 7/12 | 8.5 s | 65.1 s | 140.3 s | 2042 |
| 2026-11-23 18:00 | 87b36ae4 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 2/5 | 8/11 | 7.6 s | 20.6 s | 78.2 s | 1826 |
| 2026-11-23 18:02 | 87b36ae4 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 2/5 | 8/11 | 7.8 s | 22.4 s | 79.3 s | 1826 |
| 2026-11-23 18:03 | 87b36ae4 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 2/5 | 8/11 | 7.8 s | 21 s | 79 s | 1826 |
| 2026-11-23 18:22 | 778e1cf7 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 3/5 | 2/5 | 7/12 | 8.8 s | 25.6 s | 94.2 s | 2042 |
| 2026-11-23 18:24 | 778e1cf7 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 2/5 | 8/11 | 7.6 s | 20.7 s | 78.1 s | 1826 |
| 2026-11-23 19:52 | 03ad2d95 | ollama (revue) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 0/5 | 5/5 | 1/1 | 62 s | 115.6 s | 586.5 s | 12953 |
| 2026-11-23 20:04 | 5801ea3f | ollama (revue) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 0/5 | 5/5 | 0/0 | 59.3 s | 145.4 s | 699.9 s | 13666 |
| 2026-11-23 20:15 | 03ad2d95 | ollama (revue) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 0/5 | 5/5 | 0/0 | 66 s | 127.9 s | 621.7 s | 13096 |
| 2026-11-23 21:07 | 864bf925 | ollama (revue, fichier) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 1/5 | 5/5 | 0/1 | 133.7 s | 469.7 s | 1663.4 s | 14955 |
| 2026-11-23 21:33 | 864bf925 | ollama (revue, fichier) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 1/5 | 5/5 | 0/1 | 130.6 s | 428.3 s | 1588.4 s | 15027 |
| 2026-11-23 22:00 | 864bf925 | ollama (revue, fichier) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 1/5 | 5/5 | 0/1 | 127.3 s | 467.7 s | 1634.4 s | 15027 |
| 2026-11-23 22:14 | 1880f419 | ollama (revue) | qwen3:4b-instruct-2507-q4_K_M | 9/10 | 9/10 | 1/5 | 4/5 | 0/1 | 52.8 s | 120 s | 558.9 s | 9567 |
| 2026-11-23 22:26 | 1880f419 | ollama (revue) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 1/5 | 4/5 | 1/2 | 59.5 s | 158.8 s | 712.4 s | 15469 |
| 2026-11-23 22:38 | 1880f419 | ollama (revue) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 1/5 | 4/5 | 1/2 | 58.7 s | 152 s | 702 s | 15159 |
| 2026-11-23 23:10 | 71fbe0e3 | ollama (revue, fichier) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 5/5 | 0/2 | 142.3 s | 440.4 s | 1772.9 s | 16194 |
| 2026-11-23 23:39 | 71fbe0e3 | ollama (revue, fichier) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 5/5 | 0/2 | 141.2 s | 437.3 s | 1770.7 s | 16194 |
| 2026-11-24 00:09 | 71fbe0e3 | ollama (revue, fichier) | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 5/5 | 0/2 | 141.9 s | 439.6 s | 1765.6 s | 16194 |
