#!/usr/bin/env bash
# Publie un dossier de rapport sur une branche ORPHELINE du dépôt (son historique est séparé de celui du code) :
#   publish.sh <dossier du rapport> <branche> <racine du dépôt>
# La branche est créée au premier passage. Son contenu est remplacé à chaque fois ; un commit seulement si quelque chose change.
# Il faut un clone authentifié (actions/checkout le laisse ainsi) et `permissions: contents: write` sur le job.
set -euo pipefail

SRC="$(cd "$1" && pwd)"
BRANCH="$2"
ROOT="$3"
WT="${RUNNER_TEMP:-/tmp}/archimetrics-branch"

cd "$ROOT"
rm -rf "$WT"
git worktree prune

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git fetch --quiet --depth=1 origin "$BRANCH"
  git worktree add --quiet --detach "$WT" FETCH_HEAD
else
  echo "Branche $BRANCH absente : création (orpheline)."
  git worktree add --quiet --detach "$WT"
  git -C "$WT" checkout --quiet --orphan "$BRANCH"
  git -C "$WT" rm -rfq --cached . >/dev/null 2>&1 || true
fi

find "$WT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$SRC"/. "$WT"/
git -C "$WT" add -A

if git -C "$WT" diff --cached --quiet 2>/dev/null && git -C "$WT" rev-parse --verify --quiet HEAD >/dev/null; then
  echo "Rapport inchangé : rien à publier."
else
  git -C "$WT" -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit --quiet -m "Métriques du commit ${GITHUB_SHA:0:8}"
  git -C "$WT" push --quiet origin "HEAD:refs/heads/$BRANCH"
  echo "Rapport publié sur $BRANCH."
fi

git worktree remove --force "$WT"
