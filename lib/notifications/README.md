# Sistema de notificaciones

Manda notificaciones individuales por Telegram a miembros del equipo cuando les pasa
algo relevante (se les asigna una tarea, los agregan a un proyecto, etc.), sin depender
del chat único que usa el bot de automatización (`TELEGRAM_ALLOWED_CHAT_ID`).

## Cómo está armado

- **`events.ts`** — el catálogo de eventos. Es la fuente de verdad: si un evento no está
  aquí, no existe. Cada entrada tiene un `label` y un `build(data)` que arma el texto del
  mensaje. TypeScript obliga a que el payload que le pasas a `notify()` tenga exactamente
  los campos que ese evento espera.
- **`notify.ts`** — la función que se llama desde cualquier parte del código:
  `notify(profileId, "task_assigned", { taskTitle, projectName })`. Busca si esa persona
  tiene Telegram vinculado (`profiles.telegram_chat_id`), manda el mensaje si sí, y
  **siempre** deja un registro en `notification_log` (enviado / falló / sin canal
  vinculado) — nunca truena la acción que la llamó, aunque el envío falle.

## Cómo agregar un evento nuevo

1. Agrega una entrada en `NOTIFICATION_EVENTS` (`events.ts`) con su `label` y su `build()`.
2. Llama `notify(profileId, "tu_evento_nuevo", { ...datos })` en el punto del código donde
   pasa ese evento.

Nada más. No hay que tocar la tabla, ni el webhook, ni ningún otro archivo.

## Vincular Telegram (por persona, una sola vez)

Bot de la agencia: **@iceberg_alpha** (`https://t.me/iceberg_alpha`) — el username está
también hardcodeado en `components/employees/telegram-link.tsx` (constante `BOT_USERNAME`)
para el link directo que se muestra en pantalla. Si el bot cambia de username algún día,
actualizar en ambos lugares.

No hay forma de vincular solo con el número de teléfono — Telegram no lo permite por
privacidad. El flujo, para cualquier persona del equipo:

1. Entra a su propia ficha en Equipo (`/employees/[su-id]`) — sección "Notificaciones
   por Telegram" — y le da a **"Generar código"**.
2. Abre **@iceberg_alpha** en Telegram (hay un link directo en esa misma pantalla).
3. Le manda ese código, tal cual, como mensaje de texto normal — vence en 15 minutos.
4. El bot le contesta confirmando y desde ahí le llegan sus notificaciones ahí.

Por dentro: `generateTelegramLinkCode` (`lib/actions/employees.ts`) guarda el código en
`profiles.telegram_link_code` / `telegram_link_code_expires_at`.
`app/api/telegram-webhook/route.ts` reconoce el mensaje como un código de vinculación
**antes** de aplicar el filtro de chat permitido (tiene que funcionar desde cualquier
chat, no solo el tuyo) — si el código es válido y no venció, guarda el `chat_id` del
remitente en `profiles.telegram_chat_id`, marca `telegram_linked_at`, y contesta confirmando.

## Desvincular

`unlinkTelegram(profileId)` (`lib/actions/employees.ts`) — lo puede hacer la propia
persona (desde su ficha) o un admin (desde Configuración → Estado de vinculación, por
ejemplo al offboardear a alguien o si perdió acceso a su teléfono). Limpia
`telegram_chat_id` y marca `telegram_unlinked_at`; `telegram_linked_at` se conserva como
histórico de la última vez que sí estuvo vinculado. Si esa persona vuelve a vincularse
después, `telegram_linked_at` se actualiza y `telegram_unlinked_at` se limpia.

## Preferencias por tipo de notificación

Cada persona (o un admin, por ella) puede apagar tipos de notificación específicos sin
desvincular su Telegram — `profiles.notification_preferences` (jsonb), mismo modelo
opt-out que `profiles.permissions`: ausente o `true` = activo, `false` explícito = apagado
para ese `event_key`. `notify()` respeta esto y lo registra en `notification_log` con
status `skipped_disabled` (distinto de `skipped_no_channel`, que es no tener Telegram
vinculado en absoluto). UI: `components/employees/notification-preferences.tsx`, reusada
tanto en la ficha propia del empleado como en la tabla de admin en Configuración.

## Eventos activos hoy

| Evento (`event_key`) | Se dispara desde | Desde |
|---|---|---|
| `task_assigned` | `lib/actions/tasks.ts` — `createTask` (si trae `assignee_id`) y `updateTaskAssignee` | 2026-09-08 |
| `project_member_added` | `lib/actions/projects.ts` — `addProjectMember` | 2026-09-08 |

Actualiza esta tabla cada vez que agregues un evento nuevo.

## Ver qué se ha mandado

Configuración → Automatizaciones incluye la bitácora de `notification_log` — quién
recibió qué, cuándo, y si de verdad se envió o se saltó por no tener Telegram vinculado.
