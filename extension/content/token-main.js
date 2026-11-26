// Corre en el MUNDO DE LA PÁGINA del Ads Manager (world: "MAIN",
// document_start), no en el aislado de la extensión: solo aquí se ven las
// variables y las llamadas de red de Facebook.
//
// Busca el token de acceso de la sesión del usuario, en este orden:
//   1. Las llamadas que el propio Ads Manager hace a la Graph API
//      (fetch/XHR llevan `access_token=EAA…`). Es lo más robusto: no
//      depende de dónde guarde Meta el token, solo de que la página lo use.
//   2. window.__accessToken (donde Meta lo dejaba antes).
// Se lo pasa al content script cuando lo pide. El token no sale del
// navegador: la extensión lo usa contra Meta y al dashboard solo le manda
// las URLs del video/imagen.

;(() => {
  const TOKEN_RE = /(?:^|[?&"\s])access_token=(EAA[A-Za-z0-9]{20,})/
  let seen = null

  const inspect = (value) => {
    try {
      if (!value) return
      let text = null
      if (typeof value === "string") text = value
      else if (value instanceof URL) text = value.href
      else if (value instanceof URLSearchParams) text = "?" + value.toString()
      else if (value instanceof FormData) {
        const t = value.get("access_token")
        if (typeof t === "string" && t.startsWith("EAA")) seen = t
        return
      } else if (typeof Request !== "undefined" && value instanceof Request) text = value.url
      if (text && text.includes("access_token=EAA")) {
        const m = text.match(TOKEN_RE)
        if (m) seen = m[1]
      }
    } catch {}
  }

  const origFetch = window.fetch
  window.fetch = function (input, init) {
    inspect(input)
    inspect(init?.body)
    return origFetch.apply(this, arguments)
  }

  const origOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (_method, url) {
    inspect(typeof url === "string" ? url : url?.href)
    return origOpen.apply(this, arguments)
  }
  const origSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function (body) {
    inspect(body)
    return origSend.apply(this, arguments)
  }

  const find = () => {
    if (seen) return seen
    try {
      if (typeof window.__accessToken === "string" && window.__accessToken.startsWith("EAA")) return window.__accessToken
    } catch {}
    return null
  }

  document.addEventListener("amx:get-token", () => {
    document.dispatchEvent(new CustomEvent("amx:token", { detail: find() }))
  })
})()
