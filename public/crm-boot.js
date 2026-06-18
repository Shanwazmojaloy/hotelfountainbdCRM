/* crm-boot.js — boot scripts externalized from crm.html so /crm.html can run under a strict
   CSP (script-src 'self', no 'unsafe-inline'/'unsafe-eval'). Loaded after crm-bundle.js.
   In order: service-worker registration, client-error reporter, PWA install button, mobile
   nav drawer. Behaviour is identical to the former inline blocks. */

/* service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}

/* Lightweight client-error reporter -> /api/client-error -> audit_logs (no third party).
   Best-effort: deduped, capped, never throws, never blocks the page. */
(function () {
  var sent = {}, count = 0, MAX = 12;
  function report(kind, message, source, stack) {
    try {
      if (count >= MAX) return;
      var key = kind + '|' + (message || '') + '|' + (source || '');
      if (sent[key]) return; sent[key] = 1; count++;
      var body = JSON.stringify({
        kind: kind, message: String(message || '').slice(0, 4000),
        stack: stack ? String(stack).slice(0, 4000) : null,
        source: source ? String(source).slice(0, 512) : null,
        url: location.href, appVersion: (window.__CRM_VERSION__ || null),
        ts_client: new Date().toISOString()
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (_) { /* telemetry must never break the app */ }
  }
  window.addEventListener('error', function (e) {
    report('error', e && e.message, (e && e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : null), e && e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    report('unhandledrejection', (r && r.message) || r, null, r && r.stack);
  });
})();

/* PWA install button (Android/Chrome only; iOS uses Share > Add to Home Screen) */
(function () {
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    var b = document.createElement('button');
    b.textContent = 'Install Lumea App';
    b.setAttribute('aria-label', 'Install Lumea as an app');
    b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;padding:12px 20px;background:#C8A96E;color:#1C1510;border:none;border-radius:10px;font:600 12px/1 "DM Sans",system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 8px 28px rgba(0,0,0,.45);cursor:pointer';
    b.onclick = function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; b.remove(); }); };
    document.body.appendChild(b);
  });
  window.addEventListener('appinstalled', function () { deferred = null; });
})();

/* Mobile nav drawer: burger shows ONLY when the app sidebar exists AND screen is narrow */
(function () {
  var burger, scrim;
  function ensure() {
    if (burger) return;
    scrim = document.createElement('div'); scrim.className = 'lm-scrim';
    burger = document.createElement('button'); burger.id = 'lmBurger';
    burger.setAttribute('aria-label', 'Menu'); burger.innerHTML = '☰';
    burger.style.cssText = 'position:fixed;top:8px;left:10px;z-index:1300;width:36px;height:36px;border:1px solid rgba(200,169,110,.32);background:rgba(20,17,13,.92);color:#C8A96E;font-size:18px;line-height:1;border-radius:7px;cursor:pointer;padding:0;box-shadow:0 4px 14px rgba(0,0,0,.4);display:none;align-items:center;justify-content:center';
    document.body.appendChild(scrim); document.body.appendChild(burger);
    burger.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    scrim.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('.nav-item'); if (t) document.body.classList.remove('nav-open'); });
  }
  function update() {
    ensure();
    var show = !!document.querySelector('.sidebar') && window.innerWidth <= 768;
    burger.style.display = show ? 'flex' : 'none';
    if (!show) document.body.classList.remove('nav-open');
  }
  function start() {
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    var root = document.getElementById('root');
    if (root && window.MutationObserver) { new MutationObserver(update).observe(root, { childList: true, subtree: true }); }
    else { setInterval(update, 1200); }
  }
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start);
})();
