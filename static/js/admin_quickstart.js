// static/js/admin_quickstart.js
// Hvorfor: injiserer hurtigknapper uten å endre eksisterende HTML.

(function () {
  const STYLE = `
  .aqs-card{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#fff;border:1px solid #ddd;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.12);padding:14px;min-width:260px;font:14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif}
  .aqs-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
  .aqs-btn{padding:8px 12px;border:1px solid #ccc;border-radius:10px;background:#f7f7f7;cursor:pointer}
  .aqs-btn:hover{background:#efefef}
  .aqs-btn.primary{background:#e6f2ff;border-color:#8ac2ff}
  .aqs-input{padding:8px;border:1px solid #ccc;border-radius:8px;width:90px}
  .aqs-title{font-weight:600;margin:0 0 4px 0}
  .aqs-toast{position:fixed;right:16px;bottom:86px;background:#222;color:#fff;border-radius:10px;padding:10px 14px;opacity:0;transition:opacity .18s;z-index:2147483001}
  .aqs-toast.show{opacity:1}
  .aqs-hide{display:none!important}
  `;

  function injectStyle() {
    if (document.getElementById("aqs-style")) return;
    const el = document.createElement("style");
    el.id = "aqs-style";
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  function toast(msg, ok) {
    let t = document.getElementById("aqs-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "aqs-toast";
      t.className = "aqs-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = ok ? "#184" : "#922";
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1500);
  }

  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    try {
      return await r.json();
    } catch {
      return {};
    }
  }

  async function startMinutes(min) {
    const m = Math.max(1, Math.floor(Number(min)));
    await postJSON("/api/start", { minutes: m });
    toast("Startet +" + m + " min", true);
  }

  function buildPanel() {
    const host =
      document.querySelector("[data-admin-quickstart]") ||
      document.getElementById("admin-quickstart");

    // Prioriter brukers container hvis funnet; ellers flytende kort
    const panel = document.createElement("div");
    panel.className = host ? "" : "aqs-card";
    panel.innerHTML = `
      <div class="aqs-title">Start nedtelling</div>
      <div class="aqs-row">
        <button class="aqs-btn primary" data-min="5">+5 min</button>
        <button class="aqs-btn primary" data-min="10">+10 min</button>
        <button class="aqs-btn primary" data-min="15">+15 min</button>
        <button class="aqs-btn primary" data-min="30">+30 min</button>
      </div>
      <div class="aqs-row">
        <input class="aqs-input" id="aqs-custom" type="number" min="1" step="1" value="20" />
        <button class="aqs-btn" id="aqs-start">Start nå</button>
      </div>
    `;

    (host || document.body).appendChild(panel);

    panel.querySelectorAll("button[data-min]").forEach((btn) => {
      btn.addEventListener("click", () =>
        startMinutes(btn.getAttribute("data-min")).catch((e) =>
          toast(e.message || String(e), false),
        ),
      );
    });
    panel.querySelector("#aqs-start").addEventListener("click", () => {
      const v = panel.querySelector("#aqs-custom").value;
      startMinutes(v).catch((e) => toast(e.message || String(e), false));
    });
  }

  function init() {
    injectStyle();
    buildPanel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
