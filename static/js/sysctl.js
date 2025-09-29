// static/js/sysctl.js
// Knapper med data-sysctl + data-action kaller /api/system (med admin-passord hvis satt)
(() => {
  "use strict";

  function readPassword() {
    // Match admin.html: id="admin_password" (underscore)
    const inp = document.getElementById("admin_password");
    return (inp && inp.value) || localStorage.getItem("admin_password") || "";
  }

  async function sysctl(action) {
    const headers = { "Content-Type": "application/json" };
    const pw = readPassword();
    if (pw) headers["X-Admin-Password"] = pw;

    const r = await fetch("/api/system", {
      method: "POST",
      headers,
      body: JSON.stringify({ action }),
      credentials: "same-origin",
    });
    const js = await r.json().catch(() => ({}));
    if (!r.ok || js.ok === false) {
      const msg = js.error || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return js;
  }

  function bindButtons() {
    document.querySelectorAll("[data-sysctl]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const action = btn.dataset.action || "";
        if (!action) return;

        if (action === "reboot" || action === "shutdown") {
          const ok = confirm(
            action === "reboot" ? "Bekreft omstart av Raspberry Pi?" : "Bekreft nedstenging av Raspberry Pi?",
          );
          if (!ok) return;
        }

        btn.disabled = true;
        btn.dataset.loading = "1";
        try {
          const res = await sysctl(action);
          console.log("sysctl:", action, res);
          alert(`OK (${action})${res.stdout ? `\n${res.stdout}` : ""}`);
        } catch (e) {
          alert(`Feil (${action}): ${e && e.message ? e.message : String(e)}`);
        } finally {
          btn.disabled = false;
          delete btn.dataset.loading;
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindButtons, { once: true });
  } else {
    bindButtons();
  }

  // Eksponer om man vil bruke fra annet UI
  window.sysctl = sysctl;
})();
