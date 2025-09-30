// static/js/admin/apiClient.js
/* eslint-env browser */
function makeHeaders() {
  return {
    "Content-Type": "application/json",
  };
}
async function requestJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      ...options,
      headers: { ...makeHeaders(), ...(options.headers || {}) },
      signal: controller.signal,
    });
    const ctype = resp.headers.get("content-type") || "";
    const isJSON = ctype.includes("application/json");
    const text = await resp.text().catch(() => "");
    const body = isJSON && text ? JSON.parse(text) : text;
    if (!resp.ok) {
      const message = typeof body === "string" && body ? body : resp.statusText;
      throw new Error(`${options.method || "GET"} ${url} failed: ${resp.status} ${message}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}
export async function getConfig() {
  const body = await requestJSON("/api/config", { method: "GET" });
  if (!body || typeof body !== "object") {
    console.error("[admin] /api/config: uventet respons", body);
    throw new Error("Uventet respons fra /api/config");
  }
  if (!("config" in body)) {
    console.error("[admin] /api/config: mangler 'config' i body", body);
    throw new Error("Svar fra /api/config mangler feltet 'config'");
  }
  return body; // { ok, server_time, config, tick }
}
export async function postConfig(patch) {
  const body = await requestJSON("/api/config", {
    method: "POST",
    body: JSON.stringify(patch ?? {}),
  });
  if (!body || typeof body !== "object" || !("config" in body)) {
    console.error("[admin] POST /api/config: uventet respons", body);
    throw new Error("Uventet respons fra POST /api/config");
  }
  return body;
}
