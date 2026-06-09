// Lumea — in-memory snapshot cache (module-scoped, survives client route changes).
// Lets data screens render their LAST result instantly on re-mount while a fresh fetch runs
// in the background — so switching back to a tab shows content immediately, never a blank/Loading.
const _snap = new Map();
export function getSnap(key) { return _snap.has(key) ? _snap.get(key) : null; }
export function setSnap(key, val) { _snap.set(key, val); }
