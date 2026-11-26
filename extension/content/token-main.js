// Corre en el MUNDO DE LA PÁGINA del Ads Manager (world: "MAIN"), no en el
// aislado de la extensión: solo aquí se ven las variables de Facebook.
// Le pasa al content script el token de acceso de la sesión del usuario
// cuando se lo pide. El token no sale del navegador: la extensión lo usa
// para pedirle a Meta el creativo y al dashboard solo le manda las URLs.

;(() => {
  const find = () => {
    try {
      if (typeof window.__accessToken === "string" && window.__accessToken.startsWith("EAA")) return window.__accessToken
    } catch {}
    return null
  }
  document.addEventListener("amx:get-token", () => {
    document.dispatchEvent(new CustomEvent("amx:token", { detail: find() }))
  })
})()
