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
    const ok = !!svc.active;
    const wrap = document.createElement("div");
    wrap.className = "svc"; // matcher about.css
    wrap.innerHTML = `
    <div class="title">
      <span>${name}</span>
      <span class="role">(${svc.scope || "—"})</span>
      <span class="badge ${ok ? "ok" : "bad"}">${ok ? "active" : "inactive"}</span>
    </div>
    <div><span class="label">Unit</span> <span class="chip">${svc.unit || ""}</span></div>
    ${svc.description ? `<div class="desc">${svc.description}</div>` : ""}
    ${svc.since ? `<div><span class="label">Aktiv siden</span> <span class="muted">${svc.since}</span></div>` : ""}
    ${
      svc.exec_main_start
        ? `<div><span class="label">Prosess start</span> <span class="muted">${svc.exec_main_start}</span></div>`
        : ""
    }
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
      const wrap = qs("#v_services_wrap");
      if (wrap) {
        wrap.innerHTML = "";
        const services = a.services || {};
        ["app", "kiosk", "web"].forEach((name) => {
          if (services[name]) wrap.appendChild(serviceCard(name, services[name]));
        });
      }
      s.style.display = "";
      boxErr.style.display = "none";
    } catch (e) {
      if (s) s.style.display = "none";
      if (boxErr) {
        boxErr.style.display = "";
        boxErr.textContent = `Feil: ${e.message}. Tips: åpne Admin og lagre/sett passord (lagres i localStorage).`;
      }
    }
  }
  document.addEventListener("DOMContentLoaded", loadAbout);
})();
