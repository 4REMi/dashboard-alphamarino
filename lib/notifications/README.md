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

No hay forma de vincular solo con el número de teléfono — Telegram no lo permite por
privacidad. El flujo es:

1. La persona entra a su propia ficha en Equipo (`/employees/[su-id]`) y genera un código
   (`generateTelegramLinkCode` en `lib/actions/employees.ts`) — válido 15 minutos, se
   guarda en `profiles.telegram_link_code` / `telegram_link_code_expires_at`.
2. Le manda ese código, tal cual, al bot por Telegram.
3. `app/api/telegram-webhook/route.ts` reconoce el mensaje como un código de vinculación
   **antes** de aplicar el filtro de chat permitido (tiene que funcionar desde cualquier
   chat, no solo el tuyo) — si el código es válido y no venció, guarda el `chat_id` del
   remitente en `profiles.telegram_chat_id` y contesta confirmando.

## Eventos activos hoy

| Evento (`event_key`) | Se dispara desde | Desde |
|---|---|---|
| `task_assigned` | `lib/actions/tasks.ts` — `createTask` (si trae `assignee_id`) y `updateTaskAssignee` | 2026-09-08 |
| `project_member_added` | `lib/actions/projects.ts` — `addProjectMember` | 2026-09-08 |

Actualiza esta tabla cada vez que agregues un evento nuevo.

## Ver qué se ha mandado

Configuración → Automatizaciones incluye la bitácora de `notification_log` — quién
recibió qué, cuándo, y si de verdad se envió o se saltó por no tener Telegram vinculado.
