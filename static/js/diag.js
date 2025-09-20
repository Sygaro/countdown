// static/js/diag.js
import { ui } from "/static/js/ui.js";

let timer = null;
let paused = false;

function signMmss(signedMs) {
  if (typeof signedMs === "number" && signedMs < 0)
    return "-" + ui.mmss(Math.abs(signedMs));
  return ui.mmss(Math.abs(Number(signedMs || 0)));
}

async function once() {
  const t0 = performance.now();
  const r = await fetch("/tick", { cache: "no-store" });
  const t1 = performance.now();
  const j = await r.json();

  const clientNow = Date.now();
  const serverNow = Number(j.now_ms || 0);
  const drift = clientNow - serverNow;

  const signed =
    typeof j.signed_display_ms === "number"
      ? j.signed_display_ms
      : j.state === "overrun" || j.mode === "over"
        ? -Number(j.display_ms || 0)
        : Number(j.display_ms || 0);

  ui.qs("#rtt").textContent = `~${Math.round(t1 - t0)} ms`;
  ui.qs("#drift").textContent = `${drift > 0 ? "+" : ""}${drift} ms`;
  ui.qs("#now").textContent = String(serverNow);
  ui.qs("#cnow").textContent = String(clientNow);
  ui.qs("#tms").textContent = String(j.target_ms || 0);
  ui.qs("#thhmm").textContent = j.target_hhmm || "–";
  ui.qs("#disp").textContent = signMmss(signed);
  ui.qs("#mode").textContent = `${j.mode || "–"} / ${j.state || "–"}`;
  ui.qs("#wao").textContent =
    `${j.warn_ms || 0} / ${j.alert_ms || 0} / ${j.overrun_ms || 0}`;
  ui.qs("#cfgp").textContent = j.__config_path || "–";
  ui.qs("#raw").textContent = JSON.stringify(j, null, 2);
}

function loop() {
  stop();
  const iv = Math.max(200, Number(ui.qs("#interval").value) || 1000);
  timer = setInterval(() => {
    if (!paused) {
      void once();
    }
  }, iv);
}
function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function init() {
  ui.activateNav("/diag");
  ui.qs("#toggle").addEventListener("click", () => {
    paused = !paused;
    ui.qs("#toggle").textContent = paused ? "Fortsett" : "Pause";
    if (!paused) {
      void once();
    }
  });
  ui.qs("#interval").addEventListener("change", loop);
  void once();
  loop();
  window.addEventListener("beforeunload", stop);
}

document.addEventListener("DOMContentLoaded", init, { once: true });
