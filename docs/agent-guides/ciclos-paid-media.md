# Ciclos de Paid Media — Guía para agentes

**Ruta:** dentro de `/projects/[id]` — tarjeta "Ciclo Activo" (solo proyectos de tipo Paid Media)
**Para quién:** ambos, con partes admin-only (ver "Quién puede ver/hacer qué")
**Actualizado:** 2026-09-23

## Qué es y para qué sirve

Un ciclo (`paid_media_cycles`) es el periodo mensual (u otro rango) de gestión de ads de
un proyecto — estado de campañas, creativos y conceptos del periodo (los entregables
recurrentes como reporte mensual o producción creativa viven en "Alcance del servicio",
no en el ciclo). Solo hay un
ciclo activo (`is_active = true`) por proyecto a la vez; abrir uno nuevo cierra
automáticamente el anterior. Conceptos y assets del Creative Tracker
(`creative_concepts`/`creative_assets`) se ligan a un ciclo por `cycle_id` — un simple
FK fijado al crearse, nunca recalculado a partir de las fechas.

**Las métricas reales (inversión, CTR, costo/resultado, ROAS) ya NO se capturan a
mano en esta tarjeta.** Las columnas `real_spend`/`roas_real`/`cpa_real`/`cpl_real`/
`real_results` de `paid_media_cycles` siguen existiendo en la base pero quedaron
deprecadas — el formulario que las llenaba se quitó porque duplicaba trabajo: el
"real" ahora se deriva automáticamente del sync de Meta a nivel de AD individual
(`meta_ads`/`meta_ad_daily_stats`, ver el panel "Creativos" — `components/projects/
hub/creative-performance-grid.tsx` y `lib/actions/paid-media-performance.ts`). Lo
mismo con `paid_media_context.target_roas/target_cpa/target_cpl/target_leads_per_month/
monthly_ad_budget` — quedaron deprecados sin UI; el objetivo de la cuenta ahora es
solo informativo (`main_objective`), y la vigilancia de threshold real es terreno de
reglas de agente (todavía no construidas), no de un target estático comparado a mano.

**Grid creative-first ("Creativos")**: reemplazó la tabla de campañas de Meta
(`MetaCampaignsPanel`, eliminado). La unidad primaria es el AD individual, no la
campaña — cada tarjeta trae su propia miniatura + las métricas que el proyecto
configuró mostrar (`paid_media_context.display_metrics`, picker de métricas en
"Contexto de Cuenta") + un delta de tendencia (`trend_window`: los mismos presets de
Meta Ads Manager — ayer/últimos 3-7-14 días/inicio del ciclo —, con override opcional
por campaña en `campaign_trend_overrides`).
El sync (`syncMetaAds`) trae insights con `time_increment=1` — una fila por ad por
día en `meta_ad_daily_stats` — para poder calcular esa tendencia sin depender de cada
cuándo alguien sincroniza. `creative_asset_meta_ads` es el puente many-to-many entre
un `creative_assets` (con su `concept_id`, persona, ángulo) y el `ad_id` real de Meta
en el que se volvió — se vincula desde la propia tarjeta ("Vincular a concepto"),
nunca bloqueante, nunca un paso obligatorio upstream.

**Código de color del asset** (`lib/utils/asset-review-tone.ts`, el mismo del
Creative Tracker): verde = aprobado, rojo = cambios pedidos, ámbar = borrador,
neutro = en revisión del cliente. En el modal de vincular los aprobados salen
primero y son los únicos con "Vincular"; los demás dicen "Vincular sin aprobar"
y piden confirmación. En el mapa cada asset lleva ese color, su estado escrito y
"En campaña" o "Sin ad vinculado · no se ha probado".

**Escala (cuentas con muchos creativos corriendo a la vez)**: dos cosas
pensadas para cuando una cuenta tiene 80+ creativos, no solo 4-8.
- **Picker "Elegir campañas"** antes de sincronizar — `getMetaCampaignOptions`
  lista las campañas de la cuenta, se eligen cuáles importan, y `syncMetaAds`
  filtra el insights fetch por `campaign.id` (el edge de insights SÍ soporta
  `filtering` — a diferencia de `/ads`, que lo ignora en silencio, ver el fix
  de `video_url` justo abajo). La selección se guarda en
  `paid_media_context.synced_campaign_ids` — no se vuelve a preguntar en cada
  sync, solo cuando se cambia desde ese mismo picker. Vacío/null = sincroniza
  todas (comportamiento de siempre, sin filtro).
- **Barra de orden + filtro** sobre el grid ya sincronizado — ordenar por
  "peor tendencia primero" (default, calculado sobre las métricas que el
  proyecto tenga configuradas, no una fija), por inversión, o por nombre;
  filtrar por campaña, estado, o si ya tiene concepto vinculado. Todo
  client-side sobre los datos ya traídos — no dispara ningún fetch nuevo.

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

## Repaso de cierre de ciclo y membresía por ciclo

- **Conceptos y assets pueden pertenecer a varios ciclos** (`creative_concept_cycles`,
  `creative_asset_cycles`, migración 098). `cycle_id` en las tablas originales es solo el
  ciclo de origen. Un trigger registra la membresía al crear cualquier concepto/asset. Las
  consultas del tracker, del selector de vincular y del mapa leen la membresía
  (`cycleMemberIds`), con fallback al `cycle_id` si la migración no se ha corrido.
- **Cerrar un ciclo = repaso de cierre** (`components/projects/hub/cycle-review-modal.tsx`,
  `lib/actions/cycle-review.ts`), 4 pasos: resumen manual multicanal → conceptos
  (Continúa / Termina, sugeridos por "corre en Meta" o Evergreen; motivo opcional al
  terminar, se guarda en `insight`) → assets (se preseleccionan los publicados o que corren
  en Meta; los borradores no) → confirmar y abrir el siguiente ciclo. Continuar agrega
  membresía al ciclo nuevo: no copia ni mueve nada.
- **Evergreen es una etiqueta manual** (status `Evergreen`), puesta en el repaso. Ya no saca
  al concepto de su ciclo ni hay botón en el modal del concepto.
- **Cerrar sin repaso** (botón en el paso 1, o el auto-cierre del cron) deja
  `review_pending = true`: la tarjeta del ciclo pide "Hacer repaso y abrir ciclo" y
  `openNewCycle` ya no cierra en silencio el ciclo activo. `next_cycle_id` guarda a dónde se
  traspasó; desde el historial se puede corregir después (`editCarryOver`).

## Reparar ciclos mal capturados

Botón **"Reparar ciclos"** en el Historial de Ciclos, visible para cualquier
miembro del proyecto (y admins/subadmins). Sirve para arreglar traslapes,
huecos y ciclos duplicados (caso Union Padel) sin perder datos.

- **Diagnóstico**: traslapes en rojo; huecos y duraciones fuera de 25–35 días en ámbar.
- **Editar**: cada ciclo se conserva (con fechas nuevas), se fusiona en otro o
  se elimina (solo si no tiene conceptos ni assets). Se pueden agregar ciclos
  faltantes; se crean cerrados.
- **"Proponer según corte"**: conserva los ciclos limpios del principio y, desde
  el día siguiente al último, genera periodos según el día de corte hasta cubrir
  hoy; cada ciclo existente cae en el periodo donde empieza (el primero se
  conserva, los demás se fusionan en él).
- Al fusionar se elige de qué ciclo se conserva el **resumen manual**.
- **Vista previa**: días con gasto, gasto de Meta, conceptos y assets por ciclo
  final. Las métricas diarias se reasignan por fecha; conceptos, assets, notas
  del mapa y `next_cycle_id` se mueven al ciclo destino.
- **Motivo obligatorio**. Queda en la Bitácora (categoría Interno) y en `cycle_repairs`.
- Al aplicar se re-sincronizan con Meta los ciclos nuevos o con fechas cambiadas;
  si falla, la reparación queda igual y se avisa.
- **Deshacer**: solo la última reparación, y solo si los ciclos no cambiaron
  después (no se abrió, cerró ni editó ninguno).
- **Prevención**: abrir ciclo, editar fechas y el repaso de cierre rechazan
  fechas que se traslapen con otro ciclo.

Código: `supabase/migrations/099_cycle_repairs.sql` (`apply_cycle_repair`,
`undo_cycle_repair`, atómicas), `lib/actions/cycle-repair.ts`,
`components/projects/hub/cycle-repair-modal.tsx`, `lib/utils/cycle-overlap.ts`.

## Dónde vive esto en el código

- `supabase/migrations/050_paid_media_cycle_date_ranges.sql` — `start_date`/`end_date`
  originales.
- `supabase/migrations/077_cycle_dates_and_autoclose.sql` — `projects.auto_close_cycles`
  + `paid_media_cycles.end_warning_sent_at`/`overdue_notice_sent_at`.
- `lib/actions/projects.ts` — `updateCycleDates`, `updateProjectAutoCloseCycles`,
  `runDailyCycleCheck` (llamada por el endpoint de cron), `upsertPaidMediaContext`
  (ya sin target_*), `setCampaignTrendOverride`.
- `supabase/migrations/088_creative_performance_hub.sql` — `meta_ads`,
  `meta_ad_daily_stats`, `creative_asset_meta_ads`, y las columnas nuevas de
  `paid_media_context` (`display_metrics`/`trend_window`/`campaign_trend_overrides`).
- `supabase/migrations/089_synced_campaign_selection.sql` — `synced_campaign_ids`.
- `app/api/cron/sync-meta/route.ts` + `vercel.json` — sync automático de Meta 3 veces
  al día (01:00, 13:00, 19:00 UTC) para todos los ciclos activos de proyectos
  activos, respetando la selección de campañas guardada. El botón "Sincronizar"
  sigue disponible; el grid muestra "Última sincronización" (`getLastMetaSync`).
- **Mapa de relaciones — selector Ciclo / Máximo** en cada nodo de campaña: "Máximo"
  muestra totales de toda la vida de la campaña y de sus ads (`date_preset=maximum`,
  igual que Ads Manager, sin % de tendencia), guardados en `meta_lifetime_stats`
  por `syncLifetimeStats` en cada sync.
- **Qué cuenta como "Resultado"** (`resolveResultSpec`/`pickResults` en `meta.ts`):
  se resuelve por ad set — evento exacto de `promoted_object` para conversiones
  (compra, lead, registro, carrito, etc. o conversión personalizada), luego
  `optimization_goal`, luego el `objective` de la campaña. Alcance/Impresiones usan
  el propio campo (costo por 1,000). Un día sin la acción esperada cuenta 0 — nunca
  caer a otra acción. Alcance/frecuencia se toman deduplicados por Meta sobre todo
  el ciclo (`meta_cycle_reach`), no se derivan de filas diarias.
- `lib/actions/meta.ts` — `syncMetaAds` (sync a nivel ad, `time_increment=1`,
  filtro opcional por `campaign_id`; mirror-ea a Storage el video de cada ad de
  video UNA sola vez, nunca en cada sync, porque el `video_url` que da Meta es
  una URL firmada que expira en horas — sin esto el video dejaba de reproducirse
  y quedaba solo la miniatura), `getMetaCampaignOptions` (picker).
- `lib/actions/paid-media-performance.ts` — `getCreativePerformance` (agregación +
  cálculo de tendencia; expone `display*Url` con la preferencia YA resuelta:
  el archivo del propio asset del dashboard si el ad está vinculado, si no lo
  que trajo el sync — nunca usar `image_url`/`thumbnail_url`/`video_url` crudos
  para renderizar, siempre `display*Url`), `getLinkableAssets` (picker de
  vinculación, acotado al ciclo actual, con preview real + aviso si el asset
  ya está vinculado a otro ad), `linkAssetToMetaAd`/`unlinkAssetFromMetaAd`.
- `lib/constants/paid-media-metrics.ts` — `METRIC_DEFS` (separado de las server
  actions porque un archivo `"use server"` solo puede exportar funciones async).
- `components/projects/hub/creative-performance-grid.tsx`,
  `paid-media-context-card.tsx` (reconstruido), `paid-media-cycle-card.tsx`.
- `app/api/cron/check-cycles/route.ts` — endpoint diario, autenticado por
  `CRON_SECRET`.
- `vercel.json` — declaración del cron (`"0 14 * * *"`).
- `components/projects/hub/paid-media-cycle-card.tsx` — `CycleDatesEditor`,
  `AutoCloseCyclesSetting`, badge "Vencido".
- `lib/notifications/events.ts` — `cycle_ending_soon`, `cycle_overdue`,
  `cycle_auto_closed`.
- `lib/permissions.ts` — `edit_cycle_dates`.
