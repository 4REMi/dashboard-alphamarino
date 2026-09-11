# Tareas — Guía para agentes

**Ruta:** `/tasks`
**Para quién:** ambos (admin ve más — ver "Quién puede ver/hacer qué")
**Actualizado:** 2026-09-11

## Qué es y para qué sirve

`/tasks` es el punto central para ver y gestionar pendientes — tanto los que
pertenecen a un tablero de proyecto compartido con el equipo, como los que son
puramente personales de quien los ve. No es el único lugar donde existen tareas: el
tablero de tareas dentro de cada proyecto (`/projects/[id]`) sigue siendo donde vive
la ejecución día a día de un proyecto estandarizado — `/tasks` es la vista que cruza
TODOS los proyectos a la vez, más la lista personal, en un solo lugar.

El problema que resuelve: antes de esto, ver "qué tengo pendiente" implicaba entrar
proyecto por proyecto. Ahora hay una pantalla de overview (un recuadro por proyecto +
uno para lo personal) con el conteo de pendientes de cada quien, y un flujo de
"Captura rápida" para dictar/escribir varios pendientes de golpe sin tener que
navegar a cada proyecto uno por uno.

## Conceptos y vocabulario clave

- **Tarea**: registro en la tabla `tasks`. Puede o no tener `project_id`.
- **"Mi lista"**: la vista personal de quien está viendo la pantalla — tareas sin
  proyecto, o tareas ligadas a un proyecto pero marcadas `is_personal`. Cada persona
  tiene su propia "Mi lista"; nunca es compartida ni visible para otros (salvo el
  admin vía la auditoría de Equipo, ver abajo).
- **Personal (`is_personal`)**: una tarea puede tener un proyecto real asignado Y
  estar marcada como personal al mismo tiempo. Esto la saca del tablero compartido
  del proyecto (nadie del equipo la ve ahí, no cuenta en el progreso del proyecto),
  pero la mantiene agrupada bajo ese proyecto dentro de "Mi lista", para dar
  contexto. Úsalo para detalles menores que no le importan al resto del equipo pero
  sí están ligados a un proyecto real. Sin proyecto, una tarea ya es personal por
  definición — el toggle solo es relevante cuando SÍ hay proyecto.
- **Captura rápida**: un flujo de dictado/texto libre (botón en la esquina superior
  de `/tasks`) que interpreta un párrafo largo y lo desglosa en varias tareas y/o
  notas de bitácora de distintos proyectos a la vez. Nada se crea hasta que se
  confirma cada item en una vista previa editable.
- **Alcance visible** ("Visible para el equipo" / "Solo yo la veo"): en Captura
  rápida, cada tarea con proyecto muestra explícitamente su alcance (equivalente al
  toggle `is_personal`) — nunca es un default silencioso, siempre hay que verlo y
  confirmarlo.
- **Tarea huérfana**: una tarea sin `project_id` Y sin `assignee_id`. Es
  estructuralmente invisible en cualquier otra vista (no cae en ningún tablero de
  proyecto ni en ninguna "Mi lista"). Pasa cuando algo dictado por voz no menciona
  proyecto ni responsable Y el auto-asignado falló (ver "Reglas y restricciones").

## Cómo hacer las acciones comunes

**Ver mis pendientes**: entra a `/tasks`, clic en "Mi lista" — agrupa automáticamente
por proyecto (más un grupo "Sin proyecto"), no es una lista plana.

**Ver el tablero de un proyecto específico**: clic en su recuadro en el overview.
Muestra solo las tareas NO personales de ese proyecto (las marcadas `is_personal` de
ese proyecto solo se ven en "Mi lista" de quien las tenga asignadas).

**Crear una tarea puntual**: botón "+ Nueva Tarea" (arriba a la derecha, en overview
o dentro de un proyecto). Si se crea desde `/tasks`, se puede elegir el proyecto (o
dejarla sin proyecto); si se crea desde dentro de un proyecto, ya queda ligada a ese
proyecto automáticamente.

**Volcar varios pendientes de golpe (Captura rápida)**: botón "Captura rápida" en el
overview. Escribe/dicta libremente mencionando proyectos, personas, fechas — el
sistema separa automáticamente tareas vs. notas de bitácora por proyecto. Revisa la
vista previa (proyecto/responsable/alcance de cada item, todo editable), descarta lo
que no aplique, y confirma. El panel se puede minimizar (clic afuera, o el botón de
colapsar) sin perder lo escrito — solo "Cancelar" descarta de verdad.

**Expandir todo un tablero de golpe**: botón "Expandir todo"/"Colapsar todo" en la
barra de cada tabla de tareas. En "Mi lista" hay un botón adicional arriba que
expande TODAS las tablas de todos los proyectos a la vez.

**Crear una tarea por voz (Telegram/Vowen)**: dicta de forma natural, mencionando
proyecto/responsable si aplica — no hace falta decir "crea una tarea", cualquier
pendiente implícito ya se clasifica como tarea. Para marcarla personal por voz, hay
que decirlo explícito ("que esto quede solo para mí", "no es para el equipo") —
nunca se infiere del contenido.

## Reglas y restricciones

- **Sin proyecto mencionado por voz → se auto-asigna a quien dictó**, vía la
  variable de entorno `TELEGRAM_BOT_AUTHOR_ID`. Si esa variable no está configurada
  (o apunta a un perfil inválido), la tarea queda huérfana — invisible en cualquier
  parte del dashboard. El overview de `/tasks` muestra un aviso admin-only si esto
  llega a pasar, con una tabla editable para asignarlas ahí mismo.
- **`is_personal` por voz solo aplica si hay proyecto mencionado.** Sin proyecto, el
  flag no tiene efecto (ya es personal por sí sola).
- **Una nota de bitácora SIEMPRE necesita proyecto.** No existe "nota personal
  suelta" — si no se puede resolver el proyecto, Captura rápida bloquea la
  confirmación hasta que se elija uno o se descarte esa nota.
- **El toggle "Personal" NO aparece dentro del hub de un proyecto** (solo en
  `/tasks`) — es intencional: dentro de un proyecto estandarizado, cualquier tarea
  que un empleado cree ahí se espera que sea del tablero compartido, sin la opción
  de sacarla de ahí sin querer.
- **La vista de auditoría "Equipo" (admin-only) es editable, no de solo lectura**:
  se puede eliminar una tarea de un empleado directamente ahí (con confirmación), o
  marcarla como hecha en un clic sin tener que rastrear a la persona — pensado para
  limpiar/resolver pendientes mal dictados por voz sin ensuciarle la lista a nadie.
- Cambiar de proyecto (crear uno nuevo, mover una tarea) **no tiene una acción de
  "cambiar el project_id de una tarea existente"** todavía — solo se define al
  crearla.

## Quién puede ver/hacer qué

- **Empleado**: ve su propia "Mi lista" y los proyectos donde es miembro. No ve la
  sección "Equipo" del overview.
- **Admin**: ve todos los proyectos activos (sea miembro o no), más la sección
  "Equipo" — chips con el conteo de pendientes de cada persona, que llevan a una
  tabla editable (eliminar tarea) de esa persona. También ve el aviso de tareas
  huérfanas si existen.

## Dónde vive esto en el código

- `components/tasks/tasks-client.tsx` — overview, detalle por proyecto, "Mi lista"
  agrupada, auditoría de Equipo, aviso de huérfanas.
- `components/tasks/task-table.tsx` — tabla de tareas reusable (agrupación por
  estado/fase, modal de detalle, checklist, toggle Personal).
- `components/tasks/task-form.tsx` — formulario de creación/edición.
- `components/tasks/standup-dump.tsx` — Captura rápida.
- `lib/actions/tasks.ts` — `createTask`, `updateTask`, `deleteTask`,
  `getMyPendingTaskCount`, etc.
- `lib/actions/standup.ts` — clasificación de Captura rápida (`processStandup`).
- `lib/telegram-bot/handlers/tareas.ts` — creación/completado de tareas por voz.
- `lib/telegram-bot/classify.ts` — clasificador de mensajes (incluye el campo
  `personal` para el flag por voz).
- `supabase/migrations/070_task_personal_scope.sql` — columna `tasks.is_personal`.
- `lib/notifications/` — `task_assigned` se dispara al asignar (por dashboard o por
  voz a alguien más, no en auto-asignación a uno mismo).
