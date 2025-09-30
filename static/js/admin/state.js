// path: static/js/admin/state.js
// file: static/js/admin/state.js
/* eslint-env browser */
const state = {
  config: null,
  tick: null,
  isSaving: false,
  lastError: "",
};
export function getState() {
  return state;
}
export function setConfig(cfg, tick = null) {
  state.config = cfg ? structuredClone(cfg) : null;
  state.tick = tick ? structuredClone(tick) : null;
}
export function setSaving(flag) {
  state.isSaving = !!flag;
}
export function setError(message) {
  state.lastError = String(message || "");
}
