#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# OneDrive Truncation Guard — runs as pre-commit hook
# Detects tail-truncated files caused by OneDrive sync (see MEMORY.md
# entry "OneDrive file truncation"). Blocks commit if any guarded file
# is corrupt.
# ════════════════════════════════════════════════════════════════════
set -e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

FAIL=0
RED=$'\033[31m'
GRN=$'\033[32m'
YLW=$'\033[33m'
DIM=$'\033[2m'
OFF=$'\033[0m'

say()  { echo "${DIM}guard: $*${OFF}"; }
fail() { echo "${RED}✖ $*${OFF}" >&2; FAIL=1; }
pass() { echo "${GRN}✓ $*${OFF}"; }

# ── 1. crm-src.jsx — must contain exactly one ReactDOM.createRoot call ──
F="public/crm-src.jsx"
if [ -f "$F" ]; then
  N=$(grep -c "ReactDOM.createRoot" "$F" || true)
  if [ "$N" != "1" ]; then
    fail "$F: ReactDOM.createRoot count = $N (expected 1)"
  else
    pass "$F: createRoot guard ok"
  fi
  # Balanced braces sanity
  OB=$(grep -o "{" "$F" | wc -l)
  CB=$(grep -o "}" "$F" | wc -l)
  DIFF=$(( OB - CB ))
  if [ "${DIFF#-}" -gt 5 ]; then
    fail "$F: brace imbalance { = $OB, } = $CB"
  fi
  # Must end with the render line (no trailing junk)
  LAST=$(tail -1 "$F")
  if ! echo "$LAST" | grep -q "React.createElement(App, null))"; then
    fail "$F: last line is not the render call — possible truncation"
    echo "   last line: $LAST"
  fi
fi

# ── 2. lumea/page.tsx — must end with a balanced TSX export ─────────────
F="app/lumea/page.tsx"
if [ -f "$F" ]; then
  LAST=$(tail -1 "$F" | tr -d '[:space:]')
  if [ "$LAST" != "}" ] && [ "$LAST" != ");" ] && [ "$LAST" != ");}" ]; then
    fail "$F: suspicious EOF — last char '$LAST'"
  else
    pass "$F: EOF ok"
  fi
fi

# ── 3. All app/api/**/route.ts files — must end with closing brace ──────
while IFS= read -r F; do
  [ -z "$F" ] && continue
  LAST=$(tail -1 "$F" | tr -d '[:space:]')
  if [ "$LAST" != "}" ] && [ "$LAST" != ");" ]; then
    fail "$F: last non-whitespace char '$LAST' — possible truncation"
  fi
  # Quick syntactic sanity — balanced braces ±3
  OB=$(grep -o "{" "$F" | wc -l)
  CB=$(grep -o "}" "$F" | wc -l)
  DIFF=$(( OB - CB ))
  if [ "${DIFF#-}" -gt 3 ]; then
    fail "$F: brace imbalance { = $OB, } = $CB"
  fi
done < <(find app/api -name "route.ts" -type f 2>/dev/null)

# ── 4. Untracked OneDrive sidecar files in tracked dirs ────────────────
SIDE=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E "\.(moved|stale|conflict|onedrive-[0-9])" || true)
if [ -n "$SIDE" ]; then
  echo "${YLW}⚠ untracked OneDrive sidecar files detected (not blocking):${OFF}"
  echo "$SIDE" | head -5 | sed 's/^/   /'
fi

if [ "$FAIL" = "1" ]; then
  echo ""
  echo "${RED}╔════════════════════════════════════════════════════════════╗${OFF}"
  echo "${RED}║  COMMIT BLOCKED — OneDrive truncation guard tripped       ║${OFF}"
  echo "${RED}║  See memory/onedrive_file_truncation.md for repair steps  ║${OFF}"
  echo "${RED}╚════════════════════════════════════════════════════════════╝${OFF}"
  exit 1
fi

say "all guarded files passed"
exit 0
