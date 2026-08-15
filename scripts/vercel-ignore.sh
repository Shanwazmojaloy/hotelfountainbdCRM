#!/usr/bin/env bash
# Vercel "Ignore Build Step" — decide whether this commit needs a production build.
#
#   exit 0  -> SKIP the build
#   exit 1  -> BUILD  (also the fallback for every uncertain case)
#
# Called from vercel.json:  "ignoreCommand": "bash scripts/vercel-ignore.sh"
# It lives in a file because vercel.json caps ignoreCommand at 256 characters —
# 24334e1 failed schema validation for exactly that reason.
#
# WHY: docs-only commits were each burning a full production build on Hobby
# (5e07709, 2a69c82, 2bc5841 on 2026-08-15), and one of them went red purely by
# inheriting a broken parent.
#
# THE SUBTLE PART: Vercel builds only the TIP commit of a push. Diffing HEAD^..HEAD
# is WRONG — push a code commit followed by a docs commit and the tip's own diff is
# docs-only, so the build is skipped and THE CODE NEVER DEPLOYS. That is the same
# silent-non-deployment class this guard exists to prevent. So anchor on
# VERCEL_GIT_PREVIOUS_SHA, the last commit actually deployed, which spans the whole
# push however many commits it contains.
set -u

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"

# The previous sha may be absent (first deploy) or unreachable in Vercel's shallow
# clone. Fall back to the tip's parent, then give up and build.
if [ -z "$BASE" ] || ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  BASE="$(git rev-parse HEAD^ 2>/dev/null || true)"
fi
if [ -z "$BASE" ]; then
  echo "vercel-ignore: no usable base commit — building."
  exit 1
fi

if git diff --quiet "$BASE" HEAD -- . ':(exclude)docs' ':(exclude)*.md'; then
  echo "vercel-ignore: only docs/*.md changed since ${BASE} — skipping build."
  exit 0
fi

echo "vercel-ignore: code changed since ${BASE} — building."
exit 1
