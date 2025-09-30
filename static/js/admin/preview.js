// path: static/js/admin/preview.js
// file: static/js/admin/preview.js
/* eslint-env browser */
let rafId = 0;
let pending = null;
export function schedulePreview(apply) {
  pending = apply;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    const fn = pending;
    pending = null;
    try {
      if (fn) fn();
    } catch (e) {
      console.error(e);
    }
  });
}
