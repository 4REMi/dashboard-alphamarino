// Ads Manager: botón flotante "Enviar N anuncios a un board".
//
// Los IDs salen de la URL (`selected_ad_ids`), que Ads Manager actualiza al
// marcar casillas en la pestaña Anuncios o al abrir un anuncio para
// editarlo. No se intenta sacar el video de la página — Ads Manager lo
// reproduce por streaming (blob:). Con el token de la sesión del usuario
// (getAccessToken), el service worker le pide a la Graph API el MP4
// original; así funciona con cualquier cuenta que esa persona vea.

;(() => {
  const { send, toast, pickBoard, reportResults, root } = window.__AMX

  function selectedAdIds() {
    const sources = [location.search, location.hash.replace(/^#/, "?")]
    for (const src of sources) {
      const raw = new URLSearchParams(src).get("selected_ad_ids")
      if (raw) return [...new Set(raw.split(/[,\s]+/).filter((id) => /^\d{5,25}$/.test(id)))]
    }
    return []
  }

  // Token de acceso de la sesión del Ads Manager. Primero lo pide al
  // script del mundo de la página (token-main.js); si no, lo busca en los
  // <script> en línea, donde Facebook lo deja escrito.
  let cachedToken = null
  function tokenFromPage() {
    return new Promise((resolve) => {
      const done = (e) => { clearTimeout(t); resolve(typeof e?.detail === "string" ? e.detail : null) }
      const t = setTimeout(() => { document.removeEventListener("amx:token", done); resolve(null) }, 400)
      document.addEventListener("amx:token", done, { once: true })
      document.dispatchEvent(new CustomEvent("amx:get-token"))
    })
  }
  function tokenFromScripts() {
    const patterns = [/__accessToken\s*=\s*"(EAA[A-Za-z0-9]+)"/, /"accessToken"\s*:\s*"(EAA[A-Za-z0-9]+)"/, /"(EAA[A-Za-z0-9]{60,})"/]
    for (const script of document.querySelectorAll("script:not([src])")) {
      const text = script.textContent
      if (!text || !text.includes("EAA")) continue
      for (const re of patterns) {
        const m = text.match(re)
        if (m) return m[1]
      }
    }
    return null
  }
  async function getAccessToken() {
    if (cachedToken) return cachedToken
    cachedToken = (await tokenFromPage()) || tokenFromScripts()
    return cachedToken
  }
  // Lo usa también content/audit.js (auditorías de campañas).
  window.__AMX.getAccessToken = getAccessToken

  const style = document.createElement("style")
  style.textContent = `
    .amx-fab { position: fixed; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 8px; padding: 10px 16px;
               border-radius: 999px; border: 1px solid #3f3f46; background: #0b0b0f; color: #fafafa; font-size: 13px; font-weight: 600;
               cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
    .amx-fab[hidden] { display: none; }
    .amx-fab:hover { background: #18181b; }
    .amx-fab[disabled] { opacity: .6; cursor: progress; }
    .amx-fab .dot { width: 8px; height: 8px; border-radius: 50%; background: #6366f1; }
  `
  root.append(style)

  const fab = document.createElement("button")
  fab.className = "amx-fab"
  fab.hidden = true
  root.append(fab)

  let busy = false
  function refresh() {
    if (busy) return
    const ids = selectedAdIds()
    fab.hidden = ids.length === 0
    fab.innerHTML = `<span class="dot"></span>`
    fab.append(`Enviar ${ids.length} anuncio${ids.length === 1 ? "" : "s"} a un board`)
  }

  fab.addEventListener("click", async () => {
    const ids = selectedAdIds()
    if (!ids.length) return
    if (ids.length > 25) return toast("Máximo 25 anuncios por envío. Selecciona menos.", "err")

    const rect = fab.getBoundingClientRect()
    let board
    try {
      board = await pickBoard({ x: rect.right - 300, y: rect.top - 430, subtitle: `${ids.length} anuncio${ids.length === 1 ? "" : "s"} seleccionado${ids.length === 1 ? "" : "s"}` })
    } catch (e) {
      return toast(e.message, "err")
    }
    if (!board) return

    busy = true
    fab.disabled = true
    fab.textContent = `Guardando ${ids.length}… (los videos tardan)`
    try {
      const token = await getAccessToken()
      const { results } = await send({ type: "saveAdsManager", boardId: board.id, adIds: ids, token })
      await reportResults(results, board)
    } catch (e) {
      toast(e.message, "err")
    } finally {
      busy = false
      fab.disabled = false
      refresh()
    }
  })

  // Ads Manager es una SPA: la URL cambia sin recargar.
  let lastUrl = ""
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      refresh()
    }
  }, 700)

  // El popup también puede pedir los IDs seleccionados.
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type === "getSelectedAdIds") sendResponse({ ok: true, data: selectedAdIds() })
    if (msg?.type === "getAccessToken") {
      getAccessToken().then((token) => sendResponse({ ok: true, data: token }))
      return true
    }
  })
})()
