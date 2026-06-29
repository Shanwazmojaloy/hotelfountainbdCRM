(function () {
var API = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return ""; } })();
var NAME = "Hotel Fountain BD";
var GREETING = "Hi! 👋 I'm the Hotel Fountain assistant. Ask me about rooms, rates, availability, or bookings — in English or Bangla.";
var history = [];
// Brand-matched (Hotel Fountain dark + gold). Bubble sits ABOVE the gold "Book Now"
// FAB (which is fixed bottom:20px right:20px, z-50) so the two never overlap.
var css = ""
+ "#hf-btn{position:fixed;bottom:80px;right:20px;width:56px;height:56px;border-radius:50%;background:#0d1117;color:#c8a96e;border:1px solid rgba(200,169,110,.55);cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.45);z-index:999999;transition:transform .25s cubic-bezier(.4,0,.2,1),box-shadow .25s cubic-bezier(.4,0,.2,1)}"
+ "#hf-btn:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 22px rgba(200,169,110,.35)}"
+ "#hf-btn svg{width:26px;height:26px;display:block}"
+ "#hf-win{position:fixed;bottom:148px;right:20px;width:372px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 184px);background:#0f141b;border:1px solid rgba(200,169,110,.28);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.55);display:none;flex-direction:column;overflow:hidden;z-index:999999;font-family:'DM Sans',system-ui,'Segoe UI',Roboto,sans-serif}"
+ "#hf-hd{background:linear-gradient(120deg,#c8a96e,#e4cfa0);color:#1a1407;padding:14px 16px;font-weight:600;letter-spacing:.02em;display:flex;justify-content:space-between;align-items:center}"
+ "#hf-hd span{cursor:pointer;font-size:22px;line-height:1;opacity:.75}"
+ "#hf-hd span:hover{opacity:1}"
+ "#hf-msgs{flex:1;overflow-y:auto;padding:14px;background:#0b0f14}"
+ "#hf-msgs::-webkit-scrollbar{width:8px}"
+ "#hf-msgs::-webkit-scrollbar-thumb{background:rgba(200,169,110,.35);border-radius:4px}"
+ ".hf-m{margin:6px 0;padding:10px 13px;border-radius:13px;max-width:84%;white-space:pre-wrap;line-height:1.45;font-size:14px}"
+ ".hf-u{background:linear-gradient(120deg,#c8a96e,#e4cfa0);color:#1a1407;margin-left:auto;border-bottom-right-radius:4px;font-weight:500}"
+ ".hf-a{background:#161d26;color:#ece6da;border:1px solid rgba(200,169,110,.18);border-bottom-left-radius:4px}"
+ "#hf-in{display:flex;border-top:1px solid rgba(200,169,110,.2);background:#0f141b}"
+ "#hf-in input{flex:1;border:none;padding:13px;font-size:14px;outline:none;background:transparent;color:#ece6da}"
+ "#hf-in input::placeholder{color:#7c7768}"
+ "#hf-in button{border:none;background:linear-gradient(120deg,#c8a96e,#e4cfa0);color:#1a1407;padding:0 18px;cursor:pointer;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}"
+ ".hf-typing{color:#9c8f73;font-style:italic}";
var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.6-.8L3 21l1.3-3.9A8.38 8.38 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5Z"/></svg>';
var btn = document.createElement("button"); btn.id = "hf-btn"; btn.setAttribute("aria-label", "Chat with us"); btn.innerHTML = ICON; document.body.appendChild(btn);
var win = document.createElement("div"); win.id = "hf-win";
win.innerHTML = '<div id="hf-hd">' + NAME + '<span id="hf-cl">×</span></div>'
+ '<div id="hf-msgs"></div>'
+ '<div id="hf-in"><input id="hf-tx" placeholder="Type your message..." autocomplete="off"><button id="hf-sn">Send</button></div>';
document.body.appendChild(win);
var msgs = win.querySelector("#hf-msgs"), tx = win.querySelector("#hf-tx"), sn = win.querySelector("#hf-sn");
var greeted = false;
function add(text, who) {
var d = document.createElement("div");
d.className = "hf-m " + (who === "user" ? "hf-u" : "hf-a");
d.textContent = text; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
}
function openWin() { win.style.display = "flex"; if (!greeted) { add(GREETING, "a"); greeted = true; } tx.focus(); }
function closeWin() { win.style.display = "none"; }
btn.onclick = function () { win.style.display === "flex" ? closeWin() : openWin(); };
win.querySelector("#hf-cl").onclick = closeWin;
function send() {
var t = tx.value.trim(); if (!t) return; tx.value = "";
add(t, "user"); history.push({ role: "user", content: t });
var typing = add("…", "a"); typing.classList.add("hf-typing");
fetch(API + "/chat", {
method: "POST", headers: { "Content-Type": "application/json" },
body: JSON.stringify({ message: t, history: history.slice(-12) })
}).then(function (r) { return r.json(); })
.then(function (d) {
typing.remove();
var a = d.reply || "Sorry, please contact us directly.";
add(a, "a"); history.push({ role: "assistant", content: a });
}).catch(function () {
typing.remove();
add("Sorry, I'm having trouble connecting. Please call +880 1322-840799.", "a");
});
}
sn.onclick = send;
tx.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); send(); } });
})();
