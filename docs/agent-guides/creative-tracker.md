# Creative Tracker — Guía para agentes

**Ruta:** dentro de un proyecto (`/projects/[id]`), pestaña de Creativos — más la
página pública de revisión de cliente, `/share/concepts/[projectId]`
**Para quién:** ambos (ver "Quién puede ver/hacer qué")
**Actualizado:** 2026-09-18

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
- `lib/actions/creatives.ts` — `createAsset`, `updateAsset`, `toggleClientVisible`,
  `assertCanManageAssets`.
- `lib/actions/client-review.ts` — `submitClientReview`,
  `submitBriefClientReview`, `notifyClientReview`.
- `lib/notifications/events.ts` — `creative_client_approved`,
  `creative_client_changes_requested`.
- `components/projects/hub/creatives/assets-table.tsx` (`buildAssetChains`,
  historial colapsable) y `asset-modal.tsx` (selector "¿es una revisión de…?").
- `app/share/concepts/[projectId]/page.tsx` — la página pública de revisión.
