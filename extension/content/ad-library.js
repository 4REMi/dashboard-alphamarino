// Biblioteca de anuncios de Meta: un botón "Guardar" en cada tarjeta.
//
// Las clases CSS de Facebook están ofuscadas y cambian, así que la tarjeta
// se encuentra por su texto: "ID de la biblioteca: 123…" / "Library ID:
// 123…". Desde ese texto se sube por el DOM mientras el contenedor siga
// teniendo UN solo ID — el último ancestro así es la tarjeta completa.
// La media se lee al hacer clic (los videos cargan perezosamente).

;(() => {
  const { send, toast, pickBoard, reportResults, root } = window.__AMX

  const ID_RE = /(?:Library ID|ID de la biblioteca|Identificador de la biblioteca|ID de biblioteca|ID da biblioteca)\s*[:：]?\s*(\d{6,25})/i
  const ID_RE_G = new RegExp(ID_RE.source, "gi")

  const style = document.createElement("style")
  style.textContent = `
    .amx-save { position: absolute; top: 8px; right: 8px; z-index: 5; padding: 6px 12px; border-radius: 999px;
                border: 1px solid #3f3f46; background: #0b0b0f; color: #fafafa; font: 600 12px -apple-system, "Segoe UI", Roboto, sans-serif;
                cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
    .amx-save:hover { background: #18181b; }
    .amx-save[disabled] { opacity: .6; cursor: progress; }
    .amx-save.done { border-color: #16a34a; }
  `
  // Los botones viven dentro de cada tarjeta (no en el shadow root común),
  // cada uno con su propio shadow root para aislar estilos.
  void root

  function countIds(el) {
    return (el.textContent.match(ID_RE_G) || []).length
  }

  function findCard(textEl) {
    let card = textEl
    for (let i = 0; i < 25; i++) {
      const parent = card.parentElement
      if (!parent || parent === document.body || parent.getAttribute("role") === "main") break
      if (countIds(parent) > 1) break
      card = parent
    }
    return card
  }

  function largestImage(card) {
    let best = null
    let bestArea = 0
    for (const img of card.querySelectorAll("img")) {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      if (w < 150 || h < 150) continue // avatares de página, íconos
      if (w * h > bestArea) { best = img; bestArea = w * h }
    }
    return best?.currentSrc || best?.src || null
  }

  function extract(card, archiveId) {
    const video = card.querySelector("video")
    let videoUrl = video?.currentSrc || video?.src || video?.querySelector("source")?.src || null
    if (videoUrl?.startsWith("blob:")) videoUrl = null

    const body = card.querySelector('[style*="white-space: pre-wrap"], [style*="white-space:pre-wrap"]')?.textContent?.trim() || null

    // Nombre de la página: primer enlace a un perfil de Facebook con texto corto.
    let pageName = null
    for (const a of card.querySelectorAll("a[href]")) {
      const t = a.textContent.trim()
      if (t && t.length <= 80 && /facebook\.com\/(?!ads\/library)/.test(a.href)) { pageName = t; break }
    }

    let pageId = null
    const pageLink = card.querySelector('a[href*="view_all_page_id="]')
    if (pageLink) pageId = new URL(pageLink.href).searchParams.get("view_all_page_id")

    return {
      ad_archive_id: archiveId,
      page_name: pageName,
      page_id: pageId,
      body,
      video_url: videoUrl,
      image_url: video?.poster || largestImage(card),
    }
  }

  function addButton(card, archiveId) {
    if (getComputedStyle(card).position === "static") card.style.position = "relative"
    const host = document.createElement("div")
    host.setAttribute("data-amx-btn", archiveId)
    const shadow = host.attachShadow({ mode: "open" })
    shadow.append(style.cloneNode(true))
    const btn = document.createElement("button")
    btn.className = "amx-save"
    btn.textContent = "Guardar"
    shadow.append(btn)
    card.append(host)

    btn.addEventListener("click", async (e) => {
      e.preventDefault()
      e.stopPropagation()
      let board
      try {
        board = await pickBoard({ x: e.clientX - 150, y: e.clientY + 12, subtitle: `Anuncio ${archiveId}` })
      } catch (err) {
        return toast(err.message, "err")
      }
      if (!board) return

      const ad = extract(card, archiveId)
      btn.disabled = true
      btn.textContent = "Guardando…"
      try {
        const { results } = await send({ type: "api", path: "/api/extension/save", method: "POST", body: { source: "ad_library", boardId: board.id, ad } })
        await reportResults(results, board)
        if (results[0]?.ok) {
          btn.classList.add("done")
          btn.textContent = `✓ ${board.name}`.slice(0, 28)
        } else {
          btn.textContent = "Guardar"
        }
      } catch (err) {
        toast(err.message, "err")
        btn.textContent = "Guardar"
      } finally {
        btn.disabled = false
      }
    })
  }

  function scan() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (ID_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    })
    const hits = []
    while (walker.nextNode()) hits.push(walker.currentNode)
    for (const node of hits) {
      const el = node.parentElement
      if (!el || el.closest("[data-amx-card]")) continue
      const archiveId = node.nodeValue.match(ID_RE)[1]
      const card = findCard(el)
      if (card.hasAttribute("data-amx-card")) continue
      card.setAttribute("data-amx-card", archiveId)
      addButton(card, archiveId)
    }
  }

  let timer = null
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(scan, 600)
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  scan()

  // Para pruebas automáticas del extractor.
  window.__AMX.adLibrary = { scan, extract, findCard }
})()
