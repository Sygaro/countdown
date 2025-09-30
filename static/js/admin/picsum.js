// static/js/admin/picsum.js
/* eslint-env browser */

// Små wrappers som kaller eksisterende funksjoner i monolitten.
// Dette lar oss gradvis flytte logikk ut uten å endre oppførsel.

export function initPicsumSection() {
  // Kall de eksisterende funksjonene om de finnes:
  try { typeof ensureCuratedPicsumUI === "function" && ensureCuratedPicsumUI(); } catch (e) { console.error(e); }
  try { typeof ensurePicsumAutoRotateUI === "function" && ensurePicsumAutoRotateUI(); } catch (e) { console.error(e); }
  try { typeof ensurePicsumModal === "function" && ensurePicsumModal(); } catch (e) { console.error(e); }
  try { typeof ensurePicsumBrowseButton === "function" && ensurePicsumBrowseButton(); } catch (e) { console.error(e); }
  try { typeof bindPicsumImport === "function" && bindPicsumImport(); } catch (e) { console.error(e); }
}
