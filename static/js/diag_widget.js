// static/js/diag_widget.js — minus-prefiks i overrun
(function () {
  const STYLE = `
  .dw-wrap{position:fixed;left:16px;bottom:16px;z-index:2147482000;max-width:min(680px,calc(100vw - 32px))}
  .dw-card{background:#fff;border:1px solid #ddd;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.12);overflow:hidden}
  .dw-h{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f6f6f8}
  .dw-h .ttl{font-weight:600}
  .dw-h .ctrls{display:flex;gap:8px;align-items:center}
  .dw-btn{padding:6px 10px;border:1px solid #ccc;border-radius:8px;background:#f7f7f7;cursor:pointer}
  .dw-btn:hover{background:#efefef}
  .dw-body{padding:10px 12px;font:13px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif}
  .dw-grid{display:grid;grid-template-columns:200px 1fr;gap:6px 10px;align-items:center}
  .dw-mono{font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace}
  .dw-json{white-space:pre;background:#0b1020;color:#d7e7ff;border-radius:10px;padding:10px;max-height:240px;overflow:auto;margin-top:8px}
  .ok{color:#184}.warn{color:#a60}.bad{color:#922}
  `;
  function injectStyle() {
    if (!document.getElementById("dw-style")) {
      const s = document.createElement("style");
      s.id = "dw-style";
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
  }
  function el(t, c, txt) {
    const e = document.createElement(t);
    if (c) e.className = c;
    if (txt != null) e.textContent = txt;
    return e;
  }
  async function fetchTick() {
    const t0 = performance.now();
    const r = await fetch("/tick", { cache: "no-store" });
    const t1 = performance.now();
    return { j: await r.json(), rtt: Math.round(t1 - t0) };
  }
  function mmss(ms) {
    const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
  }

  function buildPanel() {
    const wrap = el("div", "dw-wrap"),
      card = el("div", "dw-card"),
      head = el("div", "dw-h"),
      ttl = el("div", "ttl", "Live Tick Diagnostics"),
      ctrls = el("div", "ctrls");
    const btn = el("button", "dw-btn", "Pause"),
      ivLbl = el("label", "", "Intervall (ms): "),
      iv = el("input"),
      status = el("span", "dw-mono", "—");
    iv.type = "number";
    iv.min = "200";
    iv.step = "100";
    iv.value = "1000";
    ctrls.append(btn, ivLbl, iv, status);
    head.append(ttl, ctrls);

    const body = el("div", "dw-body"),
      grid = el("div", "dw-grid dw-mono"),
      raw = el("div", "dw-json dw-mono");
    const rows = [
      ["State", "state"],
      ["Mode", "mode"],
      ["Blink", "blink"],
      ["Server now_ms", "now"],
      ["Client now_ms", "cnow"],
      ["Δ (client-server)", "delta"],
      ["Target ms", "tms"],
      ["Target HH:MM", "thhmm"],
      ["Display mm:ss", "disp"],
      ["warn_ms", "warn"],
      ["alert_ms", "alert"],
      ["overrun_ms", "overrun"],
      ["Config flags", "flags"],
      ["Config path", "cfgp"],
    ];
    rows.forEach(([k, key]) => {
      const a = el("div", "", k),
        b = el("div", "", "—");
      b.id = "dw-" + key;
      grid.append(a, b);
    });

    body.append(grid, raw);
    card.append(head, body);
    wrap.append(card);
    document.body.appendChild(wrap);

    let paused = false,
      timer = null;

    async function once() {
      try {
        const { j, rtt } = await fetchTick();
        const clientNow = Date.now(),
          serverNow = Number(j.now_ms || 0),
          delta = clientNow - serverNow;
        document.getElementById("dw-state").textContent = j.state;
        document.getElementById("dw-mode").textContent = j.mode;
        document.getElementById("dw-blink").textContent = j.blink
          ? "true"
          : "false";
        document.getElementById("dw-now").textContent = String(serverNow);
        document.getElementById("dw-cnow").textContent = String(clientNow);
        const cls =
          Math.abs(delta) <= 300
            ? "ok"
            : Math.abs(delta) <= 2000
              ? "warn"
              : "bad";
        document.getElementById("dw-delta").innerHTML =
          `<span class="${cls}">${delta} ms</span>`;
        document.getElementById("dw-tms").textContent = String(
          j.target_ms || 0,
        );
        document.getElementById("dw-thhmm").textContent = j.target_hhmm || "";

        // Minus i overrun: bruk signed_display_ms hvis tilgjengelig, ellers state/mode
        let sign = "";
        if (typeof j.signed_display_ms === "number") {
          sign = j.signed_display_ms < 0 ? "-" : "";
        } else if (j.state === "overrun" || j.mode === "over") {
          sign = "-";
        }
        const dispMs = Math.abs(
          Number(j.signed_display_ms ?? j.display_ms ?? 0),
        );
        document.getElementById("dw-disp").textContent = sign + mmss(dispMs);

        document.getElementById("dw-warn").textContent = String(j.warn_ms || 0);
        document.getElementById("dw-alert").textContent = String(
          j.alert_ms || 0,
        );
        document.getElementById("dw-overrun").textContent = String(
          j.overrun_ms || 0,
        );
        document.getElementById("dw-flags").textContent = JSON.stringify(
          j.__cfg_flags || {},
          null,
          0,
        );
        document.getElementById("dw-cfgp").textContent = String(
          j.__config_path || "",
        );
        raw.textContent = JSON.stringify(j, null, 2);
        status.textContent = `RTT ~${rtt} ms`;
      } catch (e) {
        status.textContent =
          "Feil: " + (e && e.message ? e.message : String(e));
      }
    }
    function loop() {
      stop();
      const n = Math.max(200, Math.floor(Number(iv.value || 1000)));
      timer = setInterval(() => {
        if (!paused) once();
      }, n);
    }
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
    btn.addEventListener("click", () => {
      paused = !paused;
      btn.textContent = paused ? "Fortsett" : "Pause";
      if (!paused) once();
    });
    iv.addEventListener("change", loop);

    once();
    loop();
    window.addEventListener("beforeunload", stop);
  }

  function init() {
    injectStyle();
    if (!document.querySelector(".dw-wrap")) buildPanel();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
