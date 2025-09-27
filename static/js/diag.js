// static/js/diag.js
// Host/uptime pill, NTP-detaljer, systemknapper + (integrert) live-tick/selftest/dump widgets.
(function () {
  "use strict";
  const qs = (s, r) => (r || document).querySelector(s);

  // --- Toast helper (fallback hvis ui.js ikke er lastet) ---
  function ensureLocalToastEl() {
    let el = document.getElementById("_toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "_toast";
      el.className = "toast";
      Object.assign(el.style, {
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "20px",
        padding: "8px 12px",
        background: "rgba(0,0,0,.75)",
        color: "#fff",
        borderRadius: "10px",
        font: "14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial",
        zIndex: "9999",
        transition: "opacity .25s ease",
        opacity: "0",
        border: "1px solid rgba(255,255,255,.4)",
        pointerEvents: "none",
      });
      document.body.appendChild(el);
    }
    return el;
  }
  function toast(msg, tone) {
    // Bruk ui.js hvis tilgjengelig
    if (window.ui && typeof window.ui.toast === "function") {
      window.ui.toast(msg, tone);
      return;
    }
    // Fallback: enkel inline-toast
    const el = ensureLocalToastEl();
    el.textContent = String(msg ?? "");
    el.style.border =
      "1px solid " + (tone === "bad" || tone === "error" ? "rgba(255,80,80,.6)" : "rgba(255,255,255,.4)");
    el.style.opacity = "1";
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => (el.style.opacity = "0"), 1600);
  }

  function authHeaders() {
    const pwd = localStorage.getItem("admin_password") || qs('meta[name="admin-password"]')?.content || "";
    const h = { "Content-Type": "application/json", Accept: "application/json" };
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
      const a = (await r1.json())?.about || {};
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
      if (ok || tries > 30) return;
      tries++;
      setTimeout(attach, 500);
    };
    attach();
    setInterval(() => ensureHostPill().catch(() => {}), 60_000);
  }

  // ---------- NTP-detaljer ----------
  function getNtpTarget() {
    return qs("#ntp_details") || qs("#ntp_status");
  }
  function writeNtp(target, linesOrHtml) {
    if (!target) return;
    const isPre = target.tagName === "PRE";
    if (isPre) target.textContent = Array.isArray(linesOrHtml) ? linesOrHtml.join("\n") : String(linesOrHtml || "");
    else {
      if (Array.isArray(linesOrHtml)) {
        target.innerHTML = linesOrHtml
          .map((l) => {
            const [k, v] = String(l).split(/:\s(.+)?/);
            return `<div><strong>${k.replace(/:$/, "")}:</strong> ${v ?? ""}</div>`;
          })
          .join("");
      } else target.innerHTML = String(linesOrHtml || "");
    }
  }
  async function loadNtpCard() {
    const tgt = getNtpTarget();
    if (!tgt) return;
    writeNtp(tgt, "Henter NTP-status …");
    try {
      const r = await fetch("/api/sys/ntp-status", { headers: { Accept: "application/json" } });
      const js = await r.json();
      const n = js?.ntp || {};

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
      toast("Kunne ikke hente NTP-status", "err");
    }
  }

  // ---------- Systemknapper ----------
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
          toast(`OK: ${m.payload.action} ${m.payload.name}`, "ok");
        } catch (e) {
          toast(`Feil: ${e.message}`, "err");
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
          toast("Maskinen restartes …", "warn");
        } catch (e) {
          toast(`Feil: ${e.message}`, "err");
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
          toast("Maskinen slås av …", "warn");
        } catch (e) {
          toast(`Feil: ${e.message}`, "err");
        } finally {
          shutdown.disabled = false;
        }
      });
  }

  // ---------- Live (fra diag_live.js) ----------
  const fmtBoth = (ms) => {
    const sgn = ms < 0 ? "-" : "";
    ms = Math.abs(ms);
    let s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    s %= 3600;
    const m = Math.floor(s / 60);
    s %= 60;
    const pad = (n) => String(n).padStart(2, "0");
    return { mmss: `${sgn}${Math.floor(h * 60 + m)}:${pad(s)}`, hms: `${sgn}${h}:${pad(m)}:${pad(s)}` };
  };

  async function pollLive() {
    const t0 = performance.now();
    const r = await fetch("/tick", { cache: "no-store" });
    const t = await r.json();
    const dt = performance.now() - t0;
    const both = fmtBoth(t.signed_display_ms);
    qs("#countdown") && (qs("#countdown").textContent = both.mmss);
    qs("#phase") && (qs("#phase").textContent = `fase: ${t.mode} · state: ${t.state}`);
    qs("#meta") &&
      (qs("#meta").textContent =
        `mål: ${t.target_hhmm || t.target_ms} · nå: ${new Date(t.now_ms).toLocaleTimeString()}`);
    qs("#both") && (qs("#both").textContent = `format: ${both.hms} / ${both.mmss}`);
    qs("#lat") && (qs("#lat").textContent = `latency: ${dt.toFixed(0)} ms`);
    qs("#live") && (qs("#live").textContent = JSON.stringify(t, null, 2));
  }

  async function runSelftest() {
    const r = await fetch("/debug/selftest", { cache: "no-store" });
    const js = await r.json();
    const ul = qs("#selftest");
    if (!ul) return;
    ul.innerHTML = "";
    (js.tests || []).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = `${t.ok ? "✔" : "✖"} ${t.name}${t.info ? " — " + t.info : ""}`;
      li.className = t.ok ? "ok" : "fail";
      ul.appendChild(li);
    });
    // Toast-oppsummering
    const okCount = (js.tests || []).filter((t) => t.ok).length;
    const total = (js.tests || []).length;
    toast(`Selvtest: ${okCount}/${total} OK`, okCount === total ? "ok" : "warn");
  }

  async function dump(url) {
    const r = await fetch(url, { cache: "no-store" });
    const js = await r.json();
    const pre = qs("#raw");
    if (pre) pre.textContent = JSON.stringify(js, null, 2);
    toast("Dump oppdatert", "ok");
  }

  // ---------- Init ----------
  function init() {
    bindSysButtons();
    loadNtpCard();
    startHostPillRefresh();
    setInterval(loadNtpCard, 60_000);

    // Live widgets: bind bare hvis de finnes
    qs("#refresh") && qs("#refresh").addEventListener("click", () => pollLive().catch(console.error));
    qs("#run_selftest") && qs("#run_selftest").addEventListener("click", () => runSelftest().catch(console.error));
    document
      .querySelectorAll("[data-dump]")
      .forEach((btn) => btn.addEventListener("click", () => dump(btn.dataset.dump).catch(console.error)));
    pollLive().catch(console.error);
    setInterval(pollLive, 1000);

    // Eksponer for Topbar
    window.__runSelftest = runSelftest;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
