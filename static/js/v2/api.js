// Minimal, eksplisitt API-klient
export async function getConfig() {
  const r = await fetch("/api/config");
  if (!r.ok) throw new Error("getConfig failed");
  const js = await r.json();
  return js.config;
}
export async function getTick() {
  const r = await fetch("/tick");
  if (!r.ok) throw new Error("getTick failed");
  return await r.json();
}
export function sendHeartbeat(rev) {
  const payload = JSON.stringify({ rev, page: "view_v2" });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/debug/view-heartbeat", new Blob([payload], { type: "application/json" }));
  } else {
    fetch("/debug/view-heartbeat", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }).catch(()=>{});
  }
}
