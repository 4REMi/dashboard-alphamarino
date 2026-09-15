# Ciclos de Paid Media — Guía para agentes

**Ruta:** dentro de `/projects/[id]` — tarjeta "Ciclo Activo" (solo proyectos de tipo Paid Media)
**Para quién:** ambos, con partes admin-only (ver "Quién puede ver/hacer qué")
**Actualizado:** 2026-09-15

## Qué es y para qué sirve

Un ciclo (`paid_media_cycles`) es el periodo mensual (u otro rango) de gestión de ads de
un proyecto — inversión, ROAS/CPA/CPL reales, estado de campañas, entrega de reporte.
Solo hay un ciclo activo (`is_active = true`) por proyecto a la vez; abrir uno nuevo
cierra automáticamente el anterior. Conceptos y assets del Creative Tracker
(`creative_concepts`/`creative_assets`) se ligan a un ciclo por `cycle_id` — un simple
FK fijado al crearse, nunca recalculado a partir de las fechas.

## Conceptos y vocabulario clave

- **Fechas erróneas al abrir un ciclo**: pasa (alguien teclea mal el mes). Es seguro
  corregirlas después, incluso con conceptos ya activos — el vínculo concepto↔ciclo es
  por `cycle_id`, nunca por fecha, así que corregir `start_date`/`end_date` no mueve
  ningún concepto de lugar.
- **Aviso preventivo** (`cycle_ending_soon`): se manda una sola vez por ciclo, ~4 días
  antes de `end_date`, a todo el equipo del proyecto.
- **Aviso de vencido** (`cycle_overdue`): se manda una sola vez, el primer día que el
  chequeo diario detecta que `end_date` ya pasó y el ciclo sigue `is_active`. No
  insiste día tras día — la idea es un aviso, no spam.
- **Auto-cierre (`projects.auto_close_cycles`)**: opt-in por proyecto, apagado en todos
  por default. Con esto activado, un ciclo vencido se cierra solo (en vez de mandar el
  aviso de vencido) y se notifica que se cerró automáticamente. Nunca es un default
  global — cada proyecto lo decide por separado.
- **Chequeo diario** (`app/api/cron/check-cycles`): la PRIMERA pieza de infraestructura
  tipo cron de este proyecto. Nada más lo dispara — necesita un scheduler externo (ver
  "Reglas y restricciones").

## Cómo hacer las acciones comunes

**Corregir las fechas de un ciclo activo**: botón "Corregir fechas" junto al
encabezado de la tarjeta (visible solo con el permiso `edit_cycle_dates`) — abre un
mini-formulario de fecha inicio/fin. Al guardar, resetea el rastro de avisos ya
mandados para ese ciclo (para que la fecha corregida tenga su propio chequeo fresco).

**Activar/desactivar auto-cierre para un proyecto**: franja arriba de la tarjeta del
ciclo, solo visible para admin/subadmin.

**Disparar el chequeo diario manualmente** (para probar): `curl` a
`/api/cron/check-cycles` con header `Authorization: Bearer <CRON_SECRET>`.

## Reglas y restricciones

- El chequeo diario **solo considera proyectos con `status = "Active"`** — un ciclo
  vencido dentro de un proyecto ya archivado/completado no genera ningún aviso
  (nadie está trabajando ahí, no es un pendiente real de nadie).
- El chequeo diario es **idempotente por ciclo** — corre las veces que sea, cada aviso
  (`end_warning_sent_at`/`overdue_notice_sent_at`) se manda una sola vez por ciclo. No
  hay riesgo de duplicar notificaciones si se dispara más de una vez el mismo día.
- **No hay scheduler dentro de este proyecto** — `vercel.json` declara el cron
  (`"0 14 * * *"`, diario) asumiendo despliegue en Vercel con Cron Jobs habilitado. Si
  el hosting cambia, hay que apuntar cualquier scheduler externo a ese mismo endpoint
  con el mismo header.
- **Variable de entorno requerida**: `CRON_SECRET` — sin ella configurada, el endpoint
  rechaza toda petición con 500 (nunca corre sin secreto, ni por accidente).
- Cerrar un ciclo (manual o automático) nunca borra nada — solo cambia `is_active`.

## Quién puede ver/hacer qué

- **Corregir fechas de un ciclo**: gateado por `edit_cycle_dates`
  (`lib/permissions.ts`) — default `true` para admin/subadmin, `false` para empleado,
  pero es un override real por persona como cualquier otro permission key.
- **Activar auto-cierre por proyecto**: admin/subadmin únicamente.
- **Avisos de ciclo** (preventivo, vencido, auto-cerrado): a todo `project_members` del
  proyecto — mismo patrón de broadcast que Ping.

## Dónde vive esto en el código

- `supabase/migrations/050_paid_media_cycle_date_ranges.sql` — `start_date`/`end_date`
  originales.
- `supabase/migrations/077_cycle_dates_and_autoclose.sql` — `projects.auto_close_cycles`
  + `paid_media_cycles.end_warning_sent_at`/`overdue_notice_sent_at`.
- `lib/actions/projects.ts` — `updateCycleDates`, `updateProjectAutoCloseCycles`,
  `runDailyCycleCheck` (llamada por el endpoint de cron).
- `app/api/cron/check-cycles/route.ts` — endpoint diario, autenticado por
  `CRON_SECRET`.
- `vercel.json` — declaración del cron (`"0 14 * * *"`).
- `components/projects/hub/paid-media-cycle-card.tsx` — `CycleDatesEditor`,
  `AutoCloseCyclesSetting`, badge "Vencido".
- `lib/notifications/events.ts` — `cycle_ending_soon`, `cycle_overdue`,
  `cycle_auto_closed`.
- `lib/permissions.ts` — `edit_cycle_dates`.
