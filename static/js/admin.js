/* File: static/js/admin.js
 * Purpose: Admin autosync (debounced), statusindikator, robust feil-/konflikthåndtering,
 *          hurtigknapper og støtte for full erstatning av overlays via partner-modul.
 * Exports: window.AdminSync = { postConfig, getConfig, applyConfigToForm }
 * Replaces: static/js/admin.js
 */

(() => {
  "use strict";

  const API = {
    config: "/api/config",
    defaults: "/api/defaults",
    startDuration: "/api/start-duration",
    stop: "/api/stop",
    status: "/api/status",
  };
  const HEADERS = { "Content-Type": "application/json" };
  const DEBOUNCE_MS = 250;
  const RETRIES = [400, 800, 1500, 3000];

  let latestConfig = null,
    lastSavedDraft = null,
    dirty = false,
    saving = false,
    retryIdx = 0,
    debTimer = null,
    passwordCache = null;
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function ensureStatusEl() {
    let el = $("#sync-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "sync-status";
      el.style.cssText =
        "position:fixed;right:12px;bottom:12px;padding:6px 10px;border-radius:6px;" +
        "background:#0b0f14;color:#e6edf3;font:500 12px ui-sans-serif,system-ui;" +
        "box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:9999;" +
        "opacity:0;transition:opacity .2s ease;pointer-events:none";
      document.body.appendChild(el);
    }
    el.setAttribute("aria-live", "polite");
    return el;
  }

  function setStatus(text, kind = "info", ms = 5000) {
    const el = ensureStatusEl();
    el.textContent = text;
    el.dataset.state = kind;
    el.style.opacity = "1";
    clearTimeout(el._hideTimer);
    if (ms > 0) {
      el._hideTimer = setTimeout(() => {
        el.style.opacity = "0";
      }, ms);
    }
  }

  const stableSig = (o) => {
    try {
      return JSON.stringify(o, (_, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v));
    } catch {
      return JSON.stringify(o);
    }
  };
  function debounce(fn, w = DEBOUNCE_MS) {
    return (...a) => {
      clearTimeout(debTimer);
      debTimer = setTimeout(() => fn(...a), w);
    };
  }

  function readPassword() {
    if (passwordCache) return passwordCache;
    const inp = $("#admin-password");
    const v = (inp && inp.value) || localStorage.getItem("admin_password") || "";
    passwordCache = v || null;
    return passwordCache;
  }
  function withAdminHeader(init = {}) {
    const h = { ...(init.headers || {}), ...HEADERS };
    const pw = readPassword();
    if (pw) h["X-Admin-Password"] = pw;
    return { ...init, headers: h };
  }
  function toastError(m, long = false) {
    setStatus(`Feil: ${m}`, "error");
    if (long) {
      statusEl.style.opacity = "1";
      setTimeout(() => (statusEl.style.opacity = ""), 4000);
    }
  }

  function readFormToPatch(root = document) {
    const out = {};
    $$("[data-bind]", root).forEach((input) => {
      const path = input.dataset.bind?.trim();
      if (!path) return;
      const parts = path.split(".");
      let ref = out;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!ref[p] || typeof ref[p] !== "object") ref[p] = {};
        ref = ref[p];
      }
      const last = parts[parts.length - 1];
      let v =
        input.type === "checkbox"
          ? !!input.checked
          : input.type === "number"
            ? input.value === ""
              ? ""
              : Number(input.value)
            : input.value;
      if (input.dataset.type === "int") v = v === "" ? "" : parseInt(v, 10);
      if (input.dataset.type === "float") v = v === "" ? "" : parseFloat(v);
      if (input.dataset.type === "bool") v = !!(input.type === "checkbox" ? input.checked : v === true || v === "true");
      ref[last] = v;
    });
    return out;
  }

  function applyConfigToForm(cfg, root = document) {
    $$("[data-bind]", root).forEach((input) => {
      const path = input.dataset.bind?.trim();
      if (!path) return;
      const parts = path.split(".");
      let ref = cfg;
      for (let i = 0; i < parts.length && ref != null; i++) ref = ref[parts[i]];
      if (ref == null) return;
      if (input.type === "checkbox") input.checked = !!ref;
      else input.value = `${ref}`;
    });
  }

  function diffPatch(nv, ov) {
    if (!ov) return nv;
    const out = {};
    function walk(a, b, dst) {
      const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
      let changed = false;
      for (const k of keys) {
        const va = a ? a[k] : undefined,
          vb = b ? b[k] : undefined;
        if (Array.isArray(va)) {
          if (stableSig(va) !== stableSig(vb)) {
            dst[k] = va;
            changed = true;
          }
        } else if (va && typeof va === "object") {
          const child = {};
          const cc = walk(va, vb && typeof vb === "object" ? vb : undefined, child);
          if (cc) {
            dst[k] = child;
            changed = true;
          }
        } else {
          if (va !== vb) {
            dst[k] = va;
            changed = true;
          }
        }
      }
      return changed;
    }
    return walk(nv, ov, out) ? out : {};
  }

  async function apiGetConfig() {
    const res = await fetch(API.config, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `GET /api/config ${res.status}`);
    latestConfig = data.config || {};
    lastSavedDraft = latestConfig;
    return data;
  }
  async function apiPostConfig(patch) {
    const res = await fetch(
      API.config,
      withAdminHeader({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(patch),
      }),
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `POST /api/config ${res.status}`);
    latestConfig = data.config || latestConfig;
    lastSavedDraft = latestConfig;
    return data;
  }
  async function apiStartDuration(minutes) {
    const res = await fetch(
      API.startDuration,
      withAdminHeader({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ minutes }),
      }),
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `POST /api/start-duration ${res.status}`);
    latestConfig = data.config || latestConfig;
    lastSavedDraft = latestConfig;
    return data;
  }
  async function apiStop() {
    const res = await fetch(API.stop, withAdminHeader({ method: "POST", credentials: "same-origin" }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `POST /api/stop ${res.status}`);
    latestConfig = data.config || latestConfig;
    lastSavedDraft = latestConfig;
    return data;
  }

  const syncNow = debounce(async () => {
    try {
      if (saving) return;
      const draft = readFormToPatch(document);
      let patch = diffPatch(draft, lastSavedDraft);
      if (!patch || Object.keys(patch).length === 0) {
        dirty = false;
        setStatus("Synk: oppdatert", "ok");
        return;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "overlays")) patch.overlays_mode = "replace";
      saving = true;
      dirty = true;
      setStatus("Synk: lagrer …", "saving");
      await apiPostConfig(patch);
      saving = false;
      dirty = false;
      retryIdx = 0;
      setStatus("Synk: lagret ✔", "ok");
    } catch (err) {
      saving = false;
      dirty = true;
      setStatus("Synk: feil", "error");
      const wait = [400, 800, 1500, 3000][Math.min(retryIdx++, 3)];
      setTimeout(syncNow, wait);
    }
  }, DEBOUNCE_MS);

  function bindInputs() {
    $$("[data-bind]").forEach((el) => {
      el.addEventListener("input", syncNow, { passive: true });
      el.addEventListener("change", syncNow, { passive: true });
    });
  }

  async function handleAction(action) {
    try {
      setStatus("Utfører …", "saving");
      if (action === "daily") await apiPostConfig({ mode: "daily" });
      else if (action === "clock") await apiPostConfig({ mode: "clock" });
      else if (action === "start-15") await apiStartDuration(15);
      else if (action === "start-20") await apiStartDuration(20);
      else if (action === "stop") await apiStop();
      setStatus("OK ✔", "ok");
      applyConfigToForm(latestConfig);
    } catch (err) {
      /* vises av overlay-modul også om ønskelig */
    }
  }
  function bindQuickActions() {
    $$("[data-action]").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const a = btn.dataset.action;
        if (!a) return;
        e.preventDefault();
        handleAction(a);
      }),
    );
  }

  async function init() {
    try {
      setStatus("Laster …", "loading");
      const passInput = $("#admin-password");
      if (passInput) {
        const persisted = localStorage.getItem("admin_password");
        if (persisted && !passInput.value) passInput.value = persisted;
        passInput.addEventListener("input", () => {
          passwordCache = passInput.value || null;
          if (passwordCache) localStorage.setItem("admin_password", passwordCache);
          else localStorage.removeItem("admin_password");
        });
      }
      bindInputs();
      bindQuickActions();
      const { config } = await apiGetConfig();
      applyConfigToForm(config);
      setStatus("Klar", "ready");

      setInterval(async () => {
        try {
          const r = await fetch(API.status, {
            headers: { Accept: "application/json" },
          });
          if (!r.ok) return;
        } catch {}
      }, 15000);
    } catch (err) {
      /* status allerede satt */
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  // --- EXPOSE HOOKS for overlay module ---
  window.AdminSync = {
    postConfig: apiPostConfig,
    getConfig: apiGetConfig,
    applyConfigToForm,
  };
})();
