// path: static/js/admin/dom.js
// file: static/js/admin/dom.js
/* eslint-env browser */
export function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = String(text ?? "");
}
export function getInputValue(selector) {
  const el = document.querySelector(selector);
  if (el && "value" in el) return el.value;
  return "";
}
export function setInputValue(selector, value) {
  const el = document.querySelector(selector);
  if (el && "value" in el) el.value = value ?? "";
}
export function onClick(selector, handler) {
  const el = document.querySelector(selector);
  if (el) el.addEventListener("click", handler);
}
export function onInput(selector, handler) {
  const el = document.querySelector(selector);
  if (el) el.addEventListener("input", handler);
}
export function showError(message) {
  alert(String(message || "Ukjent feil")); // senere: toast-komponent
}
/** Sikker sletting av alle barn (erstatter innerHTML="") */
export function clearChildren(nodeOrSelector) {
  const root = typeof nodeOrSelector === "string" ? document.querySelector(nodeOrSelector) : nodeOrSelector;
  if (!root) return;
  while (root.firstChild) root.removeChild(root.firstChild);
}
