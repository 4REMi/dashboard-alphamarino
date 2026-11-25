// Utilidades compartidas por los content scripts (Ads Manager y Ad Library):
// hablar con el service worker, el selector de board y los avisos.
// Todo lo visual vive en un Shadow DOM para que el CSS de Facebook no lo
// toque (ni el nuestro a Facebook).

;(() => {
  if (window.__AMX) return

  const send = (msg) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
        if (!res?.ok) return reject(new Error(res?.error || "Error desconocido"))
        resolve(res.data)
      })
    })

  // ── Shadow root único ───────────────────────────────────────────
  const host = document.createElement("div")
  host.id = "amx-root"
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; inset: auto 0 0 auto;"
  const root = host.attachShadow({ mode: "open" })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
      .toast { background: #0b0b0f; color: #f4f4f5; border: 1px solid #27272a; border-radius: 12px; padding: 10px 14px;
               font-size: 13px; line-height: 1.4; max-width: 360px; box-shadow: 0 8px 24px rgba(0,0,0,.35); white-space: pre-line; }
      .toast.ok { border-color: #16a34a; } .toast.err { border-color: #dc2626; } .toast.warn { border-color: #d97706; }
      .toast a { color: #a5b4fc; }
      .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.25); }
      .picker { position: fixed; width: 300px; max-height: 420px; display: flex; flex-direction: column; background: #0b0b0f; color: #f4f4f5;
                border: 1px solid #27272a; border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,.45); overflow: hidden; }
      .picker header { padding: 12px 14px 8px; font-size: 13px; font-weight: 600; }
      .picker header small { display: block; font-weight: 400; color: #a1a1aa; margin-top: 2px; }
      .picker input { margin: 0 12px 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid #27272a; background: #18181b; color: #f4f4f5; font-size: 13px; outline: none; }
      .picker input:focus { border-color: #6366f1; }
      .list { overflow-y: auto; padding: 0 6px 6px; }
      .item { display: flex; justify-content: space-between; gap: 8px; width: 100%; text-align: left; padding: 8px 10px; border: 0; border-radius: 8px;
              background: transparent; color: inherit; font-size: 13px; cursor: pointer; }
      .item:hover, .item.active { background: #1f1f23; }
      .item small { color: #71717a; }
      .item.new { color: #a5b4fc; }
      .empty { padding: 12px; color: #a1a1aa; font-size: 12px; }
    </style>
    <div class="toasts"></div>`
  const mount = () => document.documentElement.appendChild(host)
  if (document.body) mount()
  else document.addEventListener("DOMContentLoaded", mount)

  function toast(text, kind = "", { link, ms = 6000 } = {}) {
    const el = document.createElement("div")
    el.className = `toast ${kind}`
    el.textContent = text
    if (link) {
      el.append(document.createElement("br"))
      const a = document.createElement("a")
      a.href = link.href
      a.target = "_blank"
      a.textContent = link.label
      el.append(a)
    }
    root.querySelector(".toasts").append(el)
    if (ms) setTimeout(() => el.remove(), ms)
    return el
  }

  // ── Selector de board ───────────────────────────────────────────
  // Resuelve con { id, name } o null si se cierra sin elegir.
  async function pickBoard({ x, y, title, subtitle } = {}) {
    const [{ boards }, settings] = await Promise.all([send({ type: "api", path: "/api/extension/boards" }), send({ type: "settings" })])

    return new Promise((resolve) => {
      const backdrop = document.createElement("div")
      backdrop.className = "backdrop"
      const box = document.createElement("div")
      box.className = "picker"
      const left = Math.max(8, Math.min((x ?? window.innerWidth - 316), window.innerWidth - 308))
      const top = Math.max(8, Math.min((y ?? window.innerHeight - 436), window.innerHeight - 428))
      box.style.left = `${left}px`
      box.style.top = `${top}px`

      const header = document.createElement("header")
      header.textContent = title || "Guardar en board"
      if (subtitle) {
        const s = document.createElement("small")
        s.textContent = subtitle
        header.append(s)
      }
      const input = document.createElement("input")
      input.placeholder = "Buscar o crear board…"
      const list = document.createElement("div")
      list.className = "list"
      box.append(header, input, list)

      const close = (value) => {
        backdrop.remove()
        box.remove()
        document.removeEventListener("keydown", onKey, true)
        resolve(value)
      }
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); close(null) }
      }
      document.addEventListener("keydown", onKey, true)
      backdrop.addEventListener("click", () => close(null))

      const choose = async (board) => {
        await send({ type: "setActiveBoard", id: board.id, name: board.name })
        close(board)
      }

      const render = () => {
        const q = input.value.trim().toLowerCase()
        list.replaceChildren()
        const matches = boards.filter((b) => b.name.toLowerCase().includes(q))
        // El último board usado va primero.
        matches.sort((a, b) => (b.id === settings.activeBoardId) - (a.id === settings.activeBoardId))
        for (const b of matches) {
          const btn = document.createElement("button")
          btn.className = `item${b.id === settings.activeBoardId ? " active" : ""}`
          const name = document.createElement("span")
          name.textContent = b.name
          const count = document.createElement("small")
          count.textContent = b.ad_count
          btn.append(name, count)
          btn.addEventListener("click", () => choose(b))
          list.append(btn)
        }
        if (q && !boards.some((b) => b.name.toLowerCase() === q)) {
          const btn = document.createElement("button")
          btn.className = "item new"
          btn.textContent = `+ Crear board "${input.value.trim()}"`
          btn.addEventListener("click", async () => {
            btn.disabled = true
            try {
              const { board } = await send({ type: "api", path: "/api/extension/boards", method: "POST", body: { name: input.value.trim() } })
              await choose(board)
            } catch (e) {
              toast(e.message, "err")
              btn.disabled = false
            }
          })
          list.append(btn)
        }
        if (!list.children.length) {
          const empty = document.createElement("div")
          empty.className = "empty"
          empty.textContent = "No hay boards todavía. Escribe un nombre para crear uno."
          list.append(empty)
        }
      }
      input.addEventListener("input", render)
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") list.querySelector("button")?.click()
      })
      render()
      root.append(backdrop, box)
      input.focus()
    })
  }

  // Resume los resultados de /api/extension/save en un aviso.
  async function reportResults(results, board) {
    const settings = await send({ type: "settings" })
    const ok = results.filter((r) => r.ok)
    const failed = results.filter((r) => !r.ok)
    const warned = ok.filter((r) => r.warning)
    const lines = []
    if (ok.length) lines.push(`✓ ${ok.length} guardado${ok.length === 1 ? "" : "s"} en "${board.name}"`)
    for (const r of warned) lines.push(`⚠ ${r.name || r.id}: ${r.warning}`)
    for (const r of failed) lines.push(`✗ ${r.id}: ${r.error}`)
    toast(lines.join("\n"), failed.length ? (ok.length ? "warn" : "err") : warned.length ? "warn" : "ok", {
      ms: failed.length || warned.length ? 15000 : 7000,
      link: ok.length && settings.dashboardUrl
        ? { href: `${settings.dashboardUrl.replace(/\/+$/, "")}/ad-lab/boards/${board.id}`, label: "Abrir board" }
        : undefined,
    })
  }

  window.__AMX = { send, toast, pickBoard, reportResults, root }
})()
