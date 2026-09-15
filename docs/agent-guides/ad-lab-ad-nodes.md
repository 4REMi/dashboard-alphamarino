# Ad Lab — Ad Nodes — Guía para agentes

**Ruta:** `/ad-lab/nodes` (lista de workflows) → `/ad-lab/nodes/[workflowId]` (canvas)
**Para quién:** admin/subadmin (mismo permiso `access_ad_lab` de todo Ad Lab)
**Actualizado:** 2026-09-15

## Qué es y para qué sirve

Un canvas visual de nodos (React Flow) para armar workflows de IA reusables —
conectar nodos de texto, imagen, análisis, prompting (LLM) y generación de
imagen/video, donde el output de un nodo alimenta al siguiente. Inspirado en un
SaaS competidor que usa este patrón para generar creativos publicitarios en
volumen (varios hooks/variantes a la vez, eligiendo distinto modelo por nodo según
costo/calidad). Deliberadamente más simple que ComfyUI — solo 7 tipos de nodo
fijos, no un catálogo abierto.

## Conceptos y vocabulario clave

- **Workflow** (`ad_node_workflows`): un grafo guardado — `graph` es un JSON con
  `{nodes, edges}`, mismo shape que usa React Flow nativamente.
- **7 tipos de nodo**: `text`, `image`, `analysis` (visión — describe una imagen),
  `llm` (prompting de texto), `generate_image`, `generate_video`, `sticky_note`
  (anotación, nunca se ejecuta). No existe un nodo "Split Text" como en el
  competidor — ahí es literalmente otra llamada de IA para partir un string; si se
  necesita, se resuelve en código, no gastando otra llamada.
- **Run de un nodo** (`ad_node_runs`): estado y output cacheado, por nodo, aparte
  del JSON del grafo. Correr un nodo puntual (botón ▶ en el nodo) SIEMPRE usa el
  output ya cacheado de sus nodos upstream — nunca los re-corre automáticamente.
  "Correr todo el workflow" sí re-corre todos en orden topológico.
- **Modelo por nodo**: cada nodo `generate_image`/`generate_video` elige su propio
  modelo (`lib/actions/ad-nodes/providers/models.ts`) — así se puede usar uno
  barato para un hook y uno más caro/mejor para otro, dentro del mismo workflow.
- **Nivel de seguridad por nodo**: configurable (ej. `safety_filter_level` de
  Replicate), nunca un interruptor global de "sin moderación" — decisión explícita,
  no construir eso.

## Cómo hacer las acciones comunes

**Crear un workflow**: `/ad-lab/nodes` → nombre → "Nuevo workflow" → abre el canvas
vacío.

**Agregar un nodo**: barra de botones arriba del canvas ("+ Text", "+ LLM", etc.) —
aparece en una posición aleatoria, se arrastra a donde se quiera.

**Conectar nodos**: arrastrar desde el punto de conexión derecho de un nodo al
punto izquierdo de otro.

**Configurar un nodo**: clic en el nodo → panel lateral (INPUT/PARAMETERS/OUTPUT) →
"Guardar".

**Correr**: botón ▶ en el nodo mismo. El estado (idle/running/done/error) se ve en
el propio nodo y en el panel.

## Reglas y restricciones

- **El grafo se autoguarda** (debounced ~800ms) en cada cambio de nodos/aristas —
  no hay botón "Guardar" separado para el layout.
- **APIMart NO está integrado todavía** — los modelos de video en el dropdown
  existen pero tiran error explícito al correrlos ("todavía no está integrado").
  Antes de escribir `lib/actions/ad-nodes/providers/apimart.ts` de verdad, se
  necesita un ejemplo real de request/respuesta de sus endpoints (de la cuenta del
  usuario) — la documentación pública no da los nombres exactos de campos JSON.
  Ver el comentario en ese archivo.
- **No se toca `lib/actions/image-clone.ts` ni `lib/actions/ad-scratch.ts`** — Ad
  Nodes tiene sus propios adaptadores de Replicate/generación, deliberadamente
  separados (mismo criterio de "duplicar en vez de refactorizar código de
  producción" ya usado en `ad-scratch.ts`).
- Un nodo cuyo upstream no tiene resultado todavía tira error claro al correrlo —
  nunca ejecuta con input vacío en silencio.
- Un ciclo en el grafo simplemente deja esos nodos sin ejecutar (el orden
  topológico los omite) — no crashea el workflow.

## Quién puede ver/hacer qué

Mismo gate que todo Ad Lab: permiso `access_ad_lab` (`lib/permissions.ts`).

## Dónde vive esto en el código

- `supabase/migrations/079_ad_node_workflows.sql` — `ad_node_workflows`,
  `ad_node_runs`.
- `lib/actions/ad-nodes/workflows.ts` — CRUD de workflows.
- `lib/actions/ad-nodes/executor.ts` — `runNode`, `runWorkflow`, `pollNodeRun`,
  orden topológico (Kahn).
- `lib/actions/ad-nodes/node-handlers.ts` — lógica síncrona de Text/LLM/Analysis.
- `lib/actions/ad-nodes/providers/{types.ts,models.ts,replicate.ts,apimart.ts,registry.ts}`
  — adaptadores de generación por proveedor.
- `components/ad-lab/node-canvas.tsx`, `node-config-panel.tsx`,
  `nodes/ad-node.tsx`, `workflow-list.tsx`.
- `lib/types.ts` — `AdNodeWorkflow`, `AdNodeRun`, `AdNodeGraph`, etc.
