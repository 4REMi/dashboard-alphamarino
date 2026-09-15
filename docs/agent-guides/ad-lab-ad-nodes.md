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
costo/calidad). Deliberadamente más simple que ComfyUI — solo 8 tipos de nodo
fijos, no un catálogo abierto.

## Conceptos y vocabulario clave

- **Workflow** (`ad_node_workflows`): un grafo guardado — `graph` es un JSON con
  `{nodes, edges}`, mismo shape que usa React Flow nativamente.
- **8 tipos de nodo**: `text`, `image`, `analysis` (visión — describe una imagen),
  `llm` (prompting de texto), `split_text`, `generate_image`, `generate_video`,
  `sticky_note` (anotación, nunca se ejecuta).
- **Split Text — a diferencia del competidor, parte el string en código, no con
  IA**: en su competidor "Split Text" es literalmente otra llamada de IA para
  hacer lo que sería una línea de código; acá se resuelve con `String.split`/
  `JSON.parse` normal, sin gastar una llamada extra. Dos delimitadores nada más
  (`splitDelimiter` en la config): `newline` (una parte por línea, líneas vacías
  se descartan) o `json` (array de strings, o un objeto — sus valores se vuelven
  las partes) — deliberadamente sin un delimitador custom/regex, para no
  convertir el nodo en su propio mini-lenguaje de parseo. El texto de entrada es
  el `value` propio del nodo, o si se deja vacío, el texto de un nodo conectado.
  Al correrlo, cada parte resultante aparece como su propia fila dentro del nodo
  (numerada y con un color fijo de una paleta compartida,
  `components/ad-lab/split-colors.ts`), cada una con su propio handle de salida
  (`part-0`, `part-1`, ...) — así cada parte se conecta a un nodo downstream
  distinto en vez de mandarlas todas juntas. Un nodo downstream conectado a un
  handle de parte específico solo recibe ESA parte como texto, no el arreglo
  completo (ningún otro tipo de nodo sabe leer `{parts: [...]}`).
- **Conexiones numeradas y coloreadas desde Split Text**: cada vez que se conecta
  un handle de parte a otro nodo, esa conexión se numera en el orden en que se
  hizo (1ra conexión de ese nodo Split Text = 1, 2da = 2, ...) y se pinta con el
  mismo color de esa parte — un círculo con el número aparece en medio de la
  línea de conexión (`components/ad-lab/edges/split-order-edge.tsx`, tipo de
  edge `splitOrder`). Conexiones desde cualquier otro tipo de nodo son el edge
  default de siempre, sin número ni color especial.
- **Run de un nodo** (`ad_node_runs`): estado y output cacheado, por nodo, aparte
  del JSON del grafo. Correr un nodo puntual (botón ▶ en el nodo) SIEMPRE usa el
  output ya cacheado de sus nodos upstream — nunca los re-corre automáticamente.
  "Correr todo el workflow" sí re-corre todos en orden topológico.
- **Modelo por nodo — catálogo curado, no todo APIMart**: `lib/actions/ad-nodes/providers/models.ts`
  es deliberadamente una lista chica de flagships de la industria, no "todo lo que
  ofrece APIMart" — la interfaz gira alrededor de un set estable en vez de un
  catálogo infinito y cambiante. Hoy: **LLM** — Claude Sonnet (directo vía
  Anthropic, sin margen de APIMart) o GPT-5 (APIMart); **Generate Image** —
  Nano Banana Pro, Nano Banana 2, GPT Image 2, Flux 2 Pro (los 4 vía APIMart);
  **Generate Video** — Veo 3.1 / 3.1 Fast / 3.1 Lite, Seedance 2.5 / 2.0 / 2.0
  Fast / 1.5 Pro, Kling Video O3 Pro (todos vía APIMart). Agregar un modelo nuevo
  es solo una entrada más en ese archivo — nada más necesita cambiar
  estructuralmente.
- **Ojo con el endpoint de precios de APIMart al agregar un modelo**: NO valida
  que el modelo exista — un nombre inventado también regresa `success: true` con
  una plantilla genérica vacía (sin `resolution_prices`/`billing_type`). La única
  forma real de confirmar un modelo nuevo es correrlo de verdad y ver si la
  generación (no el precio) tira error.
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

**Duplicar/eliminar un nodo**: dos íconos siempre visibles junto al pill de
estado, en la esquina superior derecha de la tarjeta del nodo (copiar/basura) —
eliminar también quita las aristas que tocaban ese nodo. (Están adentro de la
tarjeta a propósito, no con offset hacia afuera — puestos afuera quedaban
recortados por el contenedor de React Flow y nunca aparecían al hacer hover.)

**Eliminar solo una conexión (sin tocar los nodos)**: botón × directo sobre la
línea de conexión, siempre visible en su punto medio — no hace falta
seleccionarla y presionar Backspace (que también sigue funcionando, es el
comportamiento nativo de React Flow, pero no era descubrible).

**Correr**: botón ▶ en el nodo mismo. El estado (idle/running/done/error) se ve en
el propio nodo y en el panel.

**Correr todo el workflow**: botón "Correr todo" junto a "Guardar" — antes de
correr nada, guarda el layout actual (para que el ejecutor corra exactamente lo que
se ve en pantalla) y cotiza el costo de TODOS los nodos de generación del grafo
según su configuración actual (aunque nunca se hayan corrido), mostrando el total
en un `confirm()` antes de proceder — es dinero real, nunca corre sin que la
persona vea el estimado primero. Al terminar, muestra cuántos nodos corrieron bien,
cuántos fallaron, y cuántos se omitieron por un ciclo en el grafo. El botón se
deshabilita mientras corre para evitar disparar el mismo workflow dos veces; los
nodos de generación que queden "running" los recoge el polling normal (cada 4s).

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
  - **Timeout de espera por si el job se queda pegado** (`pollNodeRun` en
    `executor.ts`): 10 minutos para imagen, **30 minutos para video** — video
    tarda mucho más que imagen (Seedance/Veo fácilmente pasan de 5-10 minutos),
    así que comparten el mismo límite que imagen causaba el error "tiempo de
    espera agotado" en generaciones de video que en realidad seguían en curso.
    Si algún modelo de video sigue topando este límite, subirlo de nuevo aquí.
  - `callApimartChat` (mismo archivo) es la contraparte síncrona para el nodo LLM
    con GPT-5 — chat completions estilo OpenAI, sin task_id/polling. Requiere
    `stream: false` explícito — sin eso, este endpoint regresa Server-Sent Events
    en vez de un JSON normal (así se manifestó el bug: `JSON.parse` tronando con
    "Unexpected token 'd'", la primera letra de `data: {...}`).
- **Un nodo LLM con imágenes conectadas de verdad las "ve"** — antes solo
  insertaba la URL como texto plano en el prompt (`[imagen: url]`), así que el
  modelo nunca recibía la imagen real, solo un string, y alucinaba. Ahora
  `node-handlers.ts` descarga y adjunta la imagen como contenido de visión real
  (base64 para Claude, URL directa para GPT-5 vía APIMart — cada API lo pide
  distinto). Tope de 5 imágenes por llamada. La descarga para Claude **truena
  con error explícito si falla** (antes fallaba en silencio y el nodo corría
  sin imagen sin avisar — otra causa posible de "alucina y no ve la imagen").
- **Preview de texto en la tarjeta** (`textPreview` en `ad-node.tsx`): los nodos
  Text muestran su valor literal; los LLM/Analysis ya corridos muestran el
  texto/análisis real generado, directo en el canvas — para tener overview
  general sin abrir cada nodo, igual que hace el competidor. Colapsado por
  default; al pasar el cursor se expande y se vuelve escroleable con fondo
  blanco (mismo patrón visual del competidor).
- **Un nodo LLM sin texto pero con imagen upstream ya no truena**: Anthropic
  rechaza un bloque de texto vacío (`"text content blocks must be non-empty"`) —
  pasaba cuando el nodo LLM solo tenía una imagen conectada (sin prompt propio ni
  texto upstream). Ahora cae a una instrucción mínima por default en vez de mandar
  un string vacío.
- **No se toca `lib/actions/image-clone.ts` ni `lib/actions/ad-scratch.ts`** — Ad
  Nodes tiene sus propios adaptadores de generación, deliberadamente separados
  (mismo criterio de "duplicar en vez de refactorizar código de producción" ya
  usado en `ad-scratch.ts`). El adaptador de Replicate (`providers/replicate.ts`)
  sigue en el repo pero sin uso hoy — ningún modelo curado lo necesita, se dejó
  disponible por si algún flagship futuro solo existe ahí.
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
- `lib/actions/ad-nodes/executor.ts` — `runNode`, `runWorkflow` (regresa
  `{succeeded, failed, skipped}`), `quoteWorkflow` (cotización total antes de
  correr todo), `pollNodeRun`, orden topológico (Kahn).
- `lib/actions/ad-nodes/node-handlers.ts` — lógica síncrona de Text/LLM/Analysis/Split Text.
- `components/ad-lab/split-colors.ts` — paleta compartida para las partes/conexiones
  numeradas de Split Text; `components/ad-lab/edges/split-order-edge.tsx` — el
  tipo de edge `splitOrder` que dibuja el badge numerado en medio de la conexión;
  `components/ad-lab/edges/deletable-edge.tsx` — tipo de edge `default` (toda
  conexión que no sale de un handle de parte de Split Text) con el botón × para
  borrarla directo desde la línea.
- `lib/actions/ad-nodes/providers/{types.ts,models.ts,replicate.ts,apimart.ts,registry.ts,pricing.ts}`
  — adaptadores de generación por proveedor; `pricing.ts` consulta el endpoint
  público de precios de APIMart.
- `supabase/migrations/080_ad_node_run_cost.sql` — `ad_node_runs.estimated_cost_usd`.
- `components/ad-lab/node-canvas.tsx`, `node-config-panel.tsx`,
  `nodes/ad-node.tsx`, `workflow-list.tsx`.
- `lib/types.ts` — `AdNodeWorkflow`, `AdNodeRun`, `AdNodeGraph`, etc.
