# Servidor MCP (`/api/mcp`) — Guía para agentes

**Ruta:** `/api/mcp` (endpoint, no una página) — la UI para generar keys vive en
`/employees/[id]` (tu propio perfil, sección "API keys de IA (MCP)")
**Para quién:** cualquier empleado con sesión — cada persona genera su propia key
**Actualizado:** 2026-09-18

## Qué es y para qué sirve

Un servidor MCP (Model Context Protocol) remoto que deja usar un chat de IA
(Claude, o cualquier cliente compatible con MCP) como un TERCER canal de entrada
al dashboard — junto a la UI normal y Captura rápida — sin abrir el dashboard ni
estar en el grupo de Telegram. Alguien con su key personal configurada le escribe
en lenguaje natural a Claude ("créame una tarea para revisar el brief de GARMAC
para el viernes") y Claude llama la tool correspondiente, que ejecuta la MISMA
lógica que ya usa Captura rápida.

**Decisión explícita, distinta a como funciona Telegram**: cada tool call corre
con los MISMOS permisos que ya tiene esa persona en el dashboard
(`lib/permissions.ts`), nunca con un bypass de rol de servicio. El bot de
Telegram sí hace ese bypass (`createAdminClient()` sin checar permisos) — es una
decisión deliberada y ya tomada de ESE camino, que se dejó intacto a propósito
("está funcionando perfectamente"); MCP es un camino nuevo y separado, construido
más estricto desde el inicio, no una copia de cómo funciona Telegram.

## Conceptos y vocabulario clave

- **API key personal** (`mcp_api_keys`): un token que cada empleado genera desde
  su propio perfil (`components/employees/mcp-api-keys.tsx`) — nadie puede generar
  la de otra persona, mismo criterio que vincular Telegram. Se guarda solo su
  hash SHA-256; el valor real se muestra una sola vez al crearla.
- **`actingProfileId`**: el parámetro nuevo (opcional, al final) que se le agregó
  a las server actions reales que MCP reusa (`createTask`, `updateTaskStatus`,
  `addLogEntry`) — cuando viene con un valor, la función salta el
  `supabase.auth.getUser()` normal (una llamada de MCP no tiene cookies/sesión de
  navegador) y en su lugar corre el MISMO chequeo de permiso contra ESE profile,
  vía el cliente admin. Cuando se omite (la UI normal, Captura rápida), la
  función se comporta exactamente igual que antes — es un parámetro aditivo, no
  un cambio de comportamiento para nadie más.
- **Resolución de proyecto/persona por nombre**: un chat no tiene el `<select>`
  de proyecto que sí tiene Captura rápida — las tools de MCP reciben el NOMBRE
  (`proyecto`, `asignado_a`) y lo resuelven con un `ilike` parcial
  (`lib/mcp/tools.ts`). Cero coincidencias o 2+ coincidencias ambiguas se
  regresan como error de texto (para que el chat le pida a la persona ser más
  específica), nunca se adivina cuál. Implementado aparte del bot de Telegram
  (que ya resuelve nombres parecido) a propósito — MCP no debe depender de
  código interno del bot.

## Cómo hacer las acciones comunes

**Generar tu API key**: `/employees/[tu-id]` → sección "API keys de IA (MCP)" →
nombre descriptivo (ej. "Claude en mi laptop") → "Generar key". Copia la key Y la
URL del endpoint que se muestran — la key no se vuelve a mostrar completa después.

**Configurar el cliente de MCP**: en Claude (o el cliente que sea), agregar un
conector remoto con esa URL (`https://tu-dashboard.com/api/mcp`) y la key como
Bearer token. Se configura una vez, no por conversación.

**Revocar una key**: mismo lugar, ícono de basura junto a la key — efecto
inmediato, cualquier cliente que la esté usando deja de poder llamar tools.

**Agregar una tool nueva** (expandir la superficie poco a poco, como se acordó):
1. Reusa una server action REAL que ya exista — nunca dupliques la lógica de
   negocio dentro de `lib/mcp/tools.ts`.
2. Si esa action no acepta ya un `actingProfileId` opcional, agrégaselo (ver el
   patrón exacto en `requireTaskPermission`, `lib/actions/tasks.ts`, y en
   `addLogEntry`, `lib/actions/projects.ts`) — nunca le quites su chequeo de
   permiso normal para el camino con sesión.
3. Registra la tool en `registerMcpTools` (`lib/mcp/tools.ts`) con
   `server.registerTool(nombre, {title, description, inputSchema}, handler)` —
   el handler recibe `(args, ctx)`, y el profile que está llamando sale de
   `ctx.http?.authInfo?.extra?.profileId` (ver `requireProfileId` en el mismo
   archivo).

## Reglas y restricciones

- **Nunca bypass de permisos**: toda tool nueva debe pasar por el mismo chequeo
  de `lib/permissions.ts` que ya usa el dashboard — si algo no tiene hoy un
  chequeo de rol explícito (ej. `addLogEntry`, que solo pide estar logueado),
  la tool de MCP hereda exactamente esa misma laxitud, ni más ni menos.
- **No se toca el bot de Telegram** — su propio camino (bypass de permisos vía
  rol de servicio, resolución de identidad por chat_id) se queda intacto, es una
  decisión ya tomada y confirmada explícitamente que no se revisita aquí.
- **`withMcpAuth` (`mcp-handler`) NO es OAuth real** aquí — se usa solo como el
  mecanismo para validar un Bearer token y adjuntar datos a `ctx.http.authInfo`;
  el verificador (`lib/mcp/auth.ts`) es una consulta directa a `mcp_api_keys`,
  nada de flujos de autorización.
- **Ambigüedad en la resolución por nombre nunca se adivina** — 0 o 2+ matches
  de proyecto/persona/tarea siempre regresan un error de texto listando las
  opciones, para que el chat le pida a la persona ser más específica.
- **Empieza chico a propósito**: hoy solo 3 tools (`crear_tarea`,
  `completar_tarea`, `agregar_nota_proyecto`) — el mismo par de acciones que ya
  tiene Captura rápida, más completar tarea. Servicios/Finanzas/Ad Nodes/etc. se
  agregan cuando se pidan, no de antemano.

## Quién puede ver/hacer qué

Cualquier empleado con sesión puede generar su propia key y usar las tools — el
límite real es el mismo que ya tiene esa persona en el dashboard (ej. si su rol
no tiene `manage_tasks`, `crear_tarea`/`completar_tarea` le van a fallar con
"Permission denied", igual que le pasaría en la UI normal).

## Dónde vive esto en el código

- `supabase/migrations/081_mcp_api_keys.sql` — tabla `mcp_api_keys`.
- `lib/actions/mcp-keys.ts` — CRUD de keys (generar/listar/revocar), sesión normal.
- `lib/mcp/auth.ts` — `verifyMcpToken`, el verificador de `withMcpAuth`.
- `lib/mcp/tools.ts` — `registerMcpTools`, las tools + resolución de
  proyecto/persona por nombre.
- `app/api/mcp/route.ts` — el endpoint (`createMcpHandler` + `withMcpAuth` de
  `mcp-handler`, sobre `@modelcontextprotocol/server`).
- `components/employees/mcp-api-keys.tsx` — UI para generar/revocar, montada en
  `app/(dashboard)/employees/[id]/page.tsx` (sección self-only, junto a Telegram).
- `lib/actions/tasks.ts` (`requireTaskPermission`, `createTask`,
  `updateTaskStatus`) y `lib/actions/projects.ts` (`addLogEntry`) — el parámetro
  `actingProfileId` opcional que estas mismas funciones reales ahora aceptan.
