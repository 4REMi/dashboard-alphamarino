# Servidor MCP (`/api/mcp`) — Guía para agentes

**Ruta:** `/api/mcp` (endpoint, no una página) — la UI para generar keys vive en
`/employees/[id]` (tu propio perfil, sección "API keys de IA (MCP)")
**Para quién:** cualquier empleado con sesión — cada persona genera su propia key
**Actualizado:** 2026-11-11

## Qué es y para qué sirve

Un servidor MCP (Model Context Protocol) remoto que deja usar un chat de IA
(Claude, o cualquier cliente compatible con MCP) como un TERCER canal de entrada
al dashboard — junto a la UI normal y Captura rápida — sin abrir el dashboard ni
estar en el grupo de Telegram. Alguien con su key personal configurada le escribe
en lenguaje natural a Claude ("créame una tarea para revisar el brief de GARMAC
para el viernes") y Claude llama la tool correspondiente, que ejecuta la MISMA
lógica que ya usa Captura rápida.

**Decisión explícita, distinta a como funciona Telegram**: cada tool call corre
con los MISMOS permisos que ya tiene esa persona en el dashboard
(`lib/permissions.ts`), nunca con un bypass de rol de servicio. El bot de
Telegram sí hace ese bypass (`createAdminClient()` sin checar permisos) — es una
decisión deliberada y ya tomada de ESE camino, que se dejó intacto a propósito
("está funcionando perfectamente"); MCP es un camino nuevo y separado, construido
más estricto desde el inicio, no una copia de cómo funciona Telegram.

## Conceptos y vocabulario clave

- **API key personal** (`mcp_api_keys`): un token que cada empleado genera desde
  su propio perfil (`components/employees/mcp-api-keys.tsx`) — nadie puede generar
  la de otra persona, mismo criterio que vincular Telegram. Se guarda solo su
  hash SHA-256; el valor real se muestra una sola vez al crearla.
- **`actingProfileId`**: el parámetro nuevo (opcional, al final) que se le agregó
  a las server actions reales que MCP reusa (`createTask`, `updateTaskStatus`,
  `addLogEntry`) — cuando viene con un valor, la función salta el
  `supabase.auth.getUser()` normal (una llamada de MCP no tiene cookies/sesión de
  navegador) y en su lugar corre el MISMO chequeo de permiso contra ESE profile,
  vía el cliente admin. Cuando se omite (la UI normal, Captura rápida), la
  función se comporta exactamente igual que antes — es un parámetro aditivo, no
  un cambio de comportamiento para nadie más.
  **Seguridad (2026-11-06)**: toda action exportada de un archivo `"use server"`
  es un endpoint público, así que el `actingProfileId` que llega como argumento
  NO se puede creer por sí solo (antes cualquiera podía llamar la action directo
  con el id de un admin). Ahora la primera línea de cada action que lo recibe es
  `assertActingProfile(actingProfileId)` (`lib/trusted-context.ts`): el id solo
  vale si coincide con el perfil que el MCP autenticó en ESA MISMA petición.
  `app/api/mcp/route.ts` corre toda la petición en `runTrusted("mcp", …)` y
  `verifyMcpToken` fija el perfil con `setTrustedProfile` al validar el token
  (API key u OAuth); una llamada desde el navegador no tiene ese contexto y se
  rechaza con "Not authenticated". Igual para `markTaskDoneFromBot`: exige
  `assertTrustedSource("telegram")`, que solo abre el webhook del bot tras validar
  secreto y chat.
- **Meta Ads** (`lib/mcp/meta-tools.ts`): `meta_estado_cliente` (lee en vivo
  campañas → conjuntos → anuncios con ids, presupuesto CBO/ABO y rendimiento
  del ciclo), `meta_cambiar_estado`, `meta_presupuesto`, `meta_renombrar`,
  `meta_duplicar` (campaña completa, conjunto o anuncio; mismo lugar u otro destino), `meta_contenido_anuncio` (texto/título/CTA; video → transcripción con AssemblyAI; imagen → se regresa la imagen para que Claude lea su texto). Solo admin/subadmin. Escrituras en dos pasos: sin
  `confirmar: true` solo describen el cambio. Cada id se verifica contra la
  cuenta de Meta del proyecto. Presupuesto con tope ±50% salvo
  `permitir_cambio_grande`. Copias se crean pausadas. Todo cambio queda en la
  bitácora como "Meta (vía Claude)".
- **Crear en Meta** (`lib/mcp/meta-create-tools.ts`): `meta_activos_cuenta`
  (páginas+Instagram, pixeles, formularios), `creativos_listos` (assets del
  Creative Tracker con asset_id), `meta_crear_campana` (CBO/ABO, categoría
  especial para vivienda/empleo/crédito), `meta_crear_conjunto` (optimización
  según objetivo y destino; audiencia amplia), `meta_crear_anuncio` (sube la
  imagen/video del asset, arma el creativo y vincula el anuncio al asset).
  Todo se crea PAUSADO y con confirmación en dos pasos.
  Ubicación: `meta_segmentacion` (lee la segmentación de conjuntos activos o
  pasados), `meta_buscar_ubicacion` (nombre → key de ciudad/estado/CP), y en
  `meta_crear_conjunto` `ubicacion_pin` (radio alrededor de lat/lng) o
  `copiar_segmentacion_de` (segmentación completa de otro conjunto), y
  `meta_editar_segmentacion` (cambia solo lo indicado de un conjunto existente:
  agregar/quitar intereses, incluir/excluir públicos, edad, género, ubicación,
  ubicaciones de anuncio y Advantage+). Ubicaciones manuales también al crear
  conjunto (`ubicaciones`; lista en `PLACEMENTS` de meta-tools.ts).
- **Editar en Meta** (`lib/mcp/meta-edit-tools.ts`): `meta_editar_anuncio`
  (texto, título, CTA, URL, UTMs o cambiar el video/imagen por un asset del
  Creative Tracker; crea un creativo igual con los cambios y lo asigna →
  vuelve a revisión), `meta_buscar_intereses`, `meta_publicos` (personalizados
  y similares), `meta_programacion` (fechas, presupuesto total, puja: menor
  costo / costo objetivo / tope).
  Mensaje de bienvenida de anuncios de mensajes: `meta_bienvenida_leer` y
  `meta_bienvenida_cambiar` (saludo + hasta 4 opciones con respuesta; Claude
  los redacta desde el objetivo que describe el usuario). Meta no edita
  creativos: se crea uno igual con el mensaje nuevo y se asigna al anuncio
  (vuelve a revisión). `meta_crear_anuncio` acepta `saludo` y `preguntas`.
- **Captura rápida** (`captura_rapida` en `lib/mcp/tools.ts`): misma IA que el
  botón del dashboard (`interpretStandup` en `lib/standup-core.ts`, que también
  usa `processStandup`). Siempre dos pasos: con `texto` regresa vista previa
  numerada + `items` (JSON); con `items` + `confirmar: true` crea tareas
  (`createTask`) y notas (`addLogEntry`). Claude puede ajustar los items entre
  pasos. Las tareas llevan también `descripcion` y `pingear`/`avisar_al_terminar`
  (la IA los propone si el texto lo da). `agregar_nota_proyecto` acepta además `categoria`, `fecha_evento` y
  `fijar` (contexto fijo). `crear_tarea`/`agregar_nota_proyecto` siguen
  directas (una sola cosa puntual).
- **Entregables de ofertas**: `crear_oferta` acepta `entregables` (texto de venta,
  control, cadencia, cantidad) y `oferta_entregables` agrega/edita/quita/mueve
  líneas (por número o texto) con vista previa antes → después. Guarda con
  `updateServiceOffer` (mismo camino que la pantalla de Servicios); líneas
  nuevas llevan `added_at` = hoy (cuentan desde hoy en proyectos con la oferta).
- **Entregables del proyecto por periodo** (`lib/mcp/deliverable-tools.ts`):
  `entregables_proyecto` (con `completo: true` además: continuos, hitos cumplidos
  e historial de hasta 12 periodos con lo que faltó) (periodo actual con avance, hitos únicos pendientes,
  periodo anterior incompleto), `marcar_entregable` (sumar/hecho/completo;
  directo), `ajustar_entregable` (cantidad o texto solo de este periodo) y
  `agregar_entregable_extra` (fuera de oferta). Usan las mismas funciones del
  alcance (`service-deliverables.ts`, con `actingProfileId`) y sus permisos;
  todo cambio queda en la bitácora.
- **Entregables de tareas** (también en `deliverable-tools.ts`):
  `entregables_de_tareas` (tareas con "requiere entregable": entregadas con qué/
  quién/cuándo y faltantes con responsable/fecha/vencida) y `entregar_tarea`
  (sube texto o enlace con `submitDeliverable`+`actingProfileId`, opcional
  completar la tarea; propone el entregable del alcance que podría sumar por
  palabras en común, o lo suma con `sumar_a_alcance`). `resumen_tareas` y
  `mis_tareas_pendientes` marcan 📎 falta/subido. Los dos tipos de entregable
  NO están ligados en datos: la conexión es esta propuesta.
- **Clientes** (`lib/mcp/customer-tools.ts`): `buscar_clientes` (con o sin
  proyecto, filtro por estado o "sin proyecto"), `detalle_cliente` (contacto,
  proyectos con tipo y marca; finanzas solo con `view_project_financials`),
  `crear_cliente` y `editar_cliente` (permiso `manage_customers`, vista previa).
- **Crear proyectos** (`lib/mcp/project-tools.ts`): `crear_proyecto` usa la misma
  función que el modal (`createProject`, con `actingProfileId`). Tipo, cliente,
  Brand Brain, equipo y fases a quitar por nombre (nunca adivina). El equipo se
  agrega antes de copiar las tareas para que se asignen por puesto. Valor y fee
  solo con `view_project_financials`. Solo admin/subadmin; dos pasos.
  **Alcance obligatorio**: `ofertas[]` (por nombre; la vista previa muestra sus
  entregables, nunca precios), `entregables_propios[]` (texto, cadencia,
  cantidad) o `interno: true`. Sin ninguno de los tres, falla.
- **Finanzas** (`lib/mcp/finance-tools.ts`): `registrar_gasto`, `listar_gastos`,
  `resumen_finanzas`; `registrar_gasto` también da de alta recurrentes generales (`frecuencia`). Permiso `view_global_finances` (igual que /finances).
  Mismo modelo que el bot de Telegram: montos en USD (MXN se convierte con el
  tipo de cambio de la fecha); con proyecto → `project_expenses`, sin
  proyecto → `recurring_expenses` "One-time". Nómina no se registra por aquí.
  **Ingresos y fees (2026-11-07)**: `registrar_ingreso` (permiso
  `view_global_finances`; igual que un ingreso por Telegram: guarda moneda,
  monto original, tipo de cambio y `amount` en USD; con `proyecto` cuenta como
  su cobro del mes; descripción por defecto "Cuota mensual - <proyecto>
  (<mes>)"; avisa si el proyecto ya tenía ingreso ese mes, no lo bloquea).
  `fees_pendientes` (proyectos activos con fee sin ingreso en el mes, misma
  regla que `getPendingMonthlyFees`). `editar_fee_proyecto` cambia
  `monthly_fee`/`project_value` (admin/subadmin + `view_project_financials`,
  como "Editar proyecto"; dos pasos, muestra el efecto en el MRR). El fee se
  guarda en la moneda pactada (ver abajo). Editar el fee NO registra cobro.
  **Moneda del fee (2026-11-07, migración 122)**: `projects.monthly_fee_currency`
  (USD/MXN) y `monthly_fee_original` (monto en pesos). `monthly_fee` sigue
  siendo el equivalente en USD que leen MRR, Finanzas y reportes; para fees en
  MXN el cron diario (`refreshMxnFees`, `lib/finance/project-fee.ts`) lo
  recalcula con el tipo de cambio del día. "Marcar como cobrado" y
  `registrar_ingreso` registran el cobro en MXN. `crear_proyecto` acepta
  `moneda_fee`. Sin la migración, los fees en USD siguen funcionando y uno en
  MXN da un error que lo dice.
  **Gastos recurrentes (2026-11-07)**: `editar_gasto_recurrente` (por nombre,
  dos pasos). Cambio de monto/frecuencia = cambio de precio desde este mes:
  cierra el gasto al final del mes pasado (`ended_at`) y crea uno igual con el
  monto nuevo y `start_date` el día 1, para no reescribir meses pasados;
  `corregir_historial: true` edita en su lugar. Nombre/categoría se editan en
  su lugar. `dar_de_baja: true` = mismo efecto que el switch de Finanzas
  (`is_active: false`, `ended_at` hoy).
- **@menciones**: si el texto de una nota incluye `@Nombre Completo` de un
  miembro del proyecto, a esa persona le llega aviso por Telegram (además de
  `avisar_a`). Se resuelve en `notifyNewNote`/`resolveMentions`
  (`lib/actions/projects.ts`) contra `project_members`; editar una nota NO
  vuelve a avisar.
- **Contexto fijo para la IA**: `bitacora_proyecto` devuelve primero las notas
  FIJADAS ("Contexto fijo") y luego las recientes. El mismo contexto
  (`getProjectContext`/`contextBlock` en `lib/project-context.ts`) se inyecta
  en la redacción de reportes (notas del rango del reporte) y en los briefs
  creativos. Para que la IA "sepa" algo de un proyecto de forma permanente,
  fíjalo en la bitácora.
- **Avisar por Telegram de una nota de bitácora — opt-in, nunca automático**:
  `agregar_nota_proyecto` tiene un parámetro opcional `avisar_a` ("todos"/
  "equipo" para avisarle a todo el proyecto, o un nombre para avisarle a esa
  persona). Sin ese parámetro, la nota queda completamente silenciosa —
  mismo criterio que ya se usa para Ping en tareas (la mayoría de las notas
  son solo constancia interna, no le importan a todo el equipo). Mismo
  patrón de datos que Ping (`project_log_entries.notify_team`/
  `notify_recipient_ids`, espejo de `tasks.is_pinged`/`ping_recipient_ids`),
  implementado en `notifyProjectNote` (`lib/actions/projects.ts`) y también
  disponible desde la UI normal (`components/projects/hub/project-log.tsx`,
  botón de campana + `PingRecipientsPicker` reusado). **Deliberadamente NO
  disponible desde Telegram** — el bot (`handleNotaProyecto`) siempre crea
  notas silenciosas, sin excepción; se decidió no extender la clasificación
  de IA del bot para esto (más superficie de error por poca ganancia), y el
  bot es un camino que se dejó intacto a propósito.
- **Resolución de proyecto/persona por nombre**: un chat no tiene el `<select>`
  de proyecto que sí tiene Captura rápida — las tools de MCP reciben el NOMBRE
  (`proyecto`, `asignado_a`) y lo resuelven con un `ilike` parcial
  (`lib/mcp/tools.ts`). Cero coincidencias o 2+ coincidencias ambiguas se
  regresan como error de texto (para que el chat le pida a la persona ser más
  específica), nunca se adivina cuál. Implementado aparte del bot de Telegram
  (que ya resuelve nombres parecido) a propósito — MCP no debe depender de
  código interno del bot.

## Cómo hacer las acciones comunes

**Generar tu API key**: `/employees/[tu-id]` → sección "API keys de IA (MCP)" →
nombre descriptivo (ej. "Claude en mi laptop") → "Generar key". Copia la key Y la
URL del endpoint que se muestran — la key no se vuelve a mostrar completa después.

**Configurar el cliente de MCP**: en Claude (o el cliente que sea), agregar un
conector remoto con esa URL (`https://tu-dashboard.com/api/mcp`) y la key como
Bearer token. Se configura una vez, no por conversación.

**Revocar una key**: mismo lugar, ícono de basura junto a la key — efecto
inmediato, cualquier cliente que la esté usando deja de poder llamar tools.

**Conectar ChatGPT (OAuth, sin key)**: ChatGPT no deja poner headers, solo OAuth.
En ChatGPT → "Agregar servidor MCP personalizado":
- URL del servidor: `https://dashboard-alphamarino.vercel.app/api/mcp`
- Autenticación: **OAuth**
- Método de registro: **registro dinámico de clientes (DCR)** — no se captura
  client ID ni secreto; ChatGPT se registra solo en `/api/oauth/register`.

Al dar "Conectar", ChatGPT abre `/oauth/authorize`: si no hay sesión, pasa por el
login normal del dashboard y regresa ahí; luego la pantalla "ChatGPT quiere
acceder a tu cuenta" → **Autorizar**. El token queda ligado a TU perfil, con tus
mismos permisos (igual que una API key). Cualquier otro cliente MCP con OAuth +
DCR (Claude, etc.) se conecta igual.

**Revocar una conexión OAuth**: `/employees/[tu-id]` → "API keys de IA (MCP)" →
"Conexiones OAuth" → ícono de basura. Efecto inmediato: el access token deja de
validar en la siguiente llamada y el refresh token ya no se canjea.

**Agregar una tool nueva** (expandir la superficie poco a poco, como se acordó):
1. Reusa una server action REAL que ya exista — nunca dupliques la lógica de
   negocio dentro de `lib/mcp/tools.ts`.
2. Si esa action no acepta ya un `actingProfileId` opcional, agrégaselo (ver el
   patrón exacto en `requireTaskPermission`, `lib/actions/tasks.ts`, y en
   `addLogEntry`, `lib/actions/projects.ts`) — nunca le quites su chequeo de
   permiso normal para el camino con sesión. **Obligatorio**: la primera línea de
   la action debe ser `assertActingProfile(actingProfileId)`. Alternativa (la que
   usan Brand Brains): poner la lógica en un módulo SIN `"use server"` que reciba
   el cliente/perfil ya verificado, y que la action con sesión y el MCP lo llamen.
3. Registra la tool en `registerMcpTools` (`lib/mcp/tools.ts`) con
   `server.registerTool(nombre, {title, description, inputSchema}, handler)` —
   el handler recibe `(args, ctx)`, y el profile que está llamando sale de
   `ctx.http?.authInfo?.extra?.profileId` (ver `requireProfileId` en el mismo
   archivo).

## Operations — plantillas (solo admin)

`lib/mcp/operations-tools.ts`, registradas desde `registerMcpTools`. Solo las
PLANTILLAS de `/operations` (los proyectos reales no se tocan desde aquí todavía):

- `ops_ver_plantillas` — sin parámetros: lista tipos de proyecto, sets de fases, sets
  de tareas y puestos. Con `tipo_proyecto`/`set_fases`: árbol de fases y su set de
  tareas. Con `set_tareas`: cada tarea con puesto responsable, puestos a notificar,
  SOP, entregable y checklist numerado (🔒 = bloqueante).
- `ops_tipo_proyecto` (crear/editar/borrar; vincular set de fases),
  `ops_set_fases` (crear/renombrar/clonar/borrar), `ops_fase`
  (agregar/editar/mover/clonar/borrar; vincular set de tareas), `ops_set_tareas`
  (crear/editar/borrar), `ops_tarea_plantilla` (agregar/editar/mover/clonar/borrar;
  título, descripción, urgente, entregable, puesto, notificar_puestos, SOP),
  `ops_checklist` (agregar uno o varios/editar texto o bloqueante/mover/borrar) y
  `ops_puesto` (crear/renombrar/borrar).

Plantillas completas por JSON (recomendado para crear desde cero):
- `ops_guia` — explica el modelo y cómo se comporta en producción (asignación por
  puesto entre los miembros del proyecto, bloqueantes, notificaciones, entregable,
  estado de fase) y el formato JSON. Claude debe consultarla antes de diseñar.
- `ops_exportar_plantilla` — un tipo de proyecto completo como JSON.
- `ops_importar_plantilla` — crea todo en un paso (`importOperationsTemplate`).
  Por default es **vista previa** (valida y cuenta fases/tareas/checklist sin
  escribir); con `confirmar: true` crea. Valida antes de escribir (puestos y SOPs
  por nombre deben existir, nombres de fase únicos, títulos obligatorios) y si una
  escritura falla a la mitad borra lo creado. Si el nombre ya existe pide
  `si_existe: renombrar | sobrescribir`.
- El formato JSON es el mismo que usa la UI de `/operations` (Importar / Exportar
  JSON); ahora incluye `default_position`, `ping_positions`, `sop` y
  `deliverable_instructions`. La exportación de la UI usa el servidor
  (`exportOperationsTemplate`) para que el formato sea idéntico.

Reglas propias:
- **Solo admin**, igual que `/operations`. Antes el permiso vivía solo en las reglas
  de la base de datos; las acciones de `lib/actions/config.ts` ahora reciben
  `actingProfileId` y `opsClient()` exige rol admin explícito antes de usar el
  cliente admin (y `assignSopToTaskSetTask` igual).
- Fases, tareas y elementos del checklist se pueden referir por **número** (orden
  actual, 1 = primero) o por nombre/texto.
- **Borrar pide confirmación**: sin `confirmar: true` la tool solo describe qué se
  borraría (cuántas fases/tareas/elementos) y no hace nada.
- **Editar solo cambia lo que se manda**: `updateTaskInSet`/`updateProjectType`/
  etc. reescriben el registro completo, así que la tool completa con los valores
  actuales (no se pierde el SOP, el puesto o las notificaciones al editar otra cosa).
- Cambiar una plantilla no modifica proyectos ya creados.

## Reglas y restricciones

- **Nunca bypass de permisos**: toda tool nueva debe pasar por el mismo chequeo
  de `lib/permissions.ts` que ya usa el dashboard — si algo no tiene hoy un
  chequeo de rol explícito (ej. `addLogEntry`, que solo pide estar logueado),
  la tool de MCP hereda exactamente esa misma laxitud, ni más ni menos.
- **No se toca el bot de Telegram** — su propio camino (bypass de permisos vía
  rol de servicio, resolución de identidad por chat_id) se queda intacto, es una
  decisión ya tomada y confirmada explícitamente que no se revisita aquí.
- **`withMcpAuth` (`mcp-handler`) NO es OAuth real** aquí — se usa solo como el
  mecanismo para validar un Bearer token y adjuntar datos a `ctx.http.authInfo`;
  el verificador (`lib/mcp/auth.ts`) es una consulta directa a `mcp_api_keys`,
  nada de flujos de autorización.
- **Ambigüedad en la resolución por nombre nunca se adivina** — 0 o 2+ matches
  de proyecto/persona/tarea siempre regresan un error de texto listando las
  opciones, para que el chat le pida a la persona ser más específica.
- **Empieza chico a propósito**: hoy 6 tools de escritura y 9 de lectura.
  Tareas/proyectos (`crear_tarea`, `completar_tarea`, `agregar_nota_proyecto`,
  `listar_proyectos`, `estado_proyecto`, `miembros_proyecto`, `resumen_tareas`,
  `bitacora_proyecto`, `mis_tareas_pendientes`, `buscar_empleado`) heredan el
  mismo criterio de permiso que ya tenía cada acción original — ninguna de las
  de lectura tenía un chequeo de rol antes de esto (mismo criterio relajado que
  `addLogEntry` — "logueado" basta). **Ofertas de Servicios es distinto**:
  `crear_oferta`/`archivar_oferta`/`asignar_oferta_a_proyecto` son
  admin/subadmin-only — ese permiso vivía SOLO en RLS antes de esto (nunca en
  código de la app), así que se le agregó un chequeo explícito
  (`requireOffersPermission`, `lib/actions/services.ts`) para no heredar por
  accidente un bypass al usar el cliente admin desde MCP. `listar_ofertas`/
  `detalle_oferta`/`ofertas_de_proyecto` son de lectura, sin restricción
  (mismo catálogo que ya es visible para cualquiera en `/services`).
  Finanzas/Ad Nodes/etc. se agregan cuando se pidan, no de antemano.
- **De regalo, arregló un bug real ya reportado**: guardar una oferta
  EXISTENTE (`updateServiceOffer`) a veces tronaba con un error crudo de
  Postgres (`PGRST116`, "0 filas"). Causa real: esa función dependía
  ÚNICAMENTE de RLS (`is_admin_or_subadmin()`) para el permiso, y corría el
  `UPDATE` con el cliente de sesión normal — si esa evaluación de RLS fallaba
  por cualquier razón momentánea, el `UPDATE ... RETURNING` no tocaba ninguna
  fila y `.single()` convertía ese "0 filas" en ese error ilegible en vez de
  un "no tienes permiso" claro. Ahora el permiso se checa explícito en código
  (`requireOffersPermission`) y la escritura real siempre pasa por el admin
  client — RLS deja de ser la única línea de defensa para esta tabla.
- **Reglas de fallback de las tools de lectura** (aplican a todas, ver el
  código en `lib/mcp/tools.ts` para el detalle exacto de cada una):
  1. Un resultado vacío siempre explica POR QUÉ está vacío (nunca solo "[]" o
     una lista sin texto).
  2. Ambigüedad (2+ coincidencias por nombre) nunca se resuelve escogiendo la
     primera — error de texto listando las opciones.
  3. Toda lista potencialmente larga tiene un tope (20 para tareas/proyectos,
     10-30 configurable para la bitácora) y avisa cuando lo alcanzó.
  4. `resumen_tareas` exige proyecto O persona — nunca trae TODAS las tareas
     del sistema de un jalón.
  5. Una tarea personal (`is_personal`) de otra persona nunca se filtra en
     `resumen_tareas`, aunque el filtro de proyecto/asignado la hubiera
     alcanzado — solo visible si es la del que está preguntando.
  6. `estado_proyecto` distingue explícitamente proyectos sin ciclo de paid
     media configurado ("no aplica") de un ciclo vencido sin cerrar
     ("⚠️ VENCIDO").
  7. Fechas siempre se muestran junto al dato al que corresponden (ninguna
     lista mezcla información de distintos momentos sin fecha visible).

## Quién puede ver/hacer qué

Cualquier empleado con sesión puede generar su propia key y usar las tools — el
límite real es el mismo que ya tiene esa persona en el dashboard (ej. si su rol
no tiene `manage_tasks`, `crear_tarea`/`completar_tarea` le van a fallar con
"Permission denied", igual que le pasaría en la UI normal).

## OAuth 2.1 (ChatGPT) — 2026-11-05

Servidor de autorización propio, dentro de esta misma app. Se evaluó Supabase
OAuth 2.1 Server (soporta DCR y el SDK ya trae `auth.oauth.*`), pero emite JWTs
de sesión de Supabase: el cliente conectado podría pegarle directo a PostgREST
con la RLS del usuario (varias tablas son amplias porque el permiso fino vive
en `lib/permissions.ts`), y un JWT revocado sigue vivo hasta que expira. Aquí
los tokens son opacos, solo valen en `/api/mcp` y se revocan al instante.

- `/.well-known/oauth-protected-resource` (RFC 9728, también con sufijo
  `/api/mcp`) y `/.well-known/oauth-authorization-server` (RFC 8414). Issuer =
  origen público del deployment; no hay variables de entorno nuevas.
- `POST /api/oauth/register` — DCR (RFC 7591). Abierto; registrar no da acceso.
  `redirect_uris` https (o http en localhost), sin fragmento, máx. 10. Clientes
  públicos (`none`) o con secreto (`client_secret_post`/`_basic`, hasheado).
- `/oauth/authorize` — consentimiento; exige sesión (el `proxy.ts` manda a
  `/login?next=…` y el login regresa ahí). `redirect_uri` debe ser EXACTAMENTE
  uno de los registrados (si no, error en pantalla, nunca redirige). PKCE S256
  obligatorio. `resource` (RFC 8707), si viene, debe ser este `/api/mcp`.
  Respuesta con `iss` (RFC 9207).
- `POST /api/oauth/token` — `authorization_code` (PKCE obligatorio,
  `redirect_uri` idéntico) y `refresh_token` (rota en cada uso).
- Códigos: un solo uso (canje atómico), 5 min; reusar un código revoca los
  tokens que emitió. Access token 1 h (`amoa_…`), refresh 60 días (`amor_…`).
  Todo guardado como SHA-256.
- `verifyMcpToken` acepta los dos tipos: prefijo `amoa_` → `mcp_oauth_grants`;
  cualquier otro → `mcp_api_keys` (sin cambios). En ambos casos
  `extra.profileId`, así que las tools no distinguen.
- Un scope único, `mcp` (= las tools con los permisos del empleado).

## Dónde vive esto en el código

- `supabase/migrations/081_mcp_api_keys.sql` — tabla `mcp_api_keys`.
- `supabase/migrations/121_mcp_oauth.sql` — `mcp_oauth_clients`,
  `mcp_oauth_codes`, `mcp_oauth_grants` (una fila = una conexión).
- `lib/mcp/oauth.ts` (núcleo: metadata, hashes, PKCE, emisión/rotación de
  tokens), `lib/mcp/oauth-authorize.ts` (validación de la autorización),
  `app/oauth/authorize/` (página + server actions), `app/api/oauth/register`,
  `app/api/oauth/token`, `app/.well-known/*`.
- `lib/actions/mcp-keys.ts` — CRUD de keys (generar/listar/revocar), sesión normal.
- `lib/mcp/auth.ts` — `verifyMcpToken`, el verificador de `withMcpAuth`.
- `lib/mcp/tools.ts` — `registerMcpTools`, las tools + resolución de
  proyecto/persona/oferta por nombre.
- `app/api/mcp/route.ts` — el endpoint (`createMcpHandler` + `withMcpAuth` de
  `mcp-handler`, sobre `@modelcontextprotocol/server`).
- `lib/actions/services.ts` (`requireOffersPermission`, `createServiceOffer`,
  `updateServiceOffer`, `archiveServiceOffer`) y
  `lib/actions/service-deliverables.ts` (`requireProfile`,
  `attachServiceOfferToProject`) — el permiso admin/subadmin explícito +
  `actingProfileId` opcional que ganaron estas funciones reales.
- `components/employees/mcp-api-keys.tsx` — UI para generar/revocar keys y ver/revocar
  conexiones OAuth (`listMcpOAuthConnections`/`revokeMcpOAuthConnection`), montada en
  `app/(dashboard)/employees/[id]/page.tsx` (sección self-only, junto a Telegram).
- `lib/actions/tasks.ts` (`requireTaskPermission`, `createTask`,
  `updateTaskStatus`) y `lib/actions/projects.ts` (`addLogEntry`) — el parámetro
  `actingProfileId` opcional que estas mismas funciones reales ahora aceptan.

## Proyectos por nombre (todas las herramientas)

`lib/mcp/resolve-project.ts`: coincidencia exacta (sin mayúsculas ni acentos)
antes que parcial; con varias coincidencias gana el proyecto **activo**, luego
cualquiera no archivado. Un archivado solo se usa si es el único que coincide.
Solo hay error si siguen empatados varios activos (lista nombres y estado).
Las herramientas de Meta solo consideran proyectos activos.

## Actividad de IA (provisional, solo admin) — 2026-10-14

Los cambios que hace Claude en Meta vía MCP ya **no** van a la bitácora del
proyecto: se guardan en la tabla `ai_activity` (migración 116; `log()` en
`lib/mcp/meta-tools.ts`). Campos: proyecto, `actor` (`claude_mcp`; a futuro
`agente`), quién lo pidió, plataforma, resumen, motivo opcional. Se ve en
`/actividad-ia` (solo rol admin; link en el sidebar), agrupado por sesión
(mismo proyecto, IA y solicitante, sin pausas de >30 min) y filtrable por
proyecto. La migración movió ahí las notas viejas "Meta (vía Claude)".

## crear_tarea completo — 2026-10-15

`crear_tarea` ya acepta lo mismo que la tarea del dashboard: `avisar_al_terminar`
(nombres; "yo" = quien llama; lista vacía = todo el equipo del proyecto),
`checklist` (texto + bloqueante), `requiere_entregable` + instrucciones y `fase`
(nombre dentro del proyecto). `createTask` ahora también guarda `phase_id`.

**Bitácora solo explícita (2026-10-16):** ninguna herramienta MCP escribe en la
bitácora por su cuenta. Meta y entregables (marcar, ajustar, agregar, quitar)
van a `ai_activity`. La bitácora solo recibe `agregar_nota_proyecto` y notas de
`captura_rapida`, y las descripciones indican usarlas únicamente cuando el
usuario lo pide.

**meta_estado_cliente con embudo (2026-10-19):** además de gasto/resultados/CTR,
pide `reach, inline_link_clicks, outbound_clicks` y las acciones del embudo
(landing_page_view → view_content → add_to_cart → initiate_checkout →
purchase, tomando `omni_` primero). Por campaña y conjunto muestra CPM, CTR de
enlace, clics salientes y el embudo; con `detalle: true` también por anuncio,
más frecuencia (solo por anuncio: el alcance no se puede sumar entre anuncios).

**Campañas manuales en el MCP (2026-10-22):** `campanas_manuales`
(`lib/mcp/manual-tools.ts`, solo lectura, admin/subadmin) lista las campañas
de otros canales registradas a mano en el proyecto con lo del periodo (misma
cuenta que el dashboard: última captura en el rango − última anterior) y
avisa si una activa lleva 7+ días sin captura. `meta_estado_cliente` agrega al
final "Otros canales" por canal y el **total combinado** Meta + manuales,
aclarando que lo manual son capturas, no datos en vivo.

**CTA de anuncios de mensajes y problemas de entrega (2026-10-24):** bug real —
un anuncio de una campaña de mensajes a Instagram se creó con `MESSAGE_PAGE`
(Messenger); Meta lo dejó ACTIVE pero no lo entregaba. Ahora el CTA sale del
`destination_type` del conjunto (`ctaForAdset` en `meta-tools.ts`):
INSTAGRAM_DIRECT → INSTAGRAM_MESSAGE `{app_destination: INSTAGRAM_DIRECT, link:
instagram.com}`, MESSENGER → MESSAGE_PAGE, WHATSAPP → WHATSAPP_MESSAGE. Un CTA
pedido que no corresponde (o uno de mensajes en un conjunto que no es de
mensajes) se rechaza. `meta_editar_anuncio` corrige el CTA aunque no se pida
otro cambio. Tras crear/editar se relee el anuncio y se reporta `issues_info`.
`meta_estado_cliente` pide `issues_info` de conjuntos y anuncios: 🔴 en la
línea y un bloque "PROBLEMAS DE ENTREGA" arriba aunque el estado diga ACTIVE.

**CTR e impresiones en meta_estado_cliente (2026-11-04):** impresiones en los tres niveles (y alcance por anuncio con detalle); en campaña, conjunto y anuncio se
reportan los dos, etiquetados: **CTR (todos)** = todos los clics / impresiones
(el de Ads Manager por defecto, el principal; sirve para cualquier objetivo) y
**CTR enlace** = clics al destino / impresiones ("— (sin clics a enlace)" si no
hay, típico en campañas de mensajes o interacción). Antes campaña/conjunto solo
daban el de enlace y el anuncio decía "CTR" sin aclarar cuál.

**GET /api/mcp → 405 (2026-11-04):** el GET abría un stream SSE que no usamos
y Vercel lo cortaba a los 300 s ("Task timed out" cada 5 min en los logs).
Ahora responde 405 (permitido por Streamable HTTP); los clientes usan POST.

## Dominios y renovaciones — 2026-11-05

`lib/mcp/domain-tools.ts`. Permiso `view_domains` (igual que /finances/domains).

- `dominios` — lista/busca (dominio o cliente), `vencen_en_dias` incluye vencidos.
- `renovar_dominio` — mismo flujo que el botón Renovar (`lib/finance/domains.ts` `renewDomainCore`, compartido con la server action): fecha (default hoy MX), `cobrar_dominio` / `cobrar_mantenimiento` (crean ingresos MXN→USD), `extender_un_anio` (desde la fecha de renovación actual). Dos pasos con `confirmar`.
- `crear_dominio` / `editar_dominio` — dos pasos; solo cambia lo indicado; cliente vacío = propio.
- `renovaciones` — próximos N días (default 30) + vencidos: dominios (si `view_domains`) y gastos anuales activos de `recurring_expenses` por aniversario de `start_date` (si `view_global_finances`).

## briefs_concepto (solo lectura) — 2026-11-05

`lib/mcp/brief-tools.ts`. `briefs_concepto(proyecto, concepto?, sin_guion_completo?)`: por concepto, sus briefs (nombre, brief_id, link de editor, notas), cada guion con estado de revisión, feedback, hook (primera línea hablada) y texto completo (sección, hablado, 🎬 visual, 📝 en pantalla), y los `asset_id` ligados a cada brief (`creative_assets.brief_id`, marcando versiones anteriores/revisiones). Marca "SIN CREATIVO" y lista creativos sin brief. Sin `concepto` omite conceptos sin briefs ni creativos. Por defecto usa el mismo alcance que el Creative Tracker: ciclo activo (o el más reciente) vía creative_concept_cycles/creative_asset_cycles + Evergreen; `todos_los_ciclos: true` trae el historial.

## generar_recibo — 2026-11-05

`lib/mcp/receipt-tools.ts`. Permiso `view_global_finances`. Mismo flujo que `/recibo` del bot de Telegram (`sendReciboToMake` en `lib/telegram-bot/handlers/recibos.ts`, compartido): manda a `MAKE_RECIBOS_WEBHOOK_URL` con monto en letras determinístico, email del cliente si existe, estatus Pendiente y `fuente: "Claude (MCP)"`. El PDF lo regresa Make al chat `TELEGRAM_ALLOWED_CHAT_ID`. Dos pasos con `confirmar`. Si el comprobante es imagen, Claude extrae los datos antes de llamar.

## Brand Brains: importar y crear — 2026-11-06

`lib/mcp/brand-brain-tools.ts`. Permiso `access_brand_brains` (el mismo que deja entrar a `/brand-brains`).

- `importar_brand_brain(instagram?, sitio_web?)` — mismo análisis que el botón "Importar" de `/brand-brains`: Instagram (perfil + 15 posts vía Apify, `APIFY_API_TOKEN`) y/o sitio web (texto + colores del CSS), analizados con Claude. Si vienen los dos, se unen igual que en el modal (`mergeBrainDrafts`, `lib/brand-brains/merge-draft.ts`). **No guarda nada**: devuelve vista previa + `borrador` en JSON y avisa si ya existe un Brand Brain con ese nombre. Con Instagram tarda 1-2 min.
- `crear_brand_brain(nombre, industria?, idioma?, descripcion?, tono_de_voz?, audiencia?, usps?, beneficios?, dolores?, caracteristicas?, ctas?, colores?, contexto_adicional?, iniciales?, logo_url?, confirmar)` — da de alta el Brand Brain (normalmente con el borrador, ajustado con el usuario). Dos pasos con `confirmar`. `logo_url` (solo https; la foto de perfil de Instagram expira) se copia al bucket `brand-brains` como logo y logo cuadrado. `created_by` = quien llama.
- El núcleo vive en módulos SIN `"use server"` (`lib/brand-brains/import-core.ts`, `lib/brand-brains/storage.ts`, `lib/brand-brains/lines-core.ts`), compartidos con las server actions de la UI (`lib/actions/brand-brain-import.ts`, `createBrandBrain`, `createBrandLine`, `autofillBrandLine`). La UI les pasa su cliente con sesión (RLS); el MCP, el admin tras checar `access_brand_brains`.

## Brand Brains: leer, editar y brand lines — 2026-11-06

También en `lib/mcp/brand-brain-tools.ts`, mismo permiso `access_brand_brains`. Brand Brain y línea se buscan por nombre (exacto o parcial; si hay varias coincidencias pide ser más específico).

- `brand_brains(busqueda?)` — lista con industria, idioma y nombres de sus brand lines.
- `detalle_brand_brain(brand_brain)` — todos los campos + cada brand line (descripción, USPs, dolores, keywords, color).
- `editar_brand_brain(brand_brain, nuevo_nombre?, industria?, …, colores?, confirmar)` — solo cambia lo indicado; las listas se REEMPLAZAN completas (leer detalle primero). Texto vacío borra. Dos pasos con antes → después. Logos: siguen solo en la UI.
- `crear_brand_line(brand_brain, nombre, descripcion?, usps?, dolores?, keywords?, color?, autollenar?, confirmar)` — `autollenar` usa la misma IA que el botón de la UI (`autofillBrandLineCore`; la `descripcion` es la fuente de verdad) y solo llena lo que no mandaste. La vista previa devuelve los campos generados para confirmar exactamente eso. Avisa si ya existe una línea con ese nombre. Posición: al final.
- `editar_brand_line(brand_brain, linea, nuevo_nombre?, descripcion?, usps?, dolores?, keywords?, color?, confirmar)` — igual que editar_brand_brain.
- Borrar Brand Brains o líneas sigue siendo solo desde la UI.

## Conceptos ↔ brand lines — 2026-11-07

Cada concepto creativo puede estar ligado a una línea (`creative_concepts.brand_line_id`, migración 033; los briefs tienen su propio `brand_line_id`).

- `briefs_concepto` muestra la línea de cada concepto, y la del brief solo si es distinta.
- `detalle_brand_brain` lista bajo cada línea sus conceptos (proyecto, estado, # creativos; máx. 25 por línea) y al final los conceptos de los proyectos de esa marca que no tienen línea.
- `asignar_linea_concepto(proyecto, concepto, linea | "ninguna", confirmar)` — igual que el selector de línea del concepto en el Creative Tracker: solo admin/subadmin (mismo permiso que `updateConcept`) y solo líneas del Brand Brain del proyecto. Dos pasos. No cambia la línea de los briefs ya creados (la UI tampoco).

## Guiones: generar, crear, editar, eliminar y aprobar — 2026-11-07

`lib/mcp/script-tools.ts`. Solo admin/subadmin (igual que el editor de briefs). Todo lo que escribe va en dos pasos (`confirmar`). Proyecto, concepto y brief por nombre; `brief` (título o brief_id) solo si el concepto tiene varios.

- `briefs_concepto` (lectura) ahora numera guiones (`Guion #N`, con su clave) y líneas; esos números son los que usa `editar_guion`.
- `generar_guiones_ia(proyecto, concepto, estructura, variantes)` — misma IA que "Crear rápido" (`writeScriptFromConcept`, estructuras de `SCRIPT_STRUCTURES`, semillas `SCRIPT_VARIANT_SEEDS`) con el Brand Brain del proyecto y la línea del concepto. No guarda: devuelve las opciones en formato de `crear_guion`.
- `crear_guion(…, titulo?, lineas[{seccion, hablado, visual, en_pantalla}])` — agrega el guion al brief (clave `manual_N`); si el concepto no tiene brief, lo crea como "Crear rápido" (Brand Brain del proyecto, línea del concepto). Queda en revisión del cliente.
- `editar_guion(…, guion, lineas | cambios/quitar_lineas/insertar, titulo?)` — `guion` por número, título o clave. Los números de línea son los del guion antes de editar (`applyLineEdits`). Cambiar líneas lo regresa a revisión del cliente (como el editor); solo renombrar no.
- `eliminar_guion` — igual que borrar la referencia en el editor (`patchRemoveReference`): quita la clave de guion, título, revisión y, si era video de referencia, del brief.
- `aprobar_guiones(…, guiones?)` — aprobación interna sin cliente (`patchApproveScripts`); sin lista aprueba todos.
- La lógica de los guiones vive en `lib/briefs/scripts-core.ts` (sin `"use server"`), compartida con las actions del dashboard (`updateBriefScript`, `deleteBriefReference`, `updateScriptTitle`, `autoApproveBriefScripts`, `addManualScriptToBrief`…).
- No disponible por MCP: regenerar un guion desde un video de referencia (transcripción, tarda minutos) ni el constructor por mecánicas; el chat puede escribir el guion directamente.

## detalle_tarea — 2026-11-09

`lib/mcp/task-tools.ts`. Solo lectura. Una tarea con todo su detalle: estado, proyecto y fase, responsable y puesto (con aviso si la asignación por puesto falló), fechas (creada, vence, completada, último cambio), descripción, checklist (marcados y cuáles bloquean), ping y a quién avisa, entregable requerido (instrucciones y lo subido) y SOP (propio o heredado de la plantilla). Busca por `titulo` (parcial; exacto gana), opcional `proyecto`, o `tarea_id`; incluye completadas. Si hay varias coincidencias, las lista con su `tarea_id`. Visibilidad igual que la RLS de `tasks`: admin/subadmin ven todo; un empleado, tareas de proyectos donde es miembro o asignadas a él; las personales solo su dueño.

## Límite de tiempo por herramienta — 2026-11-11

`/api/mcp` muere a los 300 s en Vercel ("Task timed out"); el cliente se quedaba sin respuesta y solía reintentar. `withToolDeadlines` (`lib/mcp/tool-deadline.ts`, aplicado al inicio de `registerMcpTools`) envuelve TODAS las herramientas: si una pasa de 270 s, el chat recibe un error claro ("tardó más de 270 s… revisa antes de repetirla; si es de escritura no la reintentes") y queda en logs como `[mcp] <herramienta> pasó de 270 s`. Las esperas largas conocidas también tienen su propio límite: Apify en `importar_brand_brain` (`timeout=140` + corte a los 150 s, con mensaje claro) y el análisis de video (ver `ad-lab-analisis.md`).
