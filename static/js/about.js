// static/js/about.js
(function () {
  const qs = (s, r) => (r || document).querySelector(s);

  function authHeaders() {
    const pwd = localStorage.getItem("admin_password") || qs('meta[name="admin-password"]')?.content || "";
    const h = { Accept: "application/json" };
    if (pwd) h["X-Admin-Password"] = pwd;
    return h;
  }

  function serviceCard(name, svc) {
    const wrap = document.createElement("div");
    wrap.className = "service";
    const ok = !!svc.active;
    wrap.innerHTML = `
      <div class="head">
        <div><strong>${name}</strong> <span class="muted">(${svc.scope})</span></div>
        <span class="badge ${ok ? "ok" : "fail"}">${ok ? "active" : "inactive"}</span>
      </div>
      <div>Unit: <code>${svc.unit || ""}</code></div>
      ${svc.description ? `<div class="muted">${svc.description}</div>` : ""}
      ${svc.since ? `<div>Aktiv siden: <span class="muted">${svc.since}</span></div>` : ""}
      ${svc.exec_main_start ? `<div>Prosess start: <span class="muted">${svc.exec_main_start}</span></div>` : ""}
    `;
    return wrap;
  }

  async function loadAbout() {
    const boxErr = qs("#about_error");
    const s = qs("#about_status");
    try {
      const r = await fetch("/api/sys/about-status", { headers: authHeaders() });
      const js = await r.json();
      if (!r.ok || js.ok === false) throw new Error(js.error || `HTTP ${r.status}`);

      const a = js.about || {};
      const map = {
        version: "#v_version",
        commit: "#v_commit",
        os: "#v_os",
        kernel: "#v_kernel",
        arch: "#v_arch",
        model: "#v_model",
        server_time: "#v_server_time",
      };
      for (const [key, sel] of Object.entries(map)) {
        const el = qs(sel);
        if (el) el.textContent = a[key] || "—";
      }

      // Services
      const wrap = qs("#v_services_wrap");
      wrap.innerHTML = "";
      const services = a.services || {};
      // Stabil rekkefølge: app, kiosk, web (web = alias)
      ["app", "kiosk", "web"].forEach((name) => {
        if (services[name]) wrap.appendChild(serviceCard(name, services[name]));
      });

      s.style.display = "";
      boxErr.style.display = "none";
    } catch (e) {
      s.style.display = "none";
      boxErr.style.display = "";
      boxErr.textContent = `Feil: ${e.message}. Tips: åpne Admin og lagre/sett passord (lagres i localStorage).`;
    }
  }

  document.addEventListener("DOMContentLoaded", loadAbout);
})();
