import { ui } from "/static/js/ui.js";

(function () {
  const state = { password: "" };

  function loadConfig() {
    return ui
      .get("/api/config")
      .then((resp) => {
        const cfg = resp.config || resp;

        ui.setChecked("show_primary", !!cfg.show_message_primary);
        ui.setChecked("show_secondary", !!cfg.show_message_secondary);
        ui.setVal("msg_primary", String(cfg.message_primary || ""));
        ui.setVal("msg_secondary", String(cfg.message_secondary || ""));

        ui.setVal("warn_minutes", String(cfg.warn_minutes ?? 4));
        ui.setVal("alert_minutes", String(cfg.alert_minutes ?? 2));
        ui.setVal("blink_seconds", String(cfg.blink_seconds ?? 10));
        ui.setVal("overrun_minutes", String(cfg.overrun_minutes ?? 1));

        const hasDaily = !!cfg.daily_time;
        ui.qs("#mode-daily").checked = hasDaily;
        ui.qs("#mode-single").checked = !hasDaily;
        ui.setVal("daily_time", hasDaily ? cfg.daily_time || "" : "");

        const iso = cfg.once_at || "";
        if (iso) {
          try {
            const dt = new Date(iso);
            const off = dt.getTimezoneOffset();
            const local = new Date(dt.getTime() - off * 60000);
            ui.setVal("single_dt", local.toISOString().slice(0, 16));
          } catch {
            ui.setVal("single_dt", "");
          }
        } else {
          ui.setVal("single_dt", "");
        }

        const badge = document.getElementById("cfg-path");
        if (badge) badge.textContent = resp.__config_path || "(ukjent sti)";

        ui.toast("Konfig lastet", "ok");
      })
      .catch((err) => {
        ui.toast("Kunne ikke laste /api/config: " + (err?.message || String(err)), "bad");
      });
  }

  function collectPatch() {
    const patch = {
      show_message_primary: ui.qs("#show_primary").checked,
      show_message_secondary: ui.qs("#show_secondary").checked,
      message_primary: ui.val("#msg_primary"),
      message_secondary: ui.val("#msg_secondary"),
      warn_minutes: Number(ui.val("#warn_minutes")) || 4,
      alert_minutes: Number(ui.val("#alert_minutes")) || 2,
      blink_seconds: Number(ui.val("#blink_seconds")) || 10,
      overrun_minutes: Number(ui.val("#overrun_minutes")) || 1,
    };

    if (ui.qs("#mode-daily").checked) {
      patch.daily_time = ui.val("#daily_time") || "";
      patch.once_at = "";
    } else {
      patch.daily_time = "";
      const sdt = ui.val("#single_dt");
      if (sdt) patch.once_at = new Date(sdt).toISOString();
    }
    return patch;
  }

  function saveChanges() {
    state.password = ui.val("#admin_password") || "";
    const patch = collectPatch();
    return ui
      .post("/api/config", patch, { password: state.password })
      .then(() => {
        ui.toast("Lagret", "ok");
        return loadConfig();
      })
      .catch((err) => {
        ui.toast("Lagre feilet: " + (err?.message || String(err)), "bad");
      });
  }

  function startNow(minutes) {
    state.password = ui.val("#admin_password") || "";
    const m = minutes != null ? Number(minutes) : Number(ui.val("#start_minutes"));
    if (!isFinite(m) || m <= 0) {
      ui.toast("Ugyldig varighet", "bad");
      return Promise.resolve();
    }
    return ui
      .post("/api/start-duration", { minutes: Math.floor(m) }, { password: state.password })
      .then(() => {
        ui.toast("Startet +" + Math.floor(m) + " min", "ok");
      })
      .catch((err) => {
        ui.toast("Start feilet: " + (err?.message || String(err)), "bad");
      });
  }

  function wire() {
    ui.qs("#btn-load")?.addEventListener("click", loadConfig);
    ui.qs("#btn-save")?.addEventListener("click", saveChanges);
    ui.qs("#start_now")?.addEventListener("click", () => startNow());

    document.querySelectorAll("button[data-qs]").forEach((b) => {
      b.addEventListener("click", () => startNow(b.getAttribute("data-qs")));
    });

    const sbox = ui.qs("#debug-status");
    ui.qs("#btn-debug-refresh")?.addEventListener("click", () => showDebug(false, sbox));
    ui.qs("#btn-debug-write")?.addEventListener("click", () => showDebug(true, sbox));
  }

  function showDebug(write, sbox) {
    const url = write ? "/debug/config?write_test=1" : "/debug/config";
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (sbox) sbox.textContent = JSON.stringify(j, null, 2);
        ui.toast(
          write ? (j.write_test_ok ? "Skrivetest: OK" : "Skrivetest: FEIL") : "Status oppdatert",
          write && !j.write_test_ok ? "bad" : "ok",
        );
      })
      .catch((e) => {
        ui.toast("Debug-feil: " + (e?.message || String(e)), "bad");
      });
  }

  function init() {
    ui.activateNav("/admin");
    wire();
    loadConfig();
    console.info("[admin] initialized");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
