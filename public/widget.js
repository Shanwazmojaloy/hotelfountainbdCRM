(function () {
var API = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return ""; } })();
var NAME = "Hotel Fountain BD";
var GREETING = "Hi! 👋 I'm the Hotel Fountain assistant. Ask me about rooms, rates, availability, or bookings — in English or Bangla.";
var history = [];
var css = ""
+ "#hf-btn{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:#0a6cff;color:#fff;border:none;cursor:pointer;font-size:26px;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:999999}"
+ "#hf-win{position:fixed;bottom:90px;right:20px;width:370px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;z-index:999999;font-family:system-ui,'Segoe UI',Roboto,sans-serif}"
+ "#hf-hd{background:#0a6cff;color:#fff;padding:14px 16px;font-weight:600;display:flex;justify-content:space-between;align-items:center}"
+ "#hf-hd span{cursor:pointer;font-size:22px;line-height:1}"
+ "#hf-msgs{flex:1;overflow-y:auto;padding:14px;background:#f5f7fb}"
+ ".hf-m{margin:6px 0;padding:9px 12px;border-radius:12px;max-width:82%;white-space:pre-wrap;line-height:1.4;font-size:14px}"
+ ".hf-u{background:#0a6cff;color:#fff;margin-left:auto;border-bottom-right-radius:3px}"
+ ".hf-a{background:#fff;color:#111;border:1px solid #e4e8f0;border-bottom-left-radius:3px}"
+ "#hf-in{display:flex;border-top:1px solid #e4e8f0;background:#fff}"
+ "#hf-in input{flex:1;border:none;padding:13px;font-size:14px;outline:none}"
+ "#hf-in button{border:none;background:#0a6cff;color:#fff;padding:0 18px;cursor:pointer;font-size:14px}"
+ ".hf-typing{color:#888;font-style:italic}";
var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
var btn = document.createElement("button"); btn.id = "hf-btn"; btn.innerHTML = "💬"; document.body.appendChild(btn);
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
