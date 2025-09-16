// static/js/diag.js
// Diagnostic-view: viser tick-data live, inkl. latency og kontrast mellom client/server.

import { ui } from "/static/js/ui.js";

(function () {
  const el = (id) => document.getElementById(id);

  async function fetchTick() {
    try {
      const t0 = performance.now();
      const r = await fetch("/tick", { cache: "no-store" });
      const t1 = performance.now();
      const data = await r.json();
      return { data, rtt: Math.round(t1 - t0) };
    } catch (err) {
      console.error("[diag] fetchTick failed:", err);
      return { data: null, rtt: null, error: err };
    }
  }

  function mmss(ms) {
    const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
  }

  function updateUI(tick, rtt) {
    if (!tick) return;

    el("dg-state").textContent = tick.state;
    el("dg-phase").textContent = tick.phase || "—";
    el("dg-mode").textContent = tick.mode;

    el("dg-now").textContent = String(tick.now_ms || 0);
    el("dg-target").textContent = String(tick.target_ms || 0);
    el("dg-thhmm").textContent = tick.target_hhmm || "";

    // display_ms og signed_display_ms
    let sign = "";
    if (typeof tick.signed_display_ms === "number" && tick.signed_display_ms < 0) {
      sign = "-";
    } else if (tick.state === "overrun" || tick.phase === "over") {
      sign = "-";
    }
    const dispAbs = Math.abs(Number(tick.signed_display_ms ?? tick.display_ms ?? 0));
    el("dg-disp").textContent = sign + mmss(dispAbs);

    el("dg-warn").textContent = String(tick.warn_ms || 0);
    el("dg-alert").textContent = String(tick.alert_ms || 0);
    el("dg-overrun").textContent = String(tick.overrun_ms || 0);

    el("dg-blink").textContent = tick.blink ? "true" : "false";

    if (rtt != null) {
      el("dg-rtt").textContent = `RTT ~${rtt} ms`;
    }
  }

  async function loop() {
    const { data, rtt } = await fetchTick();
    if (data) {
      updateUI(data, rtt);
    } else {
      ui.toast("Feil: kunne ikke hente tick", "bad");
    }
  }

  function init() {
    ui.activateNav("/diag");
    setInterval(loop, 1000);
    loop();
    console.info("[diag] initialized");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
