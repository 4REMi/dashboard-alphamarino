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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "api") {
    api(msg.path, msg).then(
      (data) => sendResponse({ ok: true, data }),
      (err) => sendResponse({ ok: false, error: err.message }),
    )
    return true // respuesta asíncrona
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
