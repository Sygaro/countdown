import { ui } from "/static/js/ui.js";

// Hurtigstart-panel for å starte nedtelling med 1 klikk
(function () {
  async function startMinutes(min) {
    const m = Math.max(1, Math.floor(Number(min)));
    try {
      await ui.post("/api/start-duration", { minutes: m });
      ui.toast("Startet +" + m + " min", "ok");
    } catch (e) {
      ui.toast("Start feilet: " + (e?.message || String(e)), "bad");
    }
  }

  function buildPanel() {
    const host =
      document.querySelector("[data-admin-quickstart]") ||
      document.getElementById("admin-quickstart");

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
    ui.injectQuickstartStyles?.(); // evt. flytt CSS til static/css/admin_quickstart.css
    buildPanel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
