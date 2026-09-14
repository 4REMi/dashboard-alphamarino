# Ad Lab — Crear desde cero — Guía para agentes

**Ruta:** `/ad-lab/scratch`
**Para quién:** admin/subadmin (mismo permiso `access_ad_lab` que el resto de Ad Lab)
**Actualizado:** 2026-09-15

## Qué es y para qué sirve

Todo lo demás en Ad Lab genera un estático **a partir de un anuncio de referencia**
(un anuncio de competencia guardado, analizado y adaptado — `lib/actions/image-clone.ts`).
Esta función genera un estático **sin ninguna referencia** — opcionalmente amarrada a
un `creative_concept` ya existente de un proyecto, o con una dirección libre en texto.

Deliberadamente NO es "generar y ver qué sale": la ideación (texto, barata) está
separada de la generación de imagen (Replicate, cara) en dos pasos. Nada se genera
hasta que el usuario aprueba una idea puntual.

## Conceptos y vocabulario clave

- **Idea** (`scratch_ad_ideas`): una propuesta de creativo — headline, ángulo de
  copy, descripción visual, elementos de marca a usar. Vive independiente de
  `image_clones` mientras no se aprueba; nunca gasta una generación de imagen por sí
  sola.
- **Ronda** (`round`): cada vez que se pide "Proponer más" es una ronda nueva de 4-5
  ideas que se agrega a las ya existentes, nunca las reemplaza. Se agrupan por
  `batch_id`.
- **Aprobar**: al aprobar una idea, se crea una fila real en `image_clones`
  (`source: 'scratch'`, sin `saved_ad_id`) y ahí sí arranca la generación en
  Replicate — mismo motor que usa el clonado por referencia.
- **Dirección**: una idea necesita concepto O brief libre — nunca ninguno de los
  dos (la IA no tiene qué seguir sin al menos uno).

## Cómo hacer las acciones comunes

**Generar un estático desde cero**: `/ad-lab/scratch` → elige Brand Brain → elige un
concepto existente o escribe una dirección libre → "Proponer ideas" → revisa/edita/
descarta → marca las que quieras generar → configura aspect ratio/variantes →
"Generar".

**Pedir más variedad sin perder lo ya visto**: botón "Proponer más ideas" — agrega
otra ronda debajo, la IA evita repetir headlines/ángulos ya propuestos.

## Reglas y restricciones

- El clonado por referencia existente (`/ad-lab/creatives`, "Clonar") **no se tocó**
  — comparte el motor de generación/revisión (`pollImageGeneration`,
  `finalizeImageClone`, etc. en `lib/actions/image-clone.ts`) pero con su propio
  prompt (`buildScratchGenerationPrompt` en `lib/actions/ad-scratch.ts`, distinto de
  `buildGenerationPrompt` — no hay imagen de referencia que analizar
  estructuralmente).
- Las imágenes de entrada a Replicate para un estático "desde cero" son **solo
  assets de marca** (logo del Brand Brain) — nunca un anuncio ajeno. Si la marca no
  tiene logo cargado, la generación falla con un mensaje explícito en vez de
  generar sin ninguna referencia visual.
- Descartar una idea es soft-delete (`status: 'discarded'`) — nunca se borra la
  fila, para no repetir el mismo ángulo en una ronda futura.
- Subir imágenes de producto extra (como en el clonado por referencia) **no está
  disponible todavía** en esta primera versión — pendiente si se necesita.

## Quién puede ver/hacer qué

Mismo gate que todo Ad Lab: permiso `access_ad_lab` (`lib/permissions.ts`).

## Dónde vive esto en el código

- `supabase/migrations/078_scratch_ad_ideas.sql` — tabla `scratch_ad_ideas` +
  `image_clones.source`/`scratch_idea_id`/`saved_ad_id` ahora nullable.
- `lib/actions/ad-scratch.ts` — `proposeScratchIdeas`, `getScratchIdeas`,
  `updateScratchIdea`, `discardScratchIdea`, `approveScratchIdeasAndGenerate`.
- `lib/actions/image-clone.ts` — reusado sin cambios desde la aprobación en
  adelante (`pollImageGeneration`, `finalizeImageClone`, `uploadReferenceImages`).
- `components/ad-lab/scratch-studio.tsx` — UI completa (setup, ideas, revisión).
- `app/(dashboard)/ad-lab/scratch/page.tsx`, hub card en
  `app/(dashboard)/ad-lab/page.tsx`, entrada en `components/sidebar.tsx`.
