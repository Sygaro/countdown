// path: static/js/v2/api.js
// Felles, robust API-klient som prøver flere ruter for legacy-kompatibilitet.

const JSON_OPTS_GET = {
  method: "GET",
  headers: { "Accept": "application/json" },
  cache: "no-store",
  credentials: "same-origin",
};

const JSON_OPTS_POST = (body, extraHeaders={}) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", "Accept": "application/json", ...extraHeaders },
  body: JSON.stringify(body || {}),
  cache: "no-store",
  credentials: "same-origin",
});

async function tryFetchJson(url, opts){
  const u = `${url}${url.includes("?") ? "&" : "?"}ts=${Date.now()}`;
  const r = await fetch(u, opts);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function firstOk(urls, opts){
  const errs = [];
  for (const u of urls){
    try { return await tryFetchJson(u, opts); }
    catch(e){ errs.push(String(e.message||e)); }
  }
  const err = new Error(`All endpoints failed: ${errs.join(" | ")}`);
  err._errors = errs;
  throw err;
}

/* ---------- Public API ---------- */

export async function apiGetConfig(){
  return firstOk(
    ["/api/config", "/config", "/api/v1/config"],
    JSON_OPTS_GET
  );
}

export async function apiPostConfig(body, { adminPassword } = {}){
  const headers = {};
  if (adminPassword) headers["X-Admin-Password"] = adminPassword;
  return firstOk(
    ["/api/config", "/config", "/api/v1/config"],
    JSON_OPTS_POST(body, headers)
  );
}

export async function apiGetDefaults(){
  return firstOk(
    ["/api/defaults", "/defaults", "/api/v1/defaults"],
    JSON_OPTS_GET
  );
}

export async function apiGetTick(){
  return firstOk(
    ["/tick", "/api/tick", "/api/v1/tick"],
    JSON_OPTS_GET
  );
}

export async function apiStartDuration(minutes, { adminPassword } = {}){
  const headers = {};
  if (adminPassword) headers["X-Admin-Password"] = adminPassword;
  return firstOk(
    ["/api/start-duration", "/start-duration", "/api/v1/start-duration"],
    JSON_OPTS_POST({ minutes }, headers)
  );
}

export async function apiSwitchDaily({ adminPassword } = {}){
  const headers = {};
  if (adminPassword) headers["X-Admin-Password"] = adminPassword;
  return firstOk(
    ["/api/config", "/config", "/api/v1/config"],
    JSON_OPTS_POST({ mode: "daily" }, headers)
  );
}
