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
  **Generate Video** — Veo 3.1 Fast / 3.1 Quality / 3.1 Lite, Seedance 2.5 / 2.0
  / 2.0 Fast / 1.5 Pro, Kling Video O1, Gemini Omni 1.1 Flash (todos vía
  APIMart). Agregar un modelo nuevo es solo una entrada más en ese archivo —
  nada más necesita cambiar estructuralmente.
- **Dos fuentes para confirmar un modelo/parámetro real de APIMart, en orden de
  confiabilidad**: (1) `docs.apimart.ai/api-reference/{videos|images}/{model}/generation`
  — documentación real por endpoint con los valores exactos que acepta cada
  parámetro (`size`/`aspect_ratio`, `resolution`, etc.), cuando existe esa
  página para el modelo; (2) el endpoint de precios
  (`api.apimart.ai/api/pricing/model?model=...`) — SOLO confirma que el slug
  existe (regresa datos reales en vez de la plantilla genérica vacía), NO
  valida ni expone parámetros de generación. Ninguno de los dos reemplaza
  correrlo de verdad — si un modelo rechaza algo que ninguna fuente
  documentaba, ese error real es la fuente definitiva. Así se detectaron y
  corrigieron slugs adivinados que NO existían: "veo-3.1-fast"/"veo-3.1"/
  "veo-3.1-lite" (CON guion entre "veo" y "3.1") → reales `veo3.1-fast`/
  `veo3.1-quality`/`veo3.1-lite` (SIN guion — "Lite" sí existe, se había
  descartado por el guion de más); "seedance-1.5-pro" → real
  `doubao-seedance-1-5-pro`; "kling-video-o3-pro" (no existe) → real
  `kling-video-o1`.
- **Resolución de video — dinámica por modelo, no una lista fija**: cada modelo
  acepta un set de resoluciones distinto (confirmado: Gemini Omni 1.1 Flash solo
  acepta 360P/720P/1080P/4K; mandarle "480P", que sí acepta Seedance, lo rechaza
  con un error de APIMart). El dropdown de "Resolución" en el panel de config se
  llena en vivo con `getVideoModelResolutionOptions` (`providers/pricing.ts`),
  que saca las resoluciones válidas directo de las keys de `resolution_prices`
  del endpoint de precios — confirmado que coincide exactamente con el propio
  selector de resolución de apimart.ai para ese modelo. Si el modelo cambia y la
  resolución ya elegida no existe en el nuevo set, se corrige sola al primer
  valor válido. Si el modelo no tiene `resolution_prices` en absoluto (ej. Kling
  Video O1, que cobra por tiers de calidad — `billing_tiers` — no por
  resolución), el campo se oculta por completo y no se manda `resolution` en el
  request.
- **Aspect ratio de video — confirmado por modelo, vía la documentación por
  endpoint (no el endpoint de precios)**: bug real que ya pasó — se mandó
  "4:5" (parte del fallback genérico) a un modelo que solo acepta
  `16:9/4:3/1:1/3:4/9:16/21:9/adaptive`, y APIMart lo rechazó. El endpoint de
  precios nunca expuso esto para ningún modelo (ver arriba), pero
  `docs.apimart.ai/api-reference/videos/{model}/generation` sí documenta el
  parámetro `size`/`aspect_ratio` con sus valores exactos — de ahí sale
  `VIDEO_ASPECT_RATIOS` (`providers/models.ts`), un mapa hardcodeado (no una
  consulta en vivo, no hace falta red) por modelo:
  - Veo 3.1 (Fast/Quality/Lite) y Gemini Omni 1.1 Flash: solo `16:9`/`9:16`.
  - Seedance 2.5/2.0/2.0 Fast: `16:9`/`4:3`/`1:1`/`3:4`/`9:16`/`21:9`/`adaptive`.
  - Kling Video O1: `16:9`/`9:16`/`1:1`.
  - Seedance 1.5 Pro: sin página propia en la documentación (404) — se asume
    el mismo set que sus hermanos Seedance 2.x, **sin confirmar
    independientemente**; corregir si un error real dice lo contrario.
  El panel de config y los selects de la tarjeta usan este mapa cuando el tipo
  es `generate_video` y el modelo está en él; si no, caen al mismo fallback
  genérico de siempre. **Generate Image sigue sin fuente confirmada** —
  ningún modelo de imagen tiene página en `docs.apimart.ai/api-reference/images/`
  con el slug que probamos; si se encuentra la ruta correcta, se resuelve
  igual que video.
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
"Guardar". Generate Image/Video también traen Modelo y Aspect Ratio como
selects directo en la tarjeta (ver "Controles rápidos en la tarjeta misma"
abajo) — cambiar esos dos ahí no necesita abrir el panel ni pasar por
"Guardar", se autoguarda igual que cualquier otro cambio del grafo.

**Subir una imagen a un nodo Image**: dentro del panel, botón "Subir imagen" — o
pega una URL directamente si ya la tienes alojada en otro lado. Sube al bucket
`ad-lab` de Storage, bajo `ad-node-workflows/{workflowId}/...`.

**Arrastrar un archivo de imagen directo al canvas**: crea un nodo Image en el
punto exacto donde lo sueltas, ya con esa imagen — sin pasar por "+ Image" →
abrir el panel → "Subir imagen". Soltar varios archivos a la vez crea un nodo
por archivo, cada uno subiendo en paralelo (un archivo grande no bloquea a los
demás). Mismo bucket/ruta de Storage que el botón "Subir imagen" del panel —
mismo `uploadNodeImage`, dos puntos de entrada distintos.

**Deshacer/rehacer**: botones ↶/↷ junto a "Guardar", o `Ctrl+Z`/`Ctrl+Shift+Z`
(`Cmd` en Mac) — cubre agregar/borrar/duplicar nodos, conectar/borrar aristas,
mover un nodo (una entrada por arrastre completo, no por cada pixel), y guardar
cambios de configuración desde el panel. Pila en memoria (hasta 50 pasos, se
pierde al recargar la página, no vive en la base de datos) — cada paso
deshecho/rehecho también dispara el autoguardado normal. Los atajos de teclado
se ignoran mientras el foco está en un campo de texto/textarea/select, para no
pelearse con el undo nativo del navegador dentro de esos campos.

**Duplicar/eliminar un nodo**: dos íconos siempre visibles junto al pill de
estado, en la esquina superior derecha de la tarjeta del nodo (copiar/basura) —
eliminar también quita las aristas que tocaban ese nodo. (Están adentro de la
tarjeta a propósito, no con offset hacia afuera — puestos afuera quedaban
recortados por el contenedor de React Flow y nunca aparecían al hacer hover.)

**Eliminar solo una conexión (sin tocar los nodos)**: botón × directo sobre la
línea de conexión, siempre visible en su punto medio — no hace falta
seleccionarla y presionar Backspace (que también sigue funcionando, es el
comportamiento nativo de React Flow, pero no era descubrible).

**Seleccionar/mover/duplicar/eliminar varios nodos a la vez**: mantener **Ctrl**
y arrastrar sobre el canvas dibuja un cuadro de selección; Ctrl+clic
agrega/quita un nodo puntual de la selección. Con 2+ nodos seleccionados
aparece una barra flotante abajo del canvas con "Duplicar"/"Eliminar" para
todo el grupo a la vez. Mover el grupo es nativo de React Flow — arrastrar
cualquiera de los nodos seleccionados mueve a todos juntos, sin código propio
para eso. (Ctrl+clic en un nodo NO abre su panel de configuración — solo lo
agrega/quita de la selección; un clic normal, sin Ctrl, sí abre el panel como
siempre.)

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
- **`NodeConfigPanel` está memoizado (`React.memo`)** — sin esto, CUALQUIER
  re-render del canvas (el polling de un nodo corriendo en otra parte del
  workflow cada 4s, el ciclo "Guardando…"/"Guardado" del autoguardado)
  re-renderizaba también el panel abierto, aunque nada del nodo seleccionado
  hubiera cambiado. Ese re-render de más, si caía justo en medio de un clic
  sobre un `<select>` nativo, a veces hacía que Chrome descartara la
  selección (bug real reportado: "necesito doble clic en los dropdowns, y a
  veces sí funciona"). Para que la memoización sirva de algo, `node-canvas.tsx`
  le pasa `onClose`/`onSave` envueltos en `useCallback` — una función nueva en
  cada render volvería a romper la comparación de props del memo.
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
- **Rediseño de tarjeta (segunda pasada, sobre diseño de referencia del
  usuario)** — `ad-node.tsx`:
  - **Tipo + modelo elegido son lo más prominente**: bajo el nombre del nodo,
    texto de color (`accentText` en `TYPE_STYLES`, no un badge chiquito) del
    tipo de nodo, con el modelo elegido pegado al lado (ej. "GENERATE IMAGE ·
    Gemini Omni 1.1 Flash") — deliberado, era el pedido explícito del usuario:
    que el tipo/modelo sean lo primero que se lea sin abrir el nodo.
  - **Preview de texto — alto FIJO, nunca crece el nodo**: Text/LLM/Analysis
    muestran su contenido en una caja de `h-24` con scroll siempre disponible
    (no expandible en hover). La versión anterior crecía el nodo al pasar el
    mouse — el usuario lo pidió revertir explícitamente ("mal diseño", movía
    todo lo demás en el canvas).
  - **Miniaturas con proporción real, no recortada**: Image/Generate Image
    (`object-contain`, sin alto fijo, solo un tope `max-h-52`) y Generate
    Video (`<video controls>`, mismo tope) — con padding/esquinas redondeadas
    dentro de la tarjeta en vez de ir a los bordes. Botón de descarga flotante
    sobre la miniatura cuando hay un resultado generado real (no para la
    imagen que subiste tú a un nodo Image).
  - **Controles rápidos en la tarjeta misma**: Generate Image/Video traen
    selects de Modelo y Aspect Ratio directo en el nodo — cambian el config
    sin abrir el panel lateral (`onUpdateConfig`, nuevo en `AdNodeRenderData`,
    resuelto por `updateNodeConfig` en `node-canvas.tsx`, que mezcla un
    pedazo de config y sigue pasando por historial/autoguardado igual que
    cualquier otro cambio). El aspect ratio usa el mismo fallback estático que
    el panel (`FALLBACK_ASPECT_RATIOS`, exportado desde
    `node-config-panel.tsx` para no duplicarlo) — la Resolución de video (que
    sí tiene fuente en vivo por modelo) se quedó solo en el panel, no en la
    tarjeta, para no tener que resolver el fetch por-modelo en cada nodo del
    canvas a la vez.
  - **Botón "Run" ancho, negro, con label** — reemplaza el botón circular
    chico de antes, mismo estilo que el diseño de referencia.
  - **Sin pill de estado en el header**: el estado se ve como un anillo de
    color alrededor de toda la tarjeta (`STATUS_RING` — verde si `done`, rojo
    si `error`) en vez de competir por espacio con el tipo/modelo; "running"
    se refleja en el ícono de editar (spinner) y en el botón Run
    (deshabilitado + spinner).
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
