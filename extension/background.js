// Service worker: única pieza que habla con el dashboard. Los content
// scripts y el popup le mandan { type: "api", path, method, body } y ella
// agrega la URL del dashboard y la API key guardadas en chrome.storage.

const DEFAULTS = { dashboardUrl: "", apiKey: "", activeBoardId: "", activeBoardName: "" }

async function getSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) }
}

async function api(path, { method = "GET", body } = {}) {
  const s = await getSettings()
  if (!s.dashboardUrl || !s.apiKey) {
    throw new Error("Falta configurar la extensión: abre su ícono y pon la URL del dashboard y tu API key.")
  }
  let res
  try {
    res = await fetch(s.dashboardUrl.replace(/\/+$/, "") + path, {
      method,
      headers: {
        Authorization: `Bearer ${s.apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error("No se pudo conectar con el dashboard. Revisa la URL y que la extensión tenga permiso sobre ese dominio.")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status} del dashboard`)
  return data
}

// ── Graph API con la sesión del usuario (Ads Manager) ──────────────
// El token sale de la pestaña del Ads Manager y se usa SOLO aquí, contra
// Meta. Al dashboard nunca se le manda: solo las URLs del MP4/imagen.

const GRAPH_HOSTS = ["https://graph.facebook.com/v21.0", "https://adsmanager-graph.facebook.com/v21.0"]
const AD_FIELDS =
  "name,effective_status,account_id,campaign{name}," +
  "creative{thumbnail_url,image_url,image_hash,video_id,body,title,object_story_spec," +
  "asset_feed_spec{videos{video_id,thumbnail_url},images{url,hash},bodies{text}}}"

// Uso de los límites de Meta (0–100 %) según la última respuesta. Las
// peticiones van con la sesión del usuario: cuentan contra los mismos
// límites que su Ads Manager, así que la auditoría se pausa sola antes de
// llegar al tope (ver content/audit.js).
let lastUsage = 0

function usageFrom(res) {
  let max = 0
  const read = (name) => {
    try { return JSON.parse(res.headers.get(name) || "null") } catch { return null }
  }
  const app = read("x-app-usage")
  if (app) max = Math.max(max, app.call_count || 0, app.total_time || 0, app.total_cputime || 0)
  const acc = read("x-ad-account-usage")
  if (acc) max = Math.max(max, acc.acc_id_util_pct || 0)
  const buc = read("x-business-use-case-usage")
  if (buc) {
    for (const list of Object.values(buc)) {
      for (const u of Array.isArray(list) ? list : []) max = Math.max(max, u.call_count || 0, u.total_time || 0, u.total_cputime || 0)
    }
  }
  return max
}

async function graph(path, params, token) {
  let lastError = null
  for (const base of GRAPH_HOSTS) {
    const url = new URL(base + path)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set("access_token", token)
    try {
      const res = await fetch(url)
      lastUsage = usageFrom(res)
      const json = await res.json()
      if (!json.error) return json
      // 4/17/32/613 = límite de uso alcanzado: avisar claro, no reintentar.
      if ([4, 17, 32, 613].includes(json.error.code)) {
        lastUsage = 100
        throw new Error("Meta pidió bajar el ritmo (límite de uso). Espera unos minutos y vuelve a intentar.")
      }
      lastError = new Error(json.error.message || "Error de Meta")
      // Error de permisos/objeto: el otro host va a decir lo mismo.
      if (json.error.code !== 190 && json.error.code !== 102) throw lastError
    } catch (e) {
      lastError = e
      if (!(e instanceof TypeError)) break // TypeError = falló la red → probar el otro host
    }
  }
  throw lastError
}

async function resolveAdWithSession(adId, token) {
  let ad
  try {
    ad = await graph(`/${adId}`, { fields: AD_FIELDS }, token)
  } catch (e) {
    return { error: e.message }
  }
  const c = ad.creative || {}
  const story = c.object_story_spec || {}
  const link = story.link_data || {}
  const vd = story.video_data || {}
  const feed = c.asset_feed_spec || {}
  const act = ad.account_id ? `act_${ad.account_id}` : null

  const videoId = c.video_id || vd.video_id || feed.videos?.[0]?.video_id ||
    link.child_attachments?.find((x) => x.video_id)?.video_id || null
  let videoUrl = null
  let picture = null
  let videoError = null
  if (videoId) {
    try {
      const v = await graph(`/${videoId}`, { fields: "source,picture" }, token)
      videoUrl = v.source || null
      picture = v.picture || null
    } catch (e) {
      videoError = e.message
    }
    // Algunos videos solo se leen a través de la cuenta publicitaria.
    if (!videoUrl && act) {
      try {
        const r = await graph(`/${act}/advideos`, {
          fields: "id,source,picture",
          filtering: JSON.stringify([{ field: "id", operator: "IN", value: [videoId] }]),
        }, token)
        videoUrl = r.data?.[0]?.source || null
        picture = picture || r.data?.[0]?.picture || null
      } catch {}
    }
  }

  let imageUrl = c.image_url || link.picture || feed.images?.[0]?.url || null
  const hash = c.image_hash || link.image_hash || feed.images?.[0]?.hash || link.child_attachments?.[0]?.image_hash
  if (!imageUrl && hash && act) {
    try {
      const r = await graph(`/${act}/adimages`, { hashes: JSON.stringify([hash]), fields: "url" }, token)
      imageUrl = r.data?.[0]?.url || null
    } catch {}
  }
  imageUrl = imageUrl || vd.image_url || picture || c.thumbnail_url || null

  let accountName = null
  if (act) {
    try { accountName = (await graph(`/${act}`, { fields: "name" }, token)).name || null } catch {}
  }

  return {
    name: ad.name || null,
    account_name: accountName,
    campaign_name: ad.campaign?.name || null,
    status: ad.effective_status || null,
    body: c.body || link.message || vd.message || feed.bodies?.[0]?.text || null,
    video_url: videoUrl,
    image_url: imageUrl,
    error: videoId && !videoUrl ? `Meta no devolvió el MP4 con tu sesión${videoError ? ` (${videoError})` : ""}` : null,
  }
}

// Resuelve con la sesión (si hay token) y manda al dashboard. Sin token o
// si la sesión falla, el dashboard intenta con su usuario de sistema.
async function saveAdsManager({ boardId, adIds, token }) {
  const ads = {}
  if (token) {
    for (let i = 0; i < adIds.length; i += 4) {
      const batch = adIds.slice(i, i + 4)
      const resolved = await Promise.all(batch.map((id) => resolveAdWithSession(id, token)))
      batch.forEach((id, j) => { ads[id] = resolved[j] })
    }
  }
  return api("/api/extension/save", { method: "POST", body: { source: "ads_manager", boardId, adIds, ads: token ? ads : undefined } })
}

// Todas las páginas de un edge (sigue paging.next). Entre páginas, una
// pausa corta para no disparar los límites de la cuenta.
async function graphAll(path, params, token, maxPages = 40) {
  const out = []
  let after = null
  for (let page = 0; page < maxPages; page++) {
    const json = await graph(path, after ? { ...params, after } : params, token)
    out.push(...(json.data || []))
    after = json.paging?.next ? json.paging?.cursors?.after : null
    if (!after) break
    await new Promise((r) => setTimeout(r, 250))
  }
  return out
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Lectura de la Graph API con la sesión (auditorías). Regresa también el
  // uso de límites para que el content script decida si pausar.
  if (msg?.type === "graph" || msg?.type === "graphAll") {
    const run = msg.type === "graph"
      ? graph(msg.path, msg.params || {}, msg.token)
      : graphAll(msg.path, msg.params || {}, msg.token, msg.maxPages)
    run.then(
      (data) => sendResponse({ ok: true, data: { data, usage: lastUsage } }),
      (err) => sendResponse({ ok: false, error: err.message, usage: lastUsage }),
    )
    return true
  }
  if (msg?.type === "api") {
    api(msg.path, msg).then(
      (data) => sendResponse({ ok: true, data }),
      (err) => sendResponse({ ok: false, error: err.message }),
    )
    return true // respuesta asíncrona
  }
  if (msg?.type === "saveAdsManager") {
    saveAdsManager(msg).then(
      (data) => sendResponse({ ok: true, data }),
      (err) => sendResponse({ ok: false, error: err.message }),
    )
    return true
  }
  if (msg?.type === "settings") {
    getSettings().then((s) => sendResponse({ ok: true, data: { ...s, apiKey: s.apiKey ? "set" : "" } }))
    return true
  }
  if (msg?.type === "setActiveBoard") {
    chrome.storage.local.set({ activeBoardId: msg.id, activeBoardName: msg.name }).then(() => sendResponse({ ok: true }))
    return true
  }
})
