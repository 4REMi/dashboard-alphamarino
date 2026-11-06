<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Server actions: verificar SIEMPRE quién llama

Todo lo exportado de un archivo `"use server"` es un **endpoint público**: se puede llamar con un POST directo, sin pasar por la UI, sin el proxy de login y con los argumentos que el atacante quiera. Ocultar un botón en la UI no protege nada.

- La primera línea de cada server action exportada verifica en el servidor: `await requireSessionOrTrusted()` (sesión, o contexto de servidor de confianza: MCP, Telegram, cron) o `await requireRole(["admin", ...])` — ambos en `lib/auth/guards.ts`. Si la UI limita la acción a ciertos roles, exige esos mismos roles aquí.
- Nunca confíes en un id de perfil que llega como argumento (`actingProfileId`): la action debe empezar con `assertActingProfile(actingProfileId)` (`lib/trusted-context.ts`).
- Lógica que no debe ser un endpoint (usa el cliente admin, descarga URLs, llama APIs de pago) va en un módulo SIN `"use server"`, y la action con verificación la llama.
- Funciones públicas a propósito (enlaces compartidos con token, login) van en `ALLOWLIST` de `scripts/check-server-actions.mjs` con su razón.
- Antes de commitear: `pnpm check:actions` (también corre en GitHub Actions).
