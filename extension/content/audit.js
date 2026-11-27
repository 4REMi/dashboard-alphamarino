// Ads Manager: "Auditar N campañas" → manda las campañas seleccionadas a
// Ad Lab → Auditorías. Ver docs/agent-guides/auditorias.md.
//
// Lee con la SESIÓN de quien usa la extensión (sirve para cuentas propias,
// de clientes o prestadas). Las llamadas van al service worker de una en
// una; este script orquesta porque vive lo que vive la pestaña (el service
// worker puede dormirse en tareas largas).
//
// Cuidado con los límites de Meta: las peticiones cuentan contra los mismos
// límites que el Ads Manager del usuario. Después de cada lectura se revisa
// el uso y, si sube, se pausa sola. En una cuenta prestada un patrón raro
// puede hacer que Facebook le pida verificación: mejor lento que bloqueado.

;(() => {
  const { send, toast, root, getAccessToken } = window.__AMX
  if (!getAccessToken) return

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const params = () => new URLSearchParams(location.search)

  function selectedCampaignIds() {
    for (const src of [location.search, location.hash.replace(/^#/, "?")]) {
      const raw = new URLSearchParams(src).get("selected_campaign_ids")
      if (raw) return [...new Set(raw.split(/[,\s]+/).filter((id) => /^\d{5,25}$/.test(id)))]
    }
    return []
  }
  const accountId = () => (params().get("act") || "").replace(/^act_/, "")

  // ── Lectura de Meta con pausas ───────────────────────────────────
  let onProgress = () => {}
  async function pace(usage) {
    if (usage >= 90) { onProgress(`Pausa de 2 min: tu cuenta de Meta va al ${Math.round(usage)} % de su límite de uso`); await sleep(120_000) }
    else if (usage >= 75) { onProgress(`Pausa de 30 s: límite de uso de Meta al ${Math.round(usage)} %`); await sleep(30_000) }
    else await sleep(400)
  }
  async function graph(type, path, p, token) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, path, params: p, token }, async (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
        await pace(res?.data?.usage ?? res?.usage ?? 0)
        if (!res?.ok) return reject(new Error(res?.error || "Error de Meta"))
        resolve(res.data.data)
      })
    })
  }
  const api = (path, body) => send({ type: "api", path, method: "POST", body })

  // ── De la respuesta de insights a conteos crudos ─────────────────
  // Conversiones con atribución de 7 días después del clic ("7d_click");
  // video y visitas con su valor normal. Se toma UNA variante por evento
  // (omni_* primero) para no contar dos veces lo mismo.
  const EVENT_KEYS = {
    landing_page_view: ["omni_landing_page_view", "landing_page_view"],
    add_to_cart: ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"],
    initiate_checkout: ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"],
    purchase: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  }
  const actionValue = (list, keys, clickOnly) => {
    if (!Array.isArray(list)) return 0
    for (const k of keys) {
      const a = list.find((x) => x.action_type === k)
      if (a) return Number(clickOnly ? (a["7d_click"] ?? 0) : (a["7d_click"] ?? a.value ?? 0)) || 0
    }
    return 0
  }
  const sumList = (list) => (Array.isArray(list) ? list.reduce((s, x) => s + (Number(x.value) || 0), 0) : 0)

  // Todas las acciones del día como { action_type: n } (7 días después del
  // clic cuando Meta lo da). Con esto el dashboard calcula el resultado de
  // cualquier tipo de campaña (mensajes, leads, llamadas…) sin otra captura.
  const actionMap = (list) => {
    const out = {}
    for (const a of Array.isArray(list) ? list : []) {
      const n = Number(a["7d_click"] ?? a.value)
      if (a.action_type && Number.isFinite(n) && n !== 0) out[a.action_type] = n
    }
    return out
  }

  function toCounters(row) {
    return {
      actions: actionMap(row.actions),
      action_values: actionMap(row.action_values),
      ad_id: row.ad_id,
      date: row.date_start,
      impressions: Number(row.impressions) || 0,
      spend: Number(row.spend) || 0,
      video_3s: actionValue(row.actions, ["video_view"], false),
      video_p25: sumList(row.video_p25_watched_actions),
      video_p50: sumList(row.video_p50_watched_actions),
      video_p75: sumList(row.video_p75_watched_actions),
      video_p95: sumList(row.video_p95_watched_actions),
      video_p100: sumList(row.video_p100_watched_actions),
      thruplays: sumList(row.video_thruplay_watched_actions),
      outbound_clicks: sumList(row.outbound_clicks),
      landing_page_views: actionValue(row.actions, EVENT_KEYS.landing_page_view, false),
      add_to_cart: actionValue(row.actions, EVENT_KEYS.add_to_cart, true),
      initiate_checkout: actionValue(row.actions, EVENT_KEYS.initiate_checkout, true),
      purchases: actionValue(row.actions, EVENT_KEYS.purchase, true),
      purchase_value: actionValue(row.action_values, EVENT_KEYS.purchase, true),
    }
  }

  function parseCreative(ad) {
    const c = ad.creative || {}
    const story = c.object_story_spec || {}
    const link = story.link_data || {}
    const vd = story.video_data || {}
    const feed = c.asset_feed_spec || {}
    const videoId = c.video_id || vd.video_id || feed.videos?.[0]?.video_id || link.child_attachments?.find((x) => x.video_id)?.video_id || null
    const image = c.image_url || link.picture || feed.images?.[0]?.url || vd.image_url || c.thumbnail_url || null
    return {
      id: ad.id,
      name: ad.name,
      status: ad.effective_status,
      adset_id: ad.adset_id,
      created_time: ad.created_time,
      format: videoId ? "video" : image ? "image" : "other",
      video_id: videoId,
      image_url: image,
      landing_url: link.link || vd.call_to_action?.value?.link || feed.link_urls?.[0]?.website_url || null,
      body: c.body || link.message || vd.message || feed.bodies?.[0]?.text || null,
    }
  }

  const INSIGHT_FIELDS = [
    "ad_id", "date_start", "impressions", "spend", "actions", "action_values", "outbound_clicks",
    "video_p25_watched_actions", "video_p50_watched_actions", "video_p75_watched_actions",
    "video_p95_watched_actions", "video_p100_watched_actions", "video_thruplay_watched_actions",
  ].join(",")

  // ── Captura completa ─────────────────────────────────────────────
  async function runAudit(campaignIds, days) {
    const token = await getAccessToken()
    if (!token) throw new Error("No se encontró tu sesión del Ads Manager. Recarga la pestaña y espera a que carguen tus campañas.")
    const act = accountId()
    if (!act) throw new Error("No se reconoce la cuenta publicitaria en la dirección de la página (falta act=…).")

    // Mismo período que el «Últimos N días» del Ads Manager: el preset de
    // Meta (last_30d…) se calcula en la zona horaria de la cuenta y NO
    // incluye hoy. Antes se calculaba en UTC con hoy incluido y el período
    // salía corrido un día respecto al Ads Manager.
    const datePreset = `last_${days}d`
    const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    let since, until
    try {
      const r = await graph("graph", `/act_${act}/insights`, { date_preset: datePreset, fields: "date_start,date_stop" }, token)
      since = r.data?.[0]?.date_start
      until = r.data?.[0]?.date_stop
    } catch {}
    if (!since || !until) {
      // Sin datos en la cuenta para ese período: mismo cálculo en hora local.
      const y = new Date(); y.setDate(y.getDate() - 1)
      const s = new Date(y); s.setDate(s.getDate() - (days - 1))
      since = localIso(s); until = localIso(y)
    }
    const iso = (x) => x

    onProgress("Leyendo la cuenta y las campañas…")
    const account = await graph("graph", `/act_${act}`, { fields: "name,currency" }, token)
    const campaigns = []
    for (const id of campaignIds) {
      campaigns.push(await graph("graph", `/${id}`, { fields: "id,name,objective,effective_status" }, token))
    }
    const started = await api("/api/extension/audit/start", {
      account: { id: act, name: account.name, currency: account.currency },
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, objective: c.objective, status: c.effective_status })),
      since: iso(since), until: iso(until),
    })

    const mediaErrors = []
    for (let i = 0; i < campaigns.length; i++) {
      const camp = campaigns[i]
      const label = `Campaña ${i + 1} de ${campaigns.length}`
      onProgress(`${label}: conjuntos y anuncios…`)
      const adsets = await graph("graphAll", `/${camp.id}/adsets`, { fields: "id,name,effective_status,optimization_goal,promoted_object", limit: "200" }, token)
      const rawAds = await graph("graphAll", `/${camp.id}/ads`, {
        fields: "id,name,adset_id,effective_status,created_time,creative{video_id,image_url,thumbnail_url,body,object_story_spec,asset_feed_spec{videos{video_id},images{url},link_urls{website_url},bodies{text}}}",
        limit: "100",
      }, token)
      const ads = rawAds.map(parseCreative)

      onProgress(`${label}: métricas por día…`)
      const daily = await graph("graphAll", `/${camp.id}/insights`, {
        level: "ad", time_increment: "1", date_preset: datePreset, fields: INSIGHT_FIELDS,
        action_attribution_windows: JSON.stringify(["7d_click"]), limit: "500",
      }, token)
      const rows = daily.map(toCounters)

      onProgress(`${label}: retención, alcance y frecuencia…`)
      const curves = await graph("graphAll", `/${camp.id}/insights`, {
        level: "ad", date_preset: datePreset, fields: "ad_id,video_play_curve_actions,reach,frequency,video_avg_time_watched_actions", limit: "500",
      }, token)
      const retention = curves.map((r) => ({
        ad_id: r.ad_id,
        curve: Array.isArray(r.video_play_curve_actions?.[0]?.value) ? r.video_play_curve_actions[0].value : null,
        reach: r.reach ?? null,
        frequency: r.frequency ?? null,
        avg_watch_sec: r.video_avg_time_watched_actions?.[0]?.value ?? null,
      }))

      // Videos: un registro por video (se repiten entre anuncios).
      const videoIds = [...new Set(ads.map((a) => a.video_id).filter(Boolean))]
      const videos = []
      for (let v = 0; v < videoIds.length; v++) {
        onProgress(`${label}: datos de videos ${v + 1}/${videoIds.length}…`)
        try {
          const info = await graph("graph", `/${videoIds[v]}`, { fields: "source,length,picture" }, token)
          videos.push({ id: videoIds[v], source: info.source || null, duration: info.length, picture: info.picture || null })
        } catch {
          // Algunos videos solo se leen a través de la cuenta publicitaria.
          try {
            const r = await graph("graph", `/act_${act}/advideos`, {
              fields: "id,source,length,picture",
              filtering: JSON.stringify([{ field: "id", operator: "IN", value: [videoIds[v]] }]),
            }, token)
            const info = r.data?.[0] || {}
            videos.push({ id: videoIds[v], source: info.source || null, duration: info.length, picture: info.picture || null })
          } catch {
            videos.push({ id: videoIds[v], source: null })
          }
        }
      }

      // Eventos que la cuenta no manda: total 0 con clics suficientes.
      const tot = rows.reduce((t, r) => {
        for (const k of ["outbound_clicks", "landing_page_views", "add_to_cart", "initiate_checkout", "purchases"]) t[k] = (t[k] || 0) + r[k]
        return t
      }, {})
      const missing = (tot.outbound_clicks || 0) >= 200
        ? [["landing_page_view", "landing_page_views"], ["add_to_cart", "add_to_cart"], ["initiate_checkout", "initiate_checkout"], ["purchase", "purchases"]]
            .filter(([, k]) => !tot[k]).map(([e]) => e)
        : []

      onProgress(`${label}: guardando en el dashboard…`)
      const structure = await api("/api/extension/audit/structure", {
        campaignId: camp.id, since: iso(since), until: iso(until),
        adsets: adsets.map((s) => ({ id: s.id, name: s.name, status: s.effective_status, optimization_goal: s.optimization_goal, promoted_object: s.promoted_object })),
        ads, retention, missing_events: missing,
        videos: videos.map((v) => ({ id: v.id, duration: v.duration, picture: v.picture })),
      })
      for (let r = 0; r < rows.length; r += 800) {
        await api("/api/extension/audit/daily", { campaignId: camp.id, rows: rows.slice(r, r + 800) })
      }

      // Copiar media: los enlaces de Meta caducan en horas.
      const pending = new Set(structure.videosToMirror || [])
      const toMirror = videos.filter((v) => pending.has(v.id) && v.source)
      for (let m = 0; m < toMirror.length; m += 3) {
        onProgress(`${label}: copiando videos ${Math.min(m + 3, toMirror.length)}/${toMirror.length}…`)
        const { results } = await api("/api/extension/audit/media", { videos: toMirror.slice(m, m + 3).map((v) => ({ id: v.id, source: v.source })) })
        mediaErrors.push(...results.filter((x) => !x.ok))
      }
      mediaErrors.push(...videos.filter((v) => pending.has(v.id) && !v.source).map((v) => ({ id: v.id, error: "Meta no dio el video" })))
      const imgs = (structure.imagesToMirror || []).map((id) => ({ ad_id: id, url: ads.find((a) => a.id === id)?.image_url }))
      for (let m = 0; m < imgs.length; m += 10) {
        onProgress(`${label}: copiando imágenes…`)
        const { results } = await api("/api/extension/audit/media", { images: imgs.slice(m, m + 10) })
        mediaErrors.push(...results.filter((x) => !x.ok))
      }
    }

    const done = await api("/api/extension/audit/finish", { accountId: act })
    return { accountId: done.accountId || started.accountId, campaigns: campaigns.length, mediaErrors }
  }

  // ── Interfaz: botón flotante + panel ─────────────────────────────
  const style = document.createElement("style")
  style.textContent = `
    .amx-audit-fab { position: fixed; right: 20px; bottom: 72px; display: flex; align-items: center; gap: 8px; padding: 10px 16px;
      border-radius: 999px; border: 1px solid #3f3f46; background: #0b0b0f; color: #fafafa; font-size: 13px; font-weight: 600;
      cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
    .amx-audit-fab[hidden] { display: none; }
    .amx-audit-fab:hover { background: #18181b; }
    .amx-audit-panel { position: fixed; right: 20px; bottom: 124px; width: 320px; background: #0b0b0f; color: #f4f4f5; border: 1px solid #27272a;
      border-radius: 16px; box-shadow: 0 16px 40px rgba(0,0,0,.45); padding: 16px; display: flex; flex-direction: column; gap: 12px; font-size: 13px; }
    .amx-audit-panel[hidden] { display: none; }
    .amx-audit-panel h3 { margin: 0; font-size: 14px; }
    .amx-audit-panel small { color: #a1a1aa; line-height: 1.45; }
    .amx-audit-panel select { height: 36px; border-radius: 8px; border: 1px solid #3f3f46; background: #18181b; color: #f4f4f5; padding: 0 8px; font: inherit; }
    .amx-audit-panel button.go { height: 40px; border-radius: 10px; border: 0; background: #f4f4f5; color: #0b0b0f; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .amx-audit-panel button.go[disabled] { opacity: .6; cursor: progress; }
    .amx-audit-panel .progress { padding: 10px; border: 1px solid #27272a; border-radius: 10px; color: #d4d4d8; line-height: 1.45; }
  `
  root.append(style)

  const fab = document.createElement("button")
  fab.className = "amx-audit-fab"
  fab.hidden = true
  const panel = document.createElement("div")
  panel.className = "amx-audit-panel"
  panel.hidden = true
  panel.innerHTML = `
    <h3>Enviar a Auditorías</h3>
    <small class="sel"></small>
    <label style="display:flex;flex-direction:column;gap:4px;color:#d4d4d8">Período
      <select class="days"><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="7">Últimos 7 días</option></select>
    </label>
    <small>Se lee con tu sesión de Facebook (no sale del navegador). Va despacio a propósito para no saturar la cuenta.</small>
    <div class="progress" hidden></div>
    <button class="go">Enviar al dashboard</button>`
  root.append(fab, panel)
  const goBtn = panel.querySelector(".go")
  const progress = panel.querySelector(".progress")

  let running = false
  function refresh() {
    const ids = selectedCampaignIds()
    if (!running) fab.hidden = ids.length === 0
    fab.textContent = `Auditar ${ids.length} campaña${ids.length === 1 ? "" : "s"}`
    panel.querySelector(".sel").textContent = `${ids.length} campaña${ids.length === 1 ? "" : "s"} seleccionada${ids.length === 1 ? "" : "s"} · cuenta act_${accountId()}`
    if (!ids.length && !running) panel.hidden = true
  }
  fab.addEventListener("click", () => { panel.hidden = !panel.hidden; refresh() })

  goBtn.addEventListener("click", async () => {
    const ids = selectedCampaignIds()
    if (!ids.length) return
    if (ids.length > 10) return toast("Máximo 10 campañas por auditoría.", "err")
    running = true
    goBtn.disabled = true
    progress.hidden = false
    onProgress = (t) => { progress.textContent = t }
    try {
      const res = await runAudit(ids, Number(panel.querySelector(".days").value))
      const settings = await send({ type: "settings" })
      const base = (settings.dashboardUrl || "").replace(/\/+$/, "")
      const warn = res.mediaErrors.length ? `\n⚠ ${res.mediaErrors.length} archivo(s) no se pudieron copiar.` : ""
      toast(`✓ ${res.campaigns} campaña(s) en Auditorías.${warn}`, res.mediaErrors.length ? "warn" : "ok", {
        ms: 15000,
        link: base && res.accountId ? { href: `${base}/ad-lab/auditorias/${res.accountId}`, label: "Abrir auditoría" } : undefined,
      })
      panel.hidden = true
    } catch (e) {
      toast(`La auditoría se detuvo: ${e.message}\nLo ya enviado se conserva; vuelve a intentarlo para completar.`, "err", { ms: 20000 })
    } finally {
      running = false
      goBtn.disabled = false
      progress.hidden = true
      refresh()
    }
  })

  let lastUrl = ""
  setInterval(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; refresh() }
  }, 700)

  window.__AMX.audit = { runAudit, toCounters, parseCreative, selectedCampaignIds }
})()
