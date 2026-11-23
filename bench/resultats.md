# Banc de revue — résultats

Une ligne par passage (`node bench/run.mjs`). Les lignes ne se comparent qu'à banc (empreinte) égal.

AM-3, 2026-11-23. Banc `87b36ae4` : diffs de scribe encore figés dans le dépôt ; `778e1cf7` : mêmes cas, diffs de scribe extraits à la volée (D-034), **identiques octet pour octet** (vérifié) ; seule la forme de l'empreinte a changé. Les deux premières lignes sont antérieures à la graine fixe (`seed: 42`). Avec ou sans graine, Qwen donne deux résultats : le **premier passage après chargement du modèle** (3/5, 7/12, 2 042 jetons) et les **passages à chaud** (2/5, 8/11, 1 826 jetons), chacun reproduit à l'identique.

| Date (UTC) | Banc | Fournisseur | Modèle | Format 1er essai | Format final | Défauts trouvés | Sains « rien » | Constats faux / émis | Latence médiane | Latence max | Total | Jetons sortie |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-23 17:59 | 87b36ae4 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 3/5 | 2/5 | 7/12 | 8.5 s | 65.1 s | 140.3 s | 2042 |
| 2026-11-23 18:00 | 87b36ae4 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 2/5 | 8/11 | 7.6 s | 20.6 s | 78.2 s | 1826 |
| 2026-11-23 18:02 | 87b36ae4 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 2/5 | 8/11 | 7.8 s | 22.4 s | 79.3 s | 1826 |
| 2026-11-23 18:03 | 87b36ae4 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 2/5 | 8/11 | 7.8 s | 21 s | 79 s | 1826 |
| 2026-11-23 18:22 | 778e1cf7 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 3/5 | 2/5 | 7/12 | 8.8 s | 25.6 s | 94.2 s | 2042 |
| 2026-11-23 18:24 | 778e1cf7 | ollama | qwen3:4b-instruct-2507-q4_K_M | 10/10 | 10/10 | 2/5 | 2/5 | 8/11 | 7.6 s | 20.7 s | 78.1 s | 1826 |
