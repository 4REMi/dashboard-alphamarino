# Creative Tracker — Guía para agentes

**Ruta:** dentro de un proyecto (`/projects/[id]`), pestaña de Creativos — más la
página pública de revisión de cliente, `/share/concepts/[projectId]`
**Para quién:** ambos (ver "Quién puede ver/hacer qué")
**Actualizado:** 2026-09-23

## Qué es y para qué sirve

Sistema para producir, entregar y trackear el desempeño de los creativos
publicitarios de un proyecto — conceptos → briefs (guiones adaptados con IA) →
assets (el video/imagen final subido) → aprobación del cliente → resultados/
verdict post-lanzamiento. Cuatro conceptos separados que a veces se confunden
entre sí:

- **`production_status`** (`creative_assets`) — el pipeline de producción interno:
  `Pending → In Production → In Review → Approved → Published`.
- **`client_status`** (`creative_assets.client_status`/`client_feedback`, o
  `creative_briefs.script_reviews` por script) — si el CLIENTE lo aprobó o pidió
  cambios. Independiente de `production_status`.
- **`creative_concepts.status`** — ciclo de vida del concepto (Activo/Archivado/
  Transmutado/Evergreen), no del asset.
- **`verdict`** — llamada de desempeño post-lanzamiento (Winner/Scale/Iterate/
  Archive), admin/subadmin only.

## Portal del cliente (`/share/concepts/[projectId]`)

Rediseño 2026-09-26 (`components/share/client-portal-app.tsx` + `portal-parts.tsx`):
- **Portada = resumen del ciclo** (escritorio y celular): fechas y días restantes,
  **métricas de Meta del ciclo** (inversión, resultados según el objetivo, costo por
  resultado, impresiones, clics — el cliente sí las ve), barra de aprobadas / en
  ajustes / pendientes, tres columnas "Te toca revisar" (ámbar), "El equipo está
  ajustando" (rojo, con su comentario recortado) y "Aprobado" (verde, galería), y
  tarjetas de los conceptos del ciclo.
- **Menú**: "Resumen del ciclo", solo líneas con conceptos del ciclo (punto de color
  por concepto según su estado) y un único **"Ciclos anteriores"** agrupado por
  ciclo, con el resumen manual (inversión/resultados) si existe.
- **Concepto**: tira del flujo (Guiones x/y → Piezas x/y · n en ajustes); piezas
  pendientes completas arriba; "en ajustes" y "aprobado" colapsados (aprobado en
  cuadrícula 9:16 con lightbox; guiones aprobados como una línea). El panel de
  estrategia se queda como estaba.
- Nombres de pieza: brief + número de pieza (antes "Video / Video"); guiones con su
  título. Aún no se muestra qué piezas están publicadas en Meta (pendiente de decidir).
- Pendiente a futuro: vista del mapa de relaciones para el cliente.

## Ver/editar guiones desde el concepto

En el modal del concepto, las pastillas "Guión #n · estado" (y el feedback del
cliente) se pueden clickear: abren `script-quick-view.tsx`, una vista ligera con la
lista de guiones del brief, el guion a todo lo ancho, "Comparar" con el original,
copiar y editar (admin/subadmin). Guardar usa `updateBriefScript` y regresa ese guion
a "pendiente" del cliente. Los borradores se conservan al cambiar de guion.

## Crear brief (modal)

`components/projects/hub/creatives/brief-creator.tsx` — pantalla casi completa en
dos columnas. Izquierda: concepto, nombre, **cerebro de marca del proyecto (fijo;
solo se elige si el proyecto no tiene)** y la bandeja de referencias elegidas, donde
cada video tiene su interruptor escrito "Tropicalizar guion" / "Solo visual".
Derecha: biblioteca por **Boards** (mosaico de 4 miniaturas, click entra al board;
se puede usar el board completo como inspiración) o por Videos / Imágenes, con
buscador, miniaturas 9:16 que se reproducen al hover y vista en grande. Si el texto
del brief falla, los videos se tropicalizan igual y se avisa
(`lib/utils/ai-json.ts` da el motivo: respuesta cortada, vacía o formato inválido).

## Conceptos y vocabulario clave

- **Revisión de un asset (`revises_asset_id`)**: subir una versión corregida de
  un asset ya NO es "crear un asset nuevo sin relación + ocultar el viejo a
  mano" — al subir, se puede elegir "¿es una revisión de otro asset?" y esa
  versión anterior se oculta del cliente automáticamente al guardar
  (`createAsset`, `lib/actions/creatives.ts`). Mismo patrón que
  `asset_copies.parent_copy_id` (el banco de copies) — la fila nueva apunta
  hacia atrás a la que reemplaza, nunca se muta la original. En la tabla
  (`assets-table.tsx`) solo se muestra la versión ACTUAL de cada cadena por
  default, con un "N revisiones anteriores" colapsable debajo — el historial
  nunca se pierde, solo se colapsa.
- **Avisar al equipo cuando el cliente comenta**: antes, `submitClientReview`/
  `submitBriefClientReview` (`lib/actions/client-review.ts`) no avisaban a
  nadie — el equipo solo se enteraba si alguien abría el proyecto. Ahora
  disparan `notify()` (eventos `creative_client_approved`/
  `creative_client_changes_requested`, `lib/notifications/events.ts`) a TODO
  el equipo del proyecto — no hay un "asignado" por asset/script (ese campo no
  existe), así que no hay forma de dirigirlo a alguien en particular como Ping
  en tareas.
- **La página de revisión del cliente NO tiene autenticación real**:
  `/share/concepts/[projectId]` es pública, sin token firmado — solo el
  `projectId` en la URL. `client-review.ts` corre con el cliente admin sin
  ningún chequeo más allá de `client_visible = true`. Es una limitación
  preexistente, no algo que se haya tocado al agregar las notificaciones —
  vale la pena resolverla en algún momento, pero es un cambio aparte.

- **Vista inversa del link a Meta ("corriendo en vivo")**: desde que existe
  `creative_asset_meta_ads` (Hub Paid Media, migración `088`), un asset puede
  estar vinculado a un ad real de Meta que está gastando dinero HOY. La
  mayoría de los assets NUNCA se lanzan — son candidatos para revisión del
  cliente que se quedan en eso — así que esto no es "mostrar spend en todos",
  es un badge puntual (🟢 con el monto) solo en los que sí tienen link activo.
  Se calcula con `getAssetMetaLinkStatus` (`lib/actions/paid-media-performance.ts`)
  y se ve en tres lugares: la fila compacta de la tabla de conceptos (ícono
  junto al status), el grid de assets dentro del detalle de un concepto
  (badge verde en la esquina de la miniatura), y un rollup en el header
  "Assets (N)" de ese mismo detalle.
- **Alerta "archivado pero sigue corriendo"**: si un concepto está
  `Archived` y alguno de sus assets sigue con un ad ACTIVO de Meta, es una
  inconsistencia real (el cliente probablemente cree que ese material ya no
  aplica, mientras su dinero sigue gastándose) — se marca con un ícono rojo
  de alerta en la fila y un banner en el modal de detalle. No bloquea nada,
  solo avisa.
- **Las revisiones (`revises_asset_id`) NO tocan el link a Meta**: si el
  asset viejo (el que se está revisando) ya estaba corriendo como ad, ese
  vínculo se queda pegado a él — la versión nueva nace sin ningún link. El
  Hub Paid Media seguirá mostrando esa tarjeta apuntando al concepto/asset
  viejo hasta que alguien la vincule manualmente a la revisión (o la
  desvincule). Nada lo hace automático hoy.

## Cómo hacer las acciones comunes

**Subir una revisión de un asset existente**: al crear un asset nuevo (no al
editar uno existente), si ya hay otros assets en ese mismo concepto aparece un
selector "¿Es una revisión de otro asset?" — elegirlo enlaza ambos y oculta la
versión anterior del cliente automáticamente, sin pasos manuales aparte.

**Ver el historial de revisiones de un asset**: en la tabla de assets, el badge
"N revisiones anteriores" bajo el nombre del asset actual — clic para
expandir/colapsar, clic en una versión anterior para abrirla.

**El equipo se entera de un comentario del cliente**: automático, sin acción —
en cuanto el cliente aprueba o pide cambios desde su página de revisión, todo
el equipo del proyecto recibe la notificación por Telegram (si la tienen
vinculada).

## Reglas y restricciones

- Un asset "revisión de" solo se puede establecer AL CREAR, no editando uno ya
  existente — expresar una revisión es subir una fila nueva que apunta hacia
  atrás, no reescribir la identidad de una fila existente.
- Ocultar la versión anterior al marcar una revisión usa el mismo cliente/
  permiso ya verificado por `assertCanManageAssets` en `createAsset` — NO pasa
  por `toggleClientVisible` (que es admin/subadmin-only) para no imponer una
  restricción más estricta de la que ya tenía subir un asset.
- La notificación de comentario de cliente siempre es broadcast a todo el
  equipo del proyecto — no hay manera de dirigirla a alguien específico
  (no existe un campo de "asignado" en `creative_assets`/`creative_briefs`).

## Quién puede ver/hacer qué

- Conceptos/briefs: admin/subadmin only.
- Assets (crear/editar/eliminar, incluyendo marcar una revisión): admin/
  subadmin, o cualquier miembro del proyecto (`assertCanManageAssets`).
- Ocultar/mostrar un asset al cliente (`toggleClientVisible`), y ver
  performance/verdict: admin/subadmin only.
- Comentar como cliente: cualquiera con el link de `/share/concepts/[projectId]`
  — sin autenticación real, ver la limitación arriba.

## Dónde vive esto en el código

- `supabase/migrations/017_creative_tracker.sql` — tablas base.
- `supabase/migrations/037_brief_client_review.sql` — `client_visible`/
  `client_status`/`client_feedback`.
- `supabase/migrations/083_creative_asset_revisions.sql` —
  `creative_assets.revises_asset_id`.
- `supabase/migrations/088_creative_performance_hub.sql` —
  `creative_asset_meta_ads` (el puente hacia el Hub Paid Media).
- `lib/actions/paid-media-performance.ts` — `getAssetMetaLinkStatus`
  (vista inversa "corriendo en vivo").
- `components/projects/hub/creatives/concepts-table.tsx` —
  `conceptLiveRollup`, el badge en el grid de assets, y el ícono/banner de
  "archivado pero sigue corriendo".
- `lib/actions/creatives.ts` — `createAsset`, `updateAsset`, `toggleClientVisible`,
  `assertCanManageAssets`.
- `lib/actions/client-review.ts` — `submitClientReview`,
  `submitBriefClientReview`, `notifyClientReview`.
- `lib/notifications/events.ts` — `creative_client_approved`,
  `creative_client_changes_requested`.
- `components/projects/hub/creatives/assets-table.tsx` (`buildAssetChains`,
  historial colapsable) y `asset-modal.tsx` (selector "¿es una revisión de…?").
- `app/share/concepts/[projectId]/page.tsx` — la página pública de revisión.
