// static/js/admin/error-guard.js
(function () {
  function ensureBanner() {
    let b = document.getElementById("admin-error-banner");
    if (b) return b;
    b = document.createElement("div");
    b.id = "admin-error-banner";
    b.style.position = "fixed";
    b.style.left = "0";
    b.style.right = "0";
    b.style.top = "0";
    b.style.zIndex = "99999";
    b.style.padding = "8px 12px";
    b.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    b.style.fontSize = "14px";
    b.style.display = "none";
    b.style.background = "#7f1d1d";
    b.style.color = "#fff";
    b.style.boxShadow = "0 2px 6px rgba(0,0,0,.25)";
    document.documentElement.appendChild(b);
    return b;
  }
  function showBanner(msg) {
    const b = ensureBanner();
    b.textContent = String(msg || "Ukjent feil");
    b.style.display = "block";
  }
  function firstStackLine(err) {
    const s = (err && err.stack) || "";
    const lines = String(s)
      .split("\n")
      .map((l) => l.trim());
    // Finn første linje som peker til en .js-fil med posisjon
    const cand = lines.find((l) => l.includes(".js:"));
    return cand || lines[0] || "";
  }
  window.addEventListener("error", (ev) => {
    const loc = firstStackLine(ev.error);
    showBanner(`Feil i admin (error): ${ev.message} ${loc ? " @ " + loc : ""}`);
    console.error("[admin:error]", ev.error || ev.message, ev);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const msg = ev?.reason?.message || String(ev.reason || "Ukjent");
    const loc = firstStackLine(ev?.reason);
    showBanner(`Feil i admin (promise): ${msg} ${loc ? " @ " + loc : ""}`);
    console.error("[admin:unhandledrejection]", ev.reason || ev);
  });
  const origFetch = window.fetch;
  window.fetch = async function guardedFetch(input, init) {
    try {
      const res = await origFetch(input, init);
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.includes("/api/config") && !res.ok) {
        const text = await res.text().catch(() => "");
        showBanner(`Klarte ikke å laste config: ${res.status} ${res.statusText}`);
        console.error("[admin:config-fetch-fail]", res.status, res.statusText, text);
      }
      return res;
    } catch (e) {
      const url = typeof input === "string" ? input : input?.url || "";
      if (String(url).includes("/api/config")) {
        showBanner(`Nettverksfeil ved henting av config`);
      }
      console.error("[admin:fetch-error]", e);
      throw e;
    }
  };
})();
