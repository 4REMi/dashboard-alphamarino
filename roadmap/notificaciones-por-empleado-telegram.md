# Notificaciones individuales por Telegram según lo que le toca a cada quien

**Estado:** idea
**Área:** Telegram / Equipo
**Agregado:** 2026-09-08

## Contexto
Hoy todo el bot de Telegram gira alrededor de un solo chat (`TELEGRAM_ALLOWED_CHAT_ID`) —
un único destinatario para todo: confirmaciones de gastos, tareas, notas, etc. La idea es
que cada persona del equipo tenga su propio chat_id de Telegram registrado, y que el
dashboard les mande notificaciones directas cuando les pase algo relevante a su puesto:
se les asigna una tarea, se les agrega a un proyecto, etc.

## Qué implicaría
No existe hoy ningún campo para guardar un chat_id por persona — ni en `profiles` ni en
ningún lado (se confirmó revisando las migraciones). Piezas necesarias:

1. **Guardar el chat_id de cada quien.** Requiere que cada persona le escriba una vez a un
   bot para que Telegram revele su chat_id (no hay forma de obtenerlo solo con el número
   de teléfono — Telegram no expone eso por privacidad). Lo más simple: un comando `/start`
   que el bot ya no maneja hoy (`app/api/telegram-webhook/route.ts` solo procesa mensajes
   normales) — la persona le escribe `/start` al bot, el bot responde con un código, esa
   persona pega el código en su perfil del dashboard, y ahí queda vinculado su chat_id
   con su `profile_id`.
2. **Un campo nuevo** en `profiles` (ej. `telegram_chat_id`), y una forma de sacar el
   `TELEGRAM_ALLOWED_CHAT_ID` actual de "único chat permitido" a "uno de varios chats
   conocidos" — cambio de arquitectura, no solo un campo nuevo.
2a. Ojo: el filtro de seguridad actual (`TELEGRAM_ALLOWED_CHAT_ID`) asume un solo chat
   de confianza. Pasar a multi-chat implica repensar ese filtro — probablemente contra
   la lista de `telegram_chat_id` ya vinculados en `profiles`, en vez de un valor fijo.
3. **Enganchar el envío** en los puntos donde ya se asignan cosas — `updateTaskAssignee`,
   `createTask` (cuando trae `assignee_id`), agregar miembro a proyecto
   (`addProjectMember`), etc. — para que cada uno dispare un `sendMessage()` al chat_id
   de la persona afectada (si lo tiene vinculado).

## Preguntas abiertas
- ¿Qué eventos exactamente ameritan notificación? (tarea asignada, agregado a proyecto,
  ¿algo más? — vale la pena acotarlo para no saturar a la gente de mensajes)
- ¿Opt-in obligatorio (nadie recibe nada hasta que vincule su Telegram) o se asume que
  todos lo van a querer?
- ¿Se necesita algo similar para quien NO usa Telegram, o se queda estrictamente opcional?

## Por qué no ahora
Mencionada como idea a futuro, sin mapear el diseño a fondo — el punto más grande es que
cambia el modelo actual de "un solo chat de confianza" a "varios chats vinculados por
persona", que toca la seguridad del webhook y no es un cambio trivial.
