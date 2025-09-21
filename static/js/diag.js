// static/js/diag.js
(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function toast(msg, tone) {
    if (window.ui && typeof window.ui.toast === "function") return window.ui.toast(msg, tone);
    // enkel fallback
    console.log(tone ? `[${tone}] ${msg}` : msg);
  }
  function authHeaders() {
    // Hent evt. passord fra localStorage eller meta-tag (tilpass om du har en annen mekanisme)
    const pwd = localStorage.getItem("admin_password") || (qs('meta[name="admin-password"]')?.content || "");
    const h = {"Content-Type":"application/json"};
    if (pwd) h["X-Admin-Password"] = pwd;
    return h;
  }
  async function call(path, payload, method="POST") {
    const res = await fetch(path, {
      method,
      headers: authHeaders(),
      body: method === "GET" ? null : JSON.stringify(payload||{})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const err = data.error || data.stderr || `HTTP ${res.status}`;
      throw new Error(err);
    }
    return data;
  }
  function bindSysButtons() {
    const map = [
      { sel: "#btn_restart_app",   payload: { action: "restart", name: "app" } },
    { sel: "#btn_restart_kiosk", payload: { action: "restart", name: "kiosk" } },
    ];
    map.forEach(m => {
      const el = qs(m.sel);
      if (!el) return;
      el.addEventListener("click", async () => {
        el.disabled = true;
        try {
          const r = await call("/api/sys/service", m.payload, "POST");
          toast(`OK: ${m.payload.action} ${m.payload.name}`, "ok");
          if (r.stdout) console.debug(r.stdout);
          if (r.stderr) console.debug(r.stderr);
        } catch (e) {
          toast(`Feil: ${e.message}`, "err");
        } finally {
          el.disabled = false;
        }
      });
    });

    const reboot = qs("#btn_reboot");
    if (reboot) reboot.addEventListener("click", async () => {
      if (!confirm("Er du sikker på at du vil restarte RPi nå?")) return;
      reboot.disabled = true;
      try {
        await call("/api/sys/reboot", {}, "POST");
        toast("Maskinen restartes …", "warn");
      } catch (e) {
        toast(`Feil: ${e.message}`, "err");
      } finally {
        reboot.disabled = false;
      }
    });

    const shutdown = qs("#btn_shutdown");
    if (shutdown) shutdown.addEventListener("click", async () => {
      if (!confirm("Er du sikker på at du vil slå av RPi nå?")) return;
      shutdown.disabled = true;
      try {
        await call("/api/sys/shutdown", {}, "POST");
        toast("Maskinen slås av …", "warn");
      } catch (e) {
        toast(`Feil: ${e.message}`, "err");
      } finally {
        shutdown.disabled = false;
      }
    });
  }

  async function loadNtp() {
  const box = document.getElementById("ntp_status");
  if (!box) return;
  box.textContent = "Henter NTP-status …";
  try {
    const r = await fetch("/api/sys/ntp-status", { headers: { "Accept": "application/json" } });
    const js = await r.json();
    const n = (js && js.ntp) || {};

    function fmtHM(ageMs) {
      const totalMin = Math.floor(Math.abs(Number(ageMs) || 0) / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `${h}:${String(m).padStart(2, "0")}`;
    }

    // siste kontakt → ms
    let lastMs = null;
    if (n.LastContactMS) lastMs = Number(n.LastContactMS);
    else if (n.LastContactISO) {
      const d = Date.parse(n.LastContactISO);
      if (!Number.isNaN(d)) lastMs = d;
    } else if (n.LastSyncUSec) {
      const us = Number(n.LastSyncUSec);
      if (isFinite(us) && us > 0) lastMs = Math.floor(us / 1000);
    }

    const since = lastMs ? fmtHM(Date.now() - lastMs) : "ukjent";
    const server = [n.ServerName, n.ServerAddress].filter(Boolean).join(" ");

    box.innerHTML = `
      <div><strong>Synkronisert:</strong> ${n.NTPSynchronized ? "Ja" : "Nei"}</div>
      <div><strong>Server:</strong> ${server || "—"}</div>
      <div><strong>Sist kontakt:</strong> ${since}${n.LastContactISO ? ` <span class="muted">(${new Date(lastMs).toLocaleString()})</span>` : ""}</div>
      <div><strong>SystemClockSynchronized:</strong> ${n.SystemClockSynchronized ? "Ja" : "Nei"}</div>
    `;
  } catch (e) {
    box.innerHTML = `<span style="color:#c00">Feil: ${e.message}</span>`;
  }
}


  document.addEventListener("DOMContentLoaded", () => {
    bindSysButtons();
    loadNtp();
  });
})();
