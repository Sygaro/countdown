// static/js/admin_quickstart.js
// Hvorfor: injiserer hurtigknapper uten å endre eksisterende HTML.

import { ui } from "/static/js/ui.js";

(function () {
  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    try {
      return await r.json();
    } catch {
      return {};
    }
  }

  async function startMinutes(min) {
    const m = Math.max(1, Math.floor(Number(min)));
    try {
      await postJSON("/api/start-duration", { minutes: m });
      ui.toast("Startet +" + m + " min", "ok");
    } catch (e) {
      ui.toast(e.message || String(e), "bad");
    }
  }

  function buildPanel() {
    const host =
      document.querySelector("[data-admin-quickstart]") ||
      document.getElementById("admin-quickstart");

    // Prioriter brukers container hvis funnet; ellers flytende kort
    const panel = document.createElement("div");
    panel.className = host ? "" : "aqs-card";
    panel.innerHTML = `
      <div class="aqs-title">Start nedtelling</div>
      <div class="aqs-row">
        <button class="aqs-btn primary" data-min="5">+5 min</button>
        <button class="aqs-btn primary" data-min="10">+10 min</button>
        <button class="aqs-btn primary" data-min="15">+15 min</button>
        <button class="aqs-btn primary" data-min="30">+30 min</button>
      </div>
      <div class="aqs-row">
        <input class="aqs-input" id="aqs-custom" type="number" min="1" step="1" value="20" />
        <button class="aqs-btn" id="aqs-start">Start nå</button>
      </div>
    `;

    (host || document.body).appendChild(panel);

    panel.querySelectorAll("button[data-min]").forEach((btn) => {
      btn.addEventListener("click", () =>
        startMinutes(btn.getAttribute("data-min")),
      );
    });
    panel.querySelector("#aqs-start").addEventListener("click", () => {
      const v = panel.querySelector("#aqs-custom").value;
      startMinutes(v);
    });
  }

  function init() {
    buildPanel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
