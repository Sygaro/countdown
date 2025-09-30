// static/js/admin/init.js
/* eslint-env browser */
import { getConfig, postConfig } from "./apiClient.js";
import { getState, setConfig, setSaving, setError } from "./state.js";
import { getInputValue, setInputValue, setText, onClick, showError } from "./dom.js";
import { schedulePreview } from "./preview.js";
function showLoadError(message) {
  const hdr = document.querySelector("h1, header, .topbar") || document.body;
  let box = document.getElementById("admin-config-load-error");
  if (!box) {
    box = document.createElement("div");
    box.id = "admin-config-load-error";
    box.style.margin = "12px 0";
    box.style.padding = "8px 12px";
    box.style.border = "1px solid #7f1d1d";
    box.style.background = "#7f1d1d22";
    box.style.color = "#7f1d1d";
    hdr.parentNode?.insertBefore(box, hdr.nextSibling);
  }
  box.textContent = `Klarte ikke å laste config: ${message}`;
}
function safeBindInitialForm(cfg) {
  const modeEl = document.querySelector("#mode");
  if (modeEl && "value" in modeEl) modeEl.value = cfg.mode ?? "";
  const labelEl = document.querySelector("#target_label");
  if (labelEl && "value" in labelEl) labelEl.value = cfg.target_label ?? "";
}
function renderSummary() {
  const st = getState();
  if (!st.config) return;
  const modeOut = document.querySelector("#current-mode");
  if (modeOut) modeOut.textContent = st.config.mode;
  const targetOut = document.querySelector("#target");
  if (targetOut) targetOut.textContent = st.config.target_label || "";
}
async function doSave() {
  try {
    setSaving(true);
    const patch = {};
    const modeEl = document.querySelector("#mode");
    if (modeEl && "value" in modeEl) patch.mode = modeEl.value;
    const labelEl = document.querySelector("#target_label");
    if (labelEl && "value" in labelEl) patch.target_label = labelEl.value;
    const body = await postConfig(patch);
    setConfig(body.config, body.tick);
    renderSummary();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg);
    showError(`Lagring feilet: ${msg}`);
  } finally {
    setSaving(false);
  }
}
function wireEvents() {
  onClick("#save-config", doSave);
  document.querySelectorAll("[data-preview]").forEach((el) => {
    el.addEventListener("input", () => {
      schedulePreview(() => {
        renderSummary();
      });
    });
  });
}
async function bootstrap() {
  try {
    const body = await getConfig();
    if (!body?.config) {
      showLoadError("Svar mangler 'config'");
      return;
    }
    setConfig(body.config, body.tick || null);
    safeBindInitialForm(body.config);
    renderSummary();
    wireEvents();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showLoadError(msg);
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
