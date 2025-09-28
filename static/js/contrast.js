// static/js/contrast.js
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Contrast = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function hexToRgb(h) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(h || "").trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [230, 237, 243];
  }
  function luminance(rgb) {
    const a = rgb.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function ratio(fg, bg) {
    const L1 = luminance(hexToRgb(fg)),
      L2 = luminance(hexToRgb(bg));
    const hi = Math.max(L1, L2),
      lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function advise(r) {
    // Enkelt “badge”-råd for GUI
    if (r >= 7) return { tone: "ok", label: `${r.toFixed(2)} ✔` };
    if (r >= 4.5) return { tone: "ok", label: `${r.toFixed(2)} ✔` };
    if (r >= 3) return { tone: "warn", label: `${r.toFixed(2)} ⚠` };
    return { tone: "error", label: `${r.toFixed(2)} ✖` };
  }

  return { hexToRgb, luminance, ratio, advise };
});
