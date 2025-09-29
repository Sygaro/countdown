// static/js/topbar.js
// Gjenbrukbar sticky topbar: klokke, countdown, service-lys, kontrollknapper (+ selvtest).
// Bruk: Topbar.init({ el: "#topbar", title: "Diagnose" })

export const Topbar = (() => {
  const qs = (s, r) => (r || document).querySelector(s);

  // terskler (timer)
  const NTP_THRESHOLDS_HOURS = { green: 6, yellow: 24 };

  function authHeaders() {
    const pwd = localStorage.getItem("admin_password") || qs('meta[name="admin-password"]')?.content || "";
    const h = { Accept: "application/json" };
    if (pwd) h["X-Admin-Password"] = pwd;
    return h;
  }
  const pad = (n) => String(n).padStart(2, "0");
  const fmtClock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  function fmtMMSS(ms) {
    const neg = ms < 0,
      abs = Math.abs(ms);
    const s = Math.floor(abs / 1000),
      mm = Math.floor(s / 60),
      ss = s % 60;
    return (neg ? "−" : "") + `${mm}:${pad(ss)}`;
  }
  function setDot(root, selector, tone) {
    const dot = qs(selector, root);
    if (dot) dot.className = "dot " + (tone || "warn");
  }

  function fmtHM(durationMs) {
    const totalMin = Math.floor(Math.abs(durationMs) / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  function ntpStateFrom(about) {
    const ntp = about?.ntp || {};
    // bruk LastContact først
    let t_ms = Number(ntp.LastContactMS || 0) || null;
    if (!t_ms && ntp.LastContactISO) {
      const d = Date.parse(ntp.LastContactISO);
      if (!Number.isNaN(d)) t_ms = d;
    }
    // fallbacks (som før)
    if (!t_ms && ntp.LastSyncUSec) {
      const us = Number(ntp.LastSyncUSec);
      if (isFinite(us) && us > 0) t_ms = Math.floor(us / 1000);
    }
    if (!t_ms && ntp.LastSyncISO) {
      const d = Date.parse(ntp.LastSyncISO);
      if (!Number.isNaN(d)) t_ms = d;
    }

    const synced = !!(ntp.NTPSynchronized || ntp.SystemClockSynchronized);
    if (!t_ms && !synced) return { tone: "bad", label: "ntp — ikke synk" };
    if (!t_ms) return { tone: "warn", label: "ntp — ukjent" };

    const ageMs = Date.now() - t_ms;
    const ageHours = ageMs / 3_600_000;

    // terskler
    let tone = "ok";
if (ageHours > NTP_THRESHOLDS_HOURS.yellow) tone = "bad";
else if (ageHours > NTP_THRESHOLDS_HOURS.green) tone = "warn";


    const server = [ntp.ServerName, ntp.ServerAddress].filter(Boolean).join(" ");
    const label = `ntp ${fmtHM(ageMs)}`; // <— H:MM
    const title = `${server || "ntp"} · ${fmtHM(ageMs)} siden (kilde: ${ntp.LastContactSource || "ukjent"})`;
    return { tone, label, title };
  }

  async function call(path, body, method = "POST") {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: method === "GET" ? null : JSON.stringify(body || {}),
    });
    const js = await res.json().catch(() => ({}));
    if (!res.ok || js.ok === false) throw new Error(js.error || js.stderr || `HTTP ${res.status}`);
    return js;
  }

  function renderCompact(root) {
    root.className = "topbar compact";
    root.innerHTML = `
      <div class="tb-meta">
        <div class="tb-left">
          <div class="tb-clock" id="tb_clock">--:--:--</div>
          <div class="tb-cd">⏱ <span id="tb_cd">--:--</span></div>
        </div>
        <div class="tb-svcs">
          <span class="tb-svc" data-svc="app"><i class="dot warn"></i> app</span>
          <span class="tb-svc" data-svc="kiosk"><i class="dot warn"></i> kiosk</span>
          <span class="tb-svc" data-svc="ntp" title="ntp"><i class="dot warn"></i> <span class="ntp-label">ntp --</span></span>
        </div>
      </div>
      <div class="tb-actions">
        <button id="tb_restart_app">Restart app</button>
        <button id="tb_restart_kiosk">Restart kiosk</button>
        <button id="tb_selftest">Kjør selvtest</button>
        <button id="tb_reboot" class="danger">Reboot RPi</button>
        <button id="tb_shutdown" class="danger">Shutdown RPi</button>
      </div>
    `;
  }

  function init(opts) {
    const root = typeof opts.el === "string" ? qs(opts.el) : opts.el;
    if (!root) throw new Error("Topbar.init: missing el");
    renderCompact(root);

    const updateClock = () => {
      qs("#tb_clock", root).textContent = fmtClock(new Date());
    };
    updateClock();
    setInterval(updateClock, 1000);

    async function pollTick() {
      try {
        const r = await fetch("/tick", { cache: "no-store" });
        const t = await r.json();
        qs("#tb_cd", root).textContent = fmtMMSS(t.signed_display_ms);
      } catch {}
    }
    pollTick();
    setInterval(pollTick, 1000);

    async function pollSvcs() {
      try {
        const r = await fetch("/api/sys/about-status", { headers: authHeaders() });
        const js = await r.json();
        if (!r.ok || js.ok === false) throw new Error(js.error || r.status);
        const a = js.about || {};
        const s = a.services || {};
        setDot(root, '.tb-svc[data-svc="app"] .dot', s.app?.active ? "ok" : "bad");
        setDot(root, '.tb-svc[data-svc="kiosk"] .dot', s.kiosk?.active ? "ok" : "bad");
        const ntp = ntpStateFrom(a);
        setDot(root, '.tb-svc[data-svc="ntp"] .dot', ntp.tone);
        const wrap = qs('.tb-svc[data-svc="ntp"]', root);
        if (wrap) {
          const lab = qs(".ntp-label", wrap);
          if (lab) lab.textContent = ntp.label;
          wrap.title = ntp.title || ntp.label;
        }
      } catch {
        setDot(root, '.tb-svc[data-svc="app"] .dot', "warn");
        setDot(root, '.tb-svc[data-svc="kiosk"] .dot', "warn");
        setDot(root, '.tb-svc[data-svc="ntp"] .dot', "warn");
        const wrap = qs('.tb-svc[data-svc="ntp"]', root);
        if (wrap) qs(".ntp-label", wrap).textContent = "ntp --";
      }
    }
    pollSvcs();
    setInterval(pollSvcs, 10000);

    function bind(btn, fn) {
      const b = qs(btn, root);
      if (!b) return;
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await fn();
        } catch (e) {
          console.error(e);
          alert("Feil: " + e.message);
        } finally {
          b.disabled = false;
        }
      });
    }
    bind("#tb_restart_app", () => call("/api/sys/service", { action: "restart", name: "app" }));
    bind("#tb_restart_kiosk", () => call("/api/sys/service", { action: "restart", name: "kiosk" }));
    bind("#tb_reboot", () => confirm("Er du sikker på at du vil restarte RPi nå?") && call("/api/sys/reboot", {}));

    // Ekstra sikker shutdown: confirm + skriv JA
    bind("#tb_shutdown", async () => {
      if (!confirm("Advarsel: Du er i ferd med å slå av RPi. Fortsette?")) return;
      const typed = prompt('Skriv "JA" for å bekrefte nedstenging (case-insensitive).');
      if (!typed || typed.trim().toLowerCase() !== "ja") {
        alert("Shutdown avbrutt.");
        return;
      }
      await call("/api/sys/shutdown", {});
    });

    bind("#tb_selftest", async () => {
      if (typeof window.__runSelftest === "function") {
        await window.__runSelftest();
        document.getElementById("selftest")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        const r = await fetch("/debug/selftest", { cache: "no-store" });
        const js = await r.json();
        alert(js?.ok ? "Selvtest: OK" : "Selvtest: feil");
      }
    });

    return { pollTick, pollSvcs };
  }

  return { init };
})();

try {
  window.Topbar = Topbar;
} catch {}
