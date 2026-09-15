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
- **Código de color por tipo** (`TYPE_STYLES` en `components/ad-lab/nodes/ad-node.tsx`):
  cada tipo tiene un color fijo — verde=Image, rosa=Generate Image, etc. — y es la
  MISMA fuente de verdad tanto para el borde/fondo del nodo en el canvas como para
  el botón "+ Tipo" de la barra de herramientas, para que un tipo se reconozca por
  color en cualquier parte de la UI.
- **Plantillas maestras**: un workflow se puede duplicar (desde `/ad-lab/nodes`) —
  copia el grafo completo a un workflow nuevo, sin arrastrar el estado de
  ejecución (`ad_node_runs`) del original. Pensado para tener una plantilla base y
  reusarla/modificarla por cliente sin tocar la original.
- **Nivel de seguridad por nodo**: configurable (ej. `safety_filter_level` de
  Replicate), nunca un interruptor global de "sin moderación" — decisión explícita,
  no construir eso.
- **Costo estimado** (`ad_node_runs.estimated_cost_usd`): jalado en vivo del
  endpoint público de precios de APIMart (`GET api.apimart.ai/api/pricing/model?model=...`,
  sin necesitar API key) en el momento exacto en que se manda a generar un nodo —
  nunca un número fijo en el código, así se mantiene correcto aunque APIMart
  cambie tarifas. Solo existe para modelos de APIMart (Replicate no tiene un
  endpoint de precios equivalente). Se ve en tres lugares: en vivo mientras
  configuras el nodo (antes de correrlo), en el nodo mismo una vez corrido, y
  sumado como total del workflow completo (esquina superior derecha del canvas).
  Es un ESTIMADO contra la tarifa oficial, no el costo exacto ya cobrado — APIMart
  no regresa ese dato en la respuesta de la tarea.

## Cómo hacer las acciones comunes

**Crear un workflow**: `/ad-lab/nodes` → nombre → "Nuevo workflow" → abre el canvas
vacío.

**Agregar un nodo**: barra de botones arriba del canvas ("+ Text", "+ LLM", etc.) —
aparece en una posición aleatoria, se arrastra a donde se quiera.

**Conectar nodos**: arrastrar desde el punto de conexión derecho de un nodo al
punto izquierdo de otro.

**Configurar un nodo**: clic en el nodo → panel lateral (INPUT/PARAMETERS/OUTPUT) →
"Guardar".

**Subir una imagen a un nodo Image**: dentro del panel, botón "Subir imagen" — o
pega una URL directamente si ya la tienes alojada en otro lado. Sube al bucket
`ad-lab` de Storage, bajo `ad-node-workflows/{workflowId}/...`.

**Duplicar/eliminar un nodo**: al pasar el cursor sobre un nodo aparecen dos
íconos junto al pill de estado (copiar/basura) — eliminar también quita las
aristas que tocaban ese nodo. (Están adentro de la tarjeta a propósito, no con
offset hacia afuera — puestos afuera quedaban recortados por el contenedor de
React Flow y nunca aparecían al hacer hover.)

**Correr**: botón ▶ en el nodo mismo. El estado (idle/running/done/error) se ve en
el propio nodo y en el panel.

**Guardar el layout manualmente**: botón "Guardar" arriba a la derecha del
canvas — fuerza el guardado inmediato en vez de esperar el autoguardado
(~800ms). Un indicador junto a él dice "Guardando…"/"Guardado"/"Sin guardar".

**Duplicar/renombrar/eliminar un workflow completo**: desde `/ad-lab/nodes`,
íconos en cada tarjeta de la lista.

## Reglas y restricciones

- **El grafo se autoguarda** (debounced ~800ms) en cada cambio de nodos/aristas —
  no hay botón "Guardar" separado para el layout.
- **APIMart ya está integrado** (`lib/actions/ad-nodes/providers/apimart.ts`) —
  confirmado contra logs reales de la cuenta del usuario, no adivinado. `POST
  /v1/videos/generations` y `POST /v1/images/generations` regresan `task_id`;
  `GET /v1/tasks/{task_id}` se consulta con polling. El parseo del estado acepta
  dos shapes distintos (la doc pública describe `{status, progress,
  result.images}`, los logs reales muestran `{links: [...]}` directo) — se trata
  como "listo" cualquiera de los dos, y como "fallido" solo si `status` es
  explícitamente `failed`/`cancelled`. Requiere `APIMART_API_KEY` en las
  variables de entorno.
  - Modelos confirmados: `seedance-2.5` (video), `gpt-image-2.5-flare` (imagen).
    Agregar otro modelo de APIMart es solo una entrada nueva en
    `lib/actions/ad-nodes/providers/models.ts`.
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
- `lib/actions/ad-nodes/providers/{types.ts,models.ts,replicate.ts,apimart.ts,registry.ts,pricing.ts}`
  — adaptadores de generación por proveedor; `pricing.ts` consulta el endpoint
  público de precios de APIMart.
- `supabase/migrations/080_ad_node_run_cost.sql` — `ad_node_runs.estimated_cost_usd`.
- `components/ad-lab/node-canvas.tsx`, `node-config-panel.tsx`,
  `nodes/ad-node.tsx`, `workflow-list.tsx`.
- `lib/types.ts` — `AdNodeWorkflow`, `AdNodeRun`, `AdNodeGraph`, etc.
