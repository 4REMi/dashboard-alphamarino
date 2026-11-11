import type { McpServer } from "@modelcontextprotocol/server"

// Límite general para cada herramienta del MCP. /api/mcp corre en una
// función de Vercel que muere a los 300 s ("Task timed out"): el cliente
// (Claude, ChatGPT) se queda sin respuesta y suele reintentar, repitiendo
// el trabajo. Con este límite, si una herramienta tarda demasiado el chat
// recibe un mensaje claro a los 270 s, antes de que Vercel corte.
export const TOOL_DEADLINE_MS = 270_000

export function withToolDeadlines(server: McpServer) {
  const register = server.registerTool.bind(server) as (...a: unknown[]) => unknown
  ;(server as unknown as { registerTool: (...a: unknown[]) => unknown }).registerTool = (name: unknown, config: unknown, cb: unknown) => {
    const handler = cb as (...args: unknown[]) => Promise<unknown>
    const wrapped = async (...args: unknown[]) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
          console.error(`[mcp] ${String(name)} pasó de ${TOOL_DEADLINE_MS / 1000} s`)
          resolve({
            isError: true,
            content: [{
              type: "text",
              text: `⏱️ "${String(name)}" tardó más de ${TOOL_DEADLINE_MS / 1000} segundos y se detuvo la espera (límite del servidor). Puede que una parte se haya hecho: revisa antes de repetirla. Si es una acción de escritura, NO la reintentes automáticamente.`,
            }],
          })
        }, TOOL_DEADLINE_MS)
      })
      try {
        return await Promise.race([handler(...args), timeout])
      } finally {
        clearTimeout(timer)
      }
    }
    return register(name, config, wrapped)
  }
}
