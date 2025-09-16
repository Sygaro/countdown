import { ui } from "/static/js/ui.js";

let timer = null;
let paused = false;

function fmtBoth(ms) {
  const sgn = ms < 0 ? "-" : "";
  ms = Math.abs(ms);
  let s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  s %= 60;
  const pad = (n) => String(n).padStart(2, "0");
  return {
    mmss: `${sgn}${Math.floor(h * 60 + m)}:${pad(s)}`,
    hms: `${sgn}${h}:${pad(m)}:${pad(s)}`,
  };
}

async function poll() {
  try {
    const t0 = performance.now();
    const r = await fetch("/tick", { cache: "no-store" });
    const t = await r.json();
    const dt = performance.now() - t0;

    const both = fmtBoth(t.signed_display_ms);
    ui.qs("#countdown").textContent = both.mmss;
    ui.qs("#phase").textContent = `fase: ${t.mode} · state: ${t.state}`;
    ui.qs("#meta").textContent = `mål: ${t.target_hhmm || t.target_ms} · nå: ${new Date(t.now_ms).toLocaleTimeString()}`;
    ui.qs("#both").textContent = `format: ${both.hms} / ${both.mmss}`;
    ui.qs("#lat").textContent = `latency: ${dt.toFixed(0)} ms`;
    ui.qs("#live").textContent = JSON.stringify(t, null, 2);
  } catch (err) {
    ui.qs("#countdown").textContent = "FEIL!";
    console.error("poll failed", err);
  }
}

async function selftest() {
  try {
    const r = await fetch("/debug/selftest");
    const js = await r.json();
    const ul = ui.qs("#selftest");
    ul.innerHTML = "";
    js.tests.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = `${t.ok ? "✔" : "✖"} ${t.name}${t.info ? " — " + t.info : ""}`;
      li.className = t.ok ? "ok" : "fail";
      ul.appendChild(li);
    });
  } catch (err) {
    console.error("selftest failed", err);
  }
}

async function dump(url) {
  try {
    const r = await fetch(url);
    const js = await r.json();
    ui.qs("#raw").textContent = JSON.stringify(js, null, 2);
  } catch (err) {
    ui.qs("#raw").textContent = "Feil ved henting av " + url;
  }
}

function init() {
  ui.activateNav("/diag");

  ui.qs("#refresh").addEventListener("click", () => poll());
  ui.qs("#run_selftest").addEventListener("click", () => selftest());

  document.querySelectorAll("[data-endpoint]").forEach(btn => {
    btn.addEventListener("click", () => dump(btn.dataset.endpoint));
  });

  poll();
  timer = setInterval(() => { if (!paused) poll(); }, 1000);
  window.addEventListener("beforeunload", () => clearInterval(timer));
}

document.addEventListener("DOMContentLoaded", init, { once: true });
