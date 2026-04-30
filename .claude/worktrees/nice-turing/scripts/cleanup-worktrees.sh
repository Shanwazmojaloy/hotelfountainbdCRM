#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# cleanup-worktrees.sh
# Hotel Fountain CRM (Lumea) — consolidate to a single worktree.
#
# DESTRUCTIVE. Read every line before running. git history is preserved
# (branches are not deleted), only the working-tree directories are removed.
#
# Run from the bare repo root:
#   cd "Hotel Fountain BD CRM"
#   bash .claude/worktrees/nice-turing/scripts/cleanup-worktrees.sh
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

KEEP="nice-turing"
WORKTREE_ROOT=".claude/worktrees"

echo ">> Listing existing worktrees:"
git worktree list

echo
echo ">> Will KEEP:    ${WORKTREE_ROOT}/${KEEP}"
echo ">> Will REMOVE:  every other directory under ${WORKTREE_ROOT}/"
echo
read -p "Proceed? (type YES to continue) " confirm
[[ "$confirm" == "YES" ]] || { echo "Aborted."; exit 1; }

# Remove each worktree except the keeper. `git worktree remove` checks for
# uncommitted changes; pass --force only if you're sure.
for dir in "${WORKTREE_ROOT}"/*/; do
  name="$(basename "$dir")"
  if [[ "$name" == "$KEEP" ]]; then
    echo "  • keeping  $name"
    continue
  fi
  echo "  • removing $name"
  git worktree remove "$dir" || git worktree remove --force "$dir"
done

echo
echo ">> Pruning worktree metadata"
git worktree prune

echo
echo ">> Done. Remaining worktrees:"
git worktree list
echo
echo "Next steps:"
echo "  1. Decide whether to also delete the legacy _backup/ directory at the"
echo "     repo's parent level (it is a SEPARATE git repo)."
echo "  2. Push your current branch and let Vercel pick it up:"
echo "       cd ${WORKTREE_ROOT}/${KEEP}"
echo "       git push origin HEAD"
