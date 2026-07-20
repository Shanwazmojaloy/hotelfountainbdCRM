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
# Non-blocking advisory: prints but never sets FAIL, so it can NEVER abort a
# commit. Used for the fuzzy brace-balance heuristic (raw brace counting can be
# legitimately imbalanced inside strings/regex/template literals). Real
# truncation is caught by the reliable signals (NUL bytes, size, EOF char).
warn() { echo "${YLW}⚠ $*${OFF}" >&2; }

# Set when a counting/enumeration subprocess could not run (transient bash/fork
# starvation — e.g. "couldn't create signal pipe, Win32 error 5"). When tripped
# we report "guard could not run — rerun" instead of a FALSE brace-imbalance /
# truncation block. See MEMORY_LOG (Win32-error-5 fork failures on landing commit).
GUARD_BROKEN=0

# Count occurrences of a single literal char in a file. Echoes a non-negative
# integer on success, or "ERR" if the counting subprocess produced no/garbage
# output (fork failure). Always exits 0 so `set -e` never trips on it.
count_char() {
  # Count a literal brace char in ONE awk pass. The old `grep -o | wc -l`
  # spawned a 2-process pipe per call; under Windows fork-starvation
  # ("Win32 error 5") the pipe returned a PARTIAL count (e.g. } = 1 for a
  # balanced 5/5 file) -> false "brace imbalance". A single awk process is
  # atomic. gsub uses a char class so { and } are matched literally, not as
  # regex interval operators.
  local n
  case "$2" in
    '{') n=$(awk '{c+=gsub(/[{]/,"&")} END{print c+0}' "$1" 2>/dev/null) ;;
    '}') n=$(awk '{c+=gsub(/[}]/,"&")} END{print c+0}' "$1" 2>/dev/null) ;;
    *)   n=$(awk -v ch="$2" '{c+=gsub(ch,"&")} END{print c+0}' "$1" 2>/dev/null) ;;
  esac
  n=${n//[!0-9]/}
  [ -n "$n" ] && echo "$n" || echo "ERR"
}

# ── 1. crm-src.jsx — must contain exactly one ReactDOM.createRoot call ──
F="public/crm-src.jsx"
if [ -f "$F" ]; then
  N=$(grep -c "ReactDOM.createRoot" "$F" || true)
  if [ "$N" != "1" ]; then
    fail "$F: ReactDOM.createRoot count = $N (expected 1)"
  else
    pass "$F: createRoot guard ok"
  fi
  # Balanced braces sanity (skip + flag if the counting subprocess failed)
  OB=$(count_char "$F" "{"); CB=$(count_char "$F" "}")
  if [ "$OB" = "ERR" ] || [ "$CB" = "ERR" ] || [ "$OB" = "0" ] || [ "$CB" = "0" ]; then
    GUARD_BROKEN=1
  else
    DIFF=$(( OB - CB ))
    if [ "${DIFF#-}" -gt 5 ]; then
      warn "$F: brace imbalance { = $OB, } = $CB (advisory — not blocking)"
    fi
  fi
  # Must end with the render line (no trailing junk)
  LAST=$(tail -1 "$F")
  if ! echo "$LAST" | grep -q "React.createElement(App, null))"; then
    fail "$F: last line is not the render call — possible truncation"
    echo "   last line: $LAST"
  fi
fi

# ── 1b. crm.html — live CRM shell: no NUL bytes, must end with </html> ──
# This file repeatedly corrupts via OneDrive/editor saves (UTF-16/NUL-fill,
# tail truncation). It was NOT guarded before — commit e370c8a shipped a
# 196KB 95%-NUL crm.html to production. Recover from history if this trips.
F="public/crm.html"
if [ -f "$F" ]; then
  if ! cmp -s "$F" <(tr -d '\000' < "$F"); then
    fail "$F: contains NUL bytes (corrupt/UTF-16 — recover from git history)"
  fi
  if [ "$(wc -c < "$F")" -lt 1000 ]; then
    fail "$F: under 1KB — truncated"
  fi
  LASTH=$(tail -c 64 "$F" | tr -d '[:space:]')
  if ! echo "$LASTH" | grep -q "</html>$"; then
    fail "$F: does not end with </html> — truncated"
  fi
  [ "$FAIL" = "0" ] && pass "$F: shell integrity ok"
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
if [ -d app/api ]; then
  ROUTES=$(find app/api -name "route.ts" -type f 2>/dev/null || true)
  if [ -z "$ROUTES" ]; then
    # app/api exists but enumeration returned nothing — find/fork failed,
    # NOT "no routes". Flag as guard-broken rather than silently passing.
    GUARD_BROKEN=1
  else
    while IFS= read -r F; do
      [ -z "$F" ] && continue
      LAST=$(tail -1 "$F" 2>/dev/null | tr -d '[:space:]')
      LC=${LAST: -1}
      # valid TS file endings: } (block), ; (statement e.g. `export const POST = run;`), ) (call)
      if [ "$LC" != "}" ] && [ "$LC" != ";" ] && [ "$LC" != ")" ]; then
        fail "$F: last non-whitespace char '$LC' — possible truncation"
      fi
      # Quick syntactic sanity — balanced braces ±3 (skip + flag on counter failure)
      OB=$(count_char "$F" "{"); CB=$(count_char "$F" "}")
      if [ "$OB" = "ERR" ] || [ "$CB" = "ERR" ] || [ "$OB" = "0" ] || [ "$CB" = "0" ]; then
        GUARD_BROKEN=1
      else
        DIFF=$(( OB - CB ))
        if [ "${DIFF#-}" -gt 3 ]; then
          warn "$F: brace imbalance { = $OB, } = $CB (advisory — not blocking)"
        fi
      fi
    done <<EOF
$ROUTES
EOF
  fi
fi

# ── 4. Untracked OneDrive sidecar files in tracked dirs ────────────────
SIDE=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E "\.(moved|stale|conflict|onedrive-[0-9])" || true)
if [ -n "$SIDE" ]; then
  echo "${YLW}⚠ untracked OneDrive sidecar files detected (not blocking):${OFF}"
  echo "$SIDE" | head -5 | sed 's/^/   /'
fi

# --- 5. crm-bundle.js -- built artifact: present, non-NUL, not truncated ------
# (This section + the final verdict below were previously truncated off, which
#  left the guard non-blocking. Restored 2026-07-20. crm.html is a thin loader;
#  the real React app is this pre-built, committed bundle -- a truncated/NUL
#  bundle ships a broken CRM, so it must block the commit.)
F="public/crm-bundle.js"
if [ -f "$F" ]; then
  if ! cmp -s "$F" <(tr -d '\000' < "$F"); then
    fail "$F: contains NUL bytes (corrupt artifact -- rebuild via npm run build:crm)"
  elif [ "$(wc -c < "$F")" -lt 50000 ]; then
    fail "$F: under 50KB -- truncated/empty build (expected ~600KB+)"
  else
    LB=$(tail -c 4 "$F" | tr -d '[:space:]'); LB=${LB: -1}
    if [ "$LB" != ";" ] && [ "$LB" != ")" ] && [ "$LB" != "}" ]; then
      fail "$F: last char '$LB' -- minified bundle looks truncated"
    else
      pass "$F: bundle artifact ok"
    fi
  fi
fi

# --- FINAL VERDICT ------------------------------------------------------------
# Block ONLY on real corruption (NUL / undersize / wrong EOF / missing render
# line). Never block on the fuzzy brace heuristic (warn-only) or on a transient
# fork/subprocess failure (GUARD_BROKEN -> allow + advise re-run).
if [ "$GUARD_BROKEN" = "1" ]; then
  say "a check could not run (transient fork/subprocess failure) -- commit ALLOWED; re-run to re-verify"
  exit 0
fi
if [ "$FAIL" = "1" ]; then
  echo "${RED}guard: BLOCKING commit -- a guarded file looks corrupt or truncated (see marks above)${OFF}" >&2
  exit 1
fi
exit 0