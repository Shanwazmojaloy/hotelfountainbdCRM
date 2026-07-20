// Lumea — HYBRID snapshot cache (hot in-memory Map + warm localStorage tier).
// Contract (stale-while-revalidate):
//   getSnap(key)  — memory tier only. Safe to call during render (matches SSR HTML, no
//                   hydration mismatch). Instant for client-side tab→tab navigation.
//   warmSnap(key) — memory ∥ localStorage. Call ONLY inside useEffect (post-hydration):
//                   gives instant paint after a full reload while the network fetch runs.
//   setSnap(key, val) — writes both tiers. localStorage write is best-effort (quota/private
//                   mode/SSR failures are swallowed — memory tier always works).
//   clearSnaps()  — wipe both tiers; call on sign-out so cached guest/billing data does
//                   not linger on the device after logout.
const _snap = new Map();
const PFX = 'lumea.snap.v2.'; // v2 2026-06-10: bust all pre-fresh-start snapshots on deploy
const MAX_BYTES = 900000; // per-key guard — keep well under the ~5MB localStorage quota

export function getSnap(key) { return _snap.has(key) ? _snap.get(key) : null; }

export function warmSnap(key) {
  if (_snap.has(key)) return _snap.get(key);
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(PFX + key);
    if (!raw) return null;
    const val = JSON.parse(raw);
    _snap.set(key, val); // promote to hot tier
    return val;
  } catch { return null; }
}

export function setSnap(key, val) {
  _snap.set(key, val);
  try {
    if (typeof window === 'undefined') return;
    const raw = JSON.stringify(val);
    if (raw.length <= MAX_BYTES) window.localStorage.setItem(PFX + key, raw);
  } catch { /* quota / private mode — hot tier still works */ }
}

export function clearSnaps() {
  _snap.clear();
  try {
    if (typeof window === 'undefined') return;
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('lumea.snap.'))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// Invalidate cached DATA after a write so every OTHER tab repaints from the network
// instead of flashing a stale snapshot (the "shows wrong balance then self-heals" bug).
// `exceptKey` = the tab that just wrote and will silently re-fetch itself; it's preserved
// so that tab doesn't flash a skeleton. Also fires `lumea:data-changed` for any mounted
// listener that wants to react immediately.
export function invalidateData(exceptKey) {
  for (const k of Array.from(_snap.keys())) if (k !== exceptKey) _snap.delete(k);
  try {
    if (typeof window === 'undefined') return;
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PFX) && k !== PFX + exceptKey)
      .forEach((k) => window.localStorage.removeItem(k));
    window.dispatchEvent(new CustomEvent('lumea:data-changed', { detail: { exceptKey } }));
  } catch { /* ignore */ }
}
