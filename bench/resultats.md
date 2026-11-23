# Banc de revue — résultats

Une ligne par passage (`node bench/run.mjs`). Les lignes ne se comparent qu'à banc (empreinte) égal.

AM-3, 2026-11-23. Banc `87b36ae4` : diffs de scribe encore figés dans le dépôt ; `778e1cf7` : mêmes cas, diffs de scribe extraits à la volée (D-034), **identiques octet pour octet** (vérifié) ; seule la forme de l'empreinte a changé. Les deux premières lignes sont antérieures à la graine fixe (`seed: 42`). Avec ou sans graine, Qwen donne deux résultats : le **premier passage après chargement du modèle** (3/5, 7/12, 2 042 jetons) et les **passages à chaud** (2/5, 8/11, 1 826 jetons), chacun reproduit à l'identique.

AM-4, 2026-11-23. Mode `--mode revue` (`archimetrics review`), fournisseur noté « ollama (revue) ». Mêmes cas et mêmes diffs que `778e1cf7` ; l'empreinte change avec la consigne (`REVIEW_PROMPT_VERSION`). `03ad2d95` = consigne `revue-am4-3`, celle d'`archimetrics review` à la fin d'AM-4. `5801ea3f` = variante `revue-am4-4` (avant/après montrés aussi à l'examen), essayée puis abandonnée (aucun constat émis). Passages de mise au point non écrits (`--no-write`), même modèle : `7ad80874` (champ « conclusion » en tête : 0/5, 5/5, 0/0), `598da884` (une seule contre-vérification sur le diff : 2/5, 4/5, 3/5 faux), `26e27538` (une seule, en avant/après : 1/5, 5/5, 2/3), et `03ad2d95` à 19:39 (1/5, 5/5, **0/1**, 585 s). Avec la même graine, deux passages à chaud de `03ad2d95` diffèrent : le mode revue enchaîne des appels dont l'ordre et le cache varient [HYPOTHÈSE].

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
