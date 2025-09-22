// static/js/diag.js
// Robust: NTP-detaljer (støtter både #ntp_details<pre> og #ntp_status<div>)
// + host/uptime som pill i Topbar ved siden av app/kiosk/ntp.

(function () {
  "use strict";

  const qs = (s, r) => (r || document).querySelector(s);

  function authHeaders() {
    const pwd = localStorage.getItem("admin_password") || qs('meta[name="admin-password"]')?.content || "";
    const h = { "Content-Type": "application/json" };
    if (pwd) h["X-Admin-Password"] = pwd;
    return h;
  }

  async function call(path, payload, method = "POST") {
    const res = await fetch(path, {
      method,
      headers: authHeaders(),
      body: method === "GET" ? null : JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || data.stderr || `HTTP ${res.status}`);
    return data;
  }

  // ---------- Host + uptime pill ----------
  const HOST_PILL_ID = "host-pill";
  const TOPBAR_SVCS_SEL = "#topbar .tb-svcs";

  function fmtUptime(sec) {
    sec = Math.max(0, Math.floor(Number(sec || 0)));
    const d = Math.floor(sec / 86400);
    sec %= 86400;
    const h = Math.floor(sec / 3600);
    sec %= 3600;
    const m = Math.floor(sec / 60);
    const pad = (n) => String(n).padStart(2, "0");
    return d > 0 ? `${d}d ${h}:${pad(m)}` : `${h}:${pad(m)}`;
  }

  async function readUptimeSeconds() {
    try {
      const r1 = await fetch("/api/sys/about-status", { headers: { Accept: "application/json", ...authHeaders() } });
      const j1 = await r1.json();
      const a = j1?.about || j1 || {};
      const up = a.uptime_sec ?? a.uptime_secs ?? a.uptime_seconds ?? a.uptime;
      if (up != null) return Number(up);
    } catch {}
    try {
      const r2 = await fetch("/debug/whoami", { headers: { Accept: "application/json" } });
      const j2 = await r2.json();
      const up = j2?.uptime_sec ?? j2?.uptime_secs ?? j2?.uptime_seconds ?? j2?.uptime;
      if (up != null) return Number(up);
    } catch {}
    return null;
  }

  async function ensureHostPill() {
    const container = qs(TOPBAR_SVCS_SEL);
    if (!container) return false;

    let pill = document.getElementById(HOST_PILL_ID);
    if (!pill) {
      pill = document.createElement("span");
      pill.id = HOST_PILL_ID;
      pill.className = "sys-pill muted";
      container.appendChild(pill);
    }

    const host = location.hostname || "localhost";
    const upSec = await readUptimeSeconds();
    pill.textContent = host + (Number.isFinite(upSec) ? ` • ${fmtUptime(upSec)}` : "");
    pill.title = location.href;
    return true;
  }

  function startHostPillRefresh() {
    let tries = 0;
    const attach = async () => {
      const ok = await ensureHostPill();
      if (ok || tries > 30) return;     // ~15s maks
      tries++;
      setTimeout(attach, 500);
    };
    attach();
    setInterval(() => ensureHostPill().catch(() => {}), 60_000);
  }

  // ---------- NTP-detaljer ----------
  // Støtt begge: <pre id="ntp_details"> (tekst) eller <div id="ntp_status"> (HTML)
  function getNtpTarget() {
    return qs("#ntp_details") || qs("#ntp_status");
  }

  function writeNtp(target, linesOrHtml) {
    if (!target) return;
    const isPre = target.tagName === "PRE";
    if (isPre) {
      // forventer en array med tekstlinjer
      target.textContent = Array.isArray(linesOrHtml) ? linesOrHtml.join("\n") : String(linesOrHtml || "");
    } else {
      // HTML container
      if (Array.isArray(linesOrHtml)) {
        target.innerHTML = linesOrHtml
          .map((l) => {
            const [k, v] = String(l).split(/:\s(.+)?/); // grovt
            return `<div><strong>${k.replace(/:$/, "")}:</strong> ${v ?? ""}</div>`;
          })
          .join("");
      } else {
        target.innerHTML = String(linesOrHtml || "");
      }
    }
  }

  async function loadNtpCard() {
    const tgt = getNtpTarget();
    if (!tgt) return;
    writeNtp(tgt, "Henter NTP-status …");
    try {
      const r = await fetch("/api/sys/ntp-status", { headers: { Accept: "application/json" } });
      const js = await r.json();
      const n = (js && js.ntp) || {};

      function fmtHM(ageMs) {
        const totalMin = Math.floor(Math.abs(Number(ageMs) || 0) / 60000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return `${h}:${String(m).padStart(2, "0")}`;
      }

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

      const lines = [
        `Synkronisert: ${n.NTPSynchronized ? "Ja" : "Nei"}`,
        `Server: ${server || "—"}`,
        `Sist kontakt: ${since}${n.LastContactISO ? ` (${new Date(lastMs).toLocaleString()})` : ""}`,
        `SystemClockSynchronized: ${n.SystemClockSynchronized ? "Ja" : "Nei"}`,
      ];
      writeNtp(tgt, lines);
    } catch (e) {
      writeNtp(tgt, `Feil: ${e.message}`);
    }
  }

  // ---------- Systemknapper (valgfritt, hvis de finnes) ----------
  function bindSysButtons() {
    const map = [
      { sel: "#btn_restart_app", payload: { action: "restart", name: "app" } },
      { sel: "#btn_restart_kiosk", payload: { action: "restart", name: "kiosk" } },
    ];
    map.forEach((m) => {
      const el = qs(m.sel);
      if (!el) return;
      el.addEventListener("click", async () => {
        el.disabled = true;
        try {
          await call("/api/sys/service", m.payload, "POST");
          (window.ui?.toast || (() => {}))(`OK: ${m.payload.action} ${m.payload.name}`, "ok");
        } catch (e) {
          (window.ui?.toast || console.error)(`Feil: ${e.message}`, "err");
        } finally {
          el.disabled = false;
        }
      });
    });

    const reboot = qs("#btn_reboot");
    if (reboot)
      reboot.addEventListener("click", async () => {
        if (!confirm("Er du sikker på at du vil restarte RPi nå?")) return;
        reboot.disabled = true;
        try {
          await call("/api/sys/reboot", {}, "POST");
          (window.ui?.toast || (() => {}))("Maskinen restartes …", "warn");
        } catch (e) {
          (window.ui?.toast || console.error)(`Feil: ${e.message}`, "err");
        } finally {
          reboot.disabled = false;
        }
      });

    const shutdown = qs("#btn_shutdown");
    if (shutdown)
      shutdown.addEventListener("click", async () => {
        if (!confirm("Er du sikker på at du vil slå av RPi nå?")) return;
        shutdown.disabled = true;
        try {
          await call("/api/sys/shutdown", {}, "POST");
          (window.ui?.toast || (() => {}))("Maskinen slås av …", "warn");
        } catch (e) {
          (window.ui?.toast || console.error)(`Feil: ${e.message}`, "err");
        } finally {
          shutdown.disabled = false;
        }
      });
  }

  // ---------- Init ----------
  function init() {
    bindSysButtons();
    loadNtpCard();
    startHostPillRefresh();
    setInterval(loadNtpCard, 60_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
