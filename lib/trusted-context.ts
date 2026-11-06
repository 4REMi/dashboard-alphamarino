import { AsyncLocalStorage } from "node:async_hooks"

// Contexto de servidor de confianza para las server actions que aceptan un
// `actingProfileId` (las que reusa el MCP) o que solo debe llamar el bot de
// Telegram (markTaskDoneFromBot).
//
// Problema que resuelve: todo lo exportado de un archivo "use server" es un
// endpoint público. Si una action confía en un `actingProfileId` que llega
// como argumento, cualquiera puede llamarla directo (POST con el id de la
// action) pasando el id de un admin y saltarse la sesión.
//
// Solución: el id solo vale si coincide con el perfil que ESTA MISMA
// petición ya autenticó en el servidor. app/api/mcp/route.ts abre el
// contexto con runTrusted y verifyMcpToken (lib/mcp/auth.ts) fija el perfil
// tras validar el token; la ruta del webhook de Telegram abre el suyo tras
// validar el secreto. Una llamada a la action desde el navegador corre sin
// contexto → se rechaza. AsyncLocalStorage propaga el contexto por toda la
// cadena async de la petición y no se puede fijar desde afuera.
//
// SIN "use server" a propósito: nada de esto debe quedar expuesto.

export type TrustedSource = "mcp" | "telegram" | "cron"
interface TrustedStore { source: TrustedSource; profileId?: string }

// En globalThis para que haya una sola instancia aunque Next empaquete este
// módulo en más de un bundle (ruta y actions).
const g = globalThis as unknown as { __amTrustedContext?: AsyncLocalStorage<TrustedStore> }
const storage = (g.__amTrustedContext ??= new AsyncLocalStorage<TrustedStore>())

export function runTrusted<T>(source: TrustedSource, fn: () => T): T {
  return storage.run({ source }, fn)
}

// Lo llama verifyMcpToken después de validar el token.
export function setTrustedProfile(profileId: string): void {
  const store = storage.getStore()
  if (store) store.profileId = profileId
}

// Primera línea de cada action con `actingProfileId`. Sin valor → camino
// normal con sesión (UI). Con valor → debe ser el perfil autenticado de
// esta petición del MCP; si no, se rechaza.
export function assertActingProfile(actingProfileId: string | null | undefined): void {
  if (!actingProfileId) return
  const store = storage.getStore()
  if (!store?.profileId || store.profileId !== actingProfileId) throw new Error("Not authenticated")
}

// ¿Corre esta petición dentro de un contexto de confianza (MCP autenticado,
// webhook de Telegram o cron con CRON_SECRET)?
// En el MCP solo cuenta después de que verifyMcpToken validó el token.
export function isTrustedContext(): boolean {
  const store = storage.getStore()
  if (!store) return false
  return store.source !== "mcp" || !!store.profileId
}

export function assertTrustedSource(source: TrustedSource): void {
  if (storage.getStore()?.source !== source) throw new Error("Not authenticated")
}
