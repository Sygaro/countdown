// path: static/js/admin/validators.js
// file: static/js/admin/validators.js
/* eslint-env browser */
export function isValidColor(str) {
  const s = new Option().style;
  s.color = "";
  s.color = String(str || "");
  return s.color !== "";
}
