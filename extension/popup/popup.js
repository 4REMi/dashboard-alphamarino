// Popup: conexión con el dashboard, board activo y envío desde la pestaña
// actual (Ads Manager) o por IDs pegados a mano.

const $ = (id) => document.getElementById(id)
const send = (msg) =>
  new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(msg, (res) => (res?.ok ? resolve(res.data) : reject(new Error(res?.error || chrome.runtime.lastError?.message || "Error")))),
  )

let boards = []

function showMsg(text, kind = "", link) {
  const el = $("msg")
  el.hidden = !text
  el.className = `msg ${kind}`
  el.textContent = text
  if (link) {
    el.append(document.createElement("br"))
    const a = document.createElement("a")
    a.href = link
    a.target = "_blank"
    a.textContent = "Abrir board"
    el.append(a)
  }
}

function originOf(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null
    return `${u.protocol}//${u.hostname}/*`
  } catch {
    return null
  }
}

async function loadBoards(selectId) {
  const settings = await send({ type: "settings" })
  ;({ boards } = await send({ type: "api", path: "/api/extension/boards" }))
  const sel = $("board")
  sel.replaceChildren()
  if (!boards.length) sel.append(new Option("— Crea un board abajo —", ""))
  for (const b of boards) sel.append(new Option(`${b.name} (${b.ad_count})`, b.id))
  sel.value = selectId || settings.activeBoardId || boards[0]?.id || ""
  if (sel.value) await setActive(sel.value)
}

async function setActive(id) {
  const b = boards.find((x) => x.id === id)
  if (b) await send({ type: "setActiveBoard", id: b.id, name: b.name })
}

// Token de la sesión del Ads Manager de la pestaña activa (si es una).
// Sin él, el dashboard intenta con su usuario de sistema.
async function sessionToken() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!/facebook\.com/.test(tab?.url || "") || !/adsmanager/.test(tab.url)) return null
    const res = await chrome.tabs.sendMessage(tab.id, { type: "getAccessToken" })
    return res?.data || null
  } catch {
    return null
  }
}

function viaLabel(ok) {
  const session = ok.filter((r) => r.via === "session").length
  const system = ok.filter((r) => r.via === "system_user").length
  if (session && !system) return " (con tu sesión)"
  if (system && !session) return " (con el usuario de sistema)"
  return ""
}

async function sendAds(adIds, button) {
  const boardId = $("board").value
  if (!boardId) return showMsg("Elige o crea un board primero.", "err")
  const board = boards.find((b) => b.id === boardId)
  const label = button.textContent
  button.disabled = true
  button.textContent = `Guardando ${adIds.length}… (los videos tardan)`
  showMsg("")
  try {
    const token = await sessionToken()
    const { results } = await send({ type: "saveAdsManager", boardId, adIds, token })
    const ok = results.filter((r) => r.ok)
    const lines = [`✓ ${ok.length} de ${results.length} guardado(s) en "${board?.name}"${viaLabel(ok)}`]
    for (const r of results) {
      if (!r.ok) lines.push(`✗ ${r.id}: ${r.error}`)
      else if (r.warning) lines.push(`⚠ ${r.name}: ${r.warning}`)
    }
    const settings = await send({ type: "settings" })
    showMsg(lines.join("\n"), ok.length === results.length && !results.some((r) => r.warning) ? "ok" : ok.length ? "warn" : "err",
      ok.length ? `${settings.dashboardUrl.replace(/\/+$/, "")}/ad-lab/boards/${boardId}` : undefined)
    loadBoards(boardId).catch(() => {})
  } catch (e) {
    showMsg(e.message, "err")
  } finally {
    button.disabled = false
    button.textContent = label
  }
}

async function describeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url || ""
  const section = $("page-section")
  const info = $("page-info")
  const btn = $("send-selected")
  section.hidden = false
  btn.hidden = true

  if (/adsmanager|\/adsmanager\//.test(url) && /facebook\.com/.test(url)) {
    let ids = []
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "getSelectedAdIds" })
      ids = res?.data || []
    } catch {
      info.textContent = "Recarga la pestaña del Ads Manager para activar la extensión."
      return
    }
    if (!ids.length) {
      info.textContent = "Ads Manager: marca uno o más anuncios en la pestaña «Anuncios» (o abre uno para editarlo) y vuelve aquí."
      return
    }
    info.textContent = `Ads Manager: ${ids.length} anuncio(s) seleccionado(s).`
    btn.hidden = false
    btn.textContent = `Enviar ${ids.length} al board`
    btn.onclick = () => sendAds(ids, btn)
  } else if (/facebook\.com\/ads\/library/.test(url)) {
    info.textContent = "Biblioteca de anuncios: usa el botón «Guardar» que aparece en cada anuncio."
  } else {
    info.textContent = "Abre el Ads Manager o la Biblioteca de anuncios de Meta."
  }
}

async function init() {
  const settings = await send({ type: "settings" })
  $("url").value = settings.dashboardUrl
  if (!settings.dashboardUrl || !settings.apiKey) {
    $("settings").open = true
    return
  }
  try {
    const me = await send({ type: "api", path: "/api/extension/me" })
    $("status").textContent = me.name || "Conectado"
    $("status").className = "pill ok"
    $("board-section").hidden = false
    $("manual").hidden = false
    await loadBoards()
    await describeTab()
  } catch (e) {
    $("settings").open = true
    showMsg(e.message, "err")
  }
}

$("save-settings").addEventListener("click", async () => {
  const url = $("url").value.trim().replace(/\/+$/, "")
  const key = $("key").value.trim()
  const origin = originOf(url)
  if (!origin) return showMsg("La URL debe empezar con https://", "err")
  // permissions.request debe ir antes de cualquier await (gesto del usuario).
  const granted = await chrome.permissions.request({ origins: [origin] })
  if (!granted) return showMsg("Sin permiso sobre ese dominio la extensión no puede hablar con el dashboard.", "err")
  const update = { dashboardUrl: url }
  if (key) update.apiKey = key
  await chrome.storage.local.set(update)
  $("key").value = ""
  showMsg("")
  await init()
  if ($("status").classList.contains("ok")) $("settings").open = false
})

$("board").addEventListener("change", (e) => setActive(e.target.value))

$("create-board").addEventListener("click", async () => {
  const name = $("new-board").value.trim()
  if (!name) return
  try {
    const { board } = await send({ type: "api", path: "/api/extension/boards", method: "POST", body: { name } })
    $("new-board").value = ""
    await loadBoards(board.id)
  } catch (e) {
    showMsg(e.message, "err")
  }
})

$("send-manual").addEventListener("click", () => {
  const ids = [...new Set($("manual-ids").value.split(/[\s,;]+/).filter((x) => /^\d{5,25}$/.test(x)))]
  if (!ids.length) return showMsg("Pega al menos un ID de anuncio (solo números).", "err")
  if (ids.length > 25) return showMsg("Máximo 25 anuncios por envío.", "err")
  sendAds(ids, $("send-manual"))
})

init().catch((e) => showMsg(e.message, "err"))
