# Ad Lab — Auditorías de cuentas publicitarias — Guía para agentes

**Ruta:** `/ad-lab/auditorias` → `/ad-lab/auditorias/[cuenta]` → `…/c/[campaña]` → `…/c/[campaña]/a/[anuncio]`; `…/[cuenta]/funciona` (Qué funciona); `/ad-lab/auditorias/metricas`
**Para quién:** quien tenga `access_ad_lab` (admin y subadmin por defecto)
**Actualizado:** 2026-11-26

## Qué es y para qué sirve

Auditar campañas de cualquier cuenta publicitaria que la persona vea en su Ads
Manager (propia, de un cliente o prestada por un prospecto), **sin conectarla
al dashboard**, con foco en el creativo: qué anuncios ganan y pierden dentro
de cada conjunto y en qué etapa del embudo se rompe cada uno, respaldado por
datos reales de Meta y con los videos a la vista. Es exclusivamente para
auditar: los videos son la versión ligera que entrega la API de Meta, no el
original (no se reutiliza material).

Construido (2026-11-26):
- **Fase 1** — captura desde la extensión, vista por conjunto (Creativo /
  Tienda), detalle del anuncio con videos sincronizados, curva y embudo.
- **Fase 2** — análisis por partes (gancho/cuerpo/cierre), pantalla «Qué
  funciona», hipótesis por campaña, métricas editables.
- **Fase 3** — seguimiento de hipótesis (abierta/confirmada/descartada con nota
  y «evidencia hoy» tras re-capturar).
También consultable desde el MCP (solo lectura): `auditorias`,
`auditoria_campana`, `auditoria_anuncio`, `auditoria_que_funciona`,
`auditoria_hipotesis`, `auditoria_marca`, `metricas_auditoria`.
- **Marca inferida** (2026-11-26) — Brand Brain + Brand Lines por cuenta, ver abajo.
Pendiente / ideas: reporte compartible para el prospecto; actualizar cuentas de
clientes sin la extensión (usuario de sistema). El mockup vive en el artifact
"Ad Account Judge".

## Conceptos y vocabulario clave

- **Captura**: la extensión (`extension/content/audit.js`) lee de la Graph
  API con la **sesión** del usuario: cuenta, campañas seleccionadas
  (`selected_campaign_ids` en la URL del Ads Manager), conjuntos, anuncios,
  métricas **por anuncio y por día**, curva de retención y video de cada
  anuncio. Manda todo al dashboard en pasos (`/api/extension/audit/{start,
  structure,daily,media,finish}`). El token nunca sale del navegador.
- **Conteos crudos, no porcentajes**: `audit_ad_daily` guarda impresiones,
  gasto, reproducciones (3 s, 25/50/75/95/100 %, ThruPlay), clics de salida,
  visitas, carritos, checkouts, compras y valor. Las métricas se calculan al
  mostrarlas (`lib/ad-audit/metrics.ts`): cambiar una fórmula recalcula todas
  las auditorías.
- **Atribución**: conversiones (carrito, checkout, compra y su valor) con
  **7 días después del clic** (`7d_click`). De cada evento se toma una sola
  variante (`omni_*` primero) para no contar doble.
- **Métricas (fórmulas de la agencia)**: Hook rate = 3 s ÷ impresiones;
  Hold rate = **50 % ÷ 3 s**; CTR = clics de salida ÷ impresiones;
  CPA = gasto ÷ compras; Clic → visita; Visita → carrito; Carrito → checkout;
  Checkout → compra; Conv. sesión = compras ÷ visitas; AOV; ROAS. Cada una
  tiene **muestra mínima** (`min`); debajo se muestra en gris y no se compara.
- **Comparación justa**: todo se compara contra la **mediana de los anuncios
  del mismo conjunto** (misma audiencia, presupuesto y fechas). ↑/↓ = arriba o
  abajo de la mediana; verde = mejor, naranja = peor; ±5 % = "en la media".
- **Veredictos**: *Ganador/Perdedor* por CPA contra la mediana (≥3 compras);
  *Sin oportunidad*: <5 % del gasto del conjunto (si hook y CTR son mejores:
  "¿ganador escondido?"); *Sin datos*: <1,000 impresiones o <3 compras;
  *Sin con quién comparar*: único anuncio con compras suficientes.
- **Dónde se rompe**: primera etapa del embudo (hook → hold → CTR → clic→visita
  → visita→carrito → carrito→checkout → checkout→compra) que queda ≥15 % peor
  que la mediana.
- **Evento no medido**: si una campaña tiene ≥200 clics y 0 de un evento
  (visitas, carrito, checkout, compra), se marca `missing_events` y sus
  métricas dicen "no medido" en vez de 0 %.
- **Curva de retención**: `video_play_curve_actions` de Meta, 22 puntos
  (0–14 s uno por segundo, luego tramos 15/20/25/30/40/50/60+). "Mayor caída" =
  tramo con más % perdido por segundo desde el segundo 1.

- **Período**: el de los presets de Meta (`last_7d`/`last_30d`/`last_90d`),
  calculado en la zona horaria de la cuenta y SIN hoy, igual que el
  «Últimos N días» del Ads Manager (hasta 2026-11-26 se usaba UTC con hoy
  incluido y el período salía corrido un día). Las diferencias que quedan
  contra el Ads Manager son de atribución: compara con la columna en
  «7 días después del clic».
- **Partes del creativo** (`lib/ad-audit/parts.ts`): el análisis de concepto
  de Ad Lab (`analyzeLibraryAd`) devuelve `partes` = gancho/cuerpo/cierre con
  `desde`/`hasta` en segundos y un `tipo` de una **lista cerrada** (para poder
  agrupar). Se analiza **una vez por video** (clave `audit:v:<video>`; en
  imágenes `audit:i:<anuncio>`) y se guarda en `ad_analyses`, así que también
  se abre desde Ad Lab → Análisis. Análisis viejos sin `partes` se rehacen al
  pedirlo.
- **Qué funciona** (`lib/ad-audit/findings.ts`): por tipo de parte, la métrica
  que le toca (gancho → hook rate / CTR en imagen; cuerpo → hold rate /
  visita→carrito en imagen; cierre → conversión de sesión + AOV). Número
  grande = pooled (suma de numeradores ÷ suma de denominadores). Veredicto =
  diferencia promedio de cada anuncio **contra la mediana de su propio
  conjunto**, ponderada por denominador: ≥ +10 % «Funciona», ≤ −10 % «No
  funciona», < 2 anuncios con muestra «Pocos datos». Combinación que más vende
  = gancho+cuerpo+cierre con más compras entre las que superan el ROAS de la
  cuenta (mínimo 3 compras). Cada video reproduce SOLO su tramo.
- **Hipótesis** (`generateCampaignHypotheses`): una llamada a Claude por
  campaña con una tabla compacta (métricas con muestra suficiente contra la
  mediana, veredicto, dónde se rompe, partes, mayor caída de retención). Solo
  puede usar esos números; compara dentro del conjunto; máx. 2 por conjunto y
  8 en total; incluye perdedores. Regenerar borra solo las abiertas sin nota.
- **Seguimiento**: confirmar/descartar/reabrir con nota (`setHypothesisStatus`).
  «Evidencia hoy» muestra el veredicto ACTUAL de cada anuncio citado; si los
  datos son de otro período que la hipótesis, lo avisa para revisarla.
- **Métricas editables** (`audit_metric_overrides`, `applyOverrides`):
  numerador, denominador y muestra mínima por métrica. Recalcula todas las
  auditorías. Ver: todos con Ad Lab; cambiar: solo admin/subadmin
  (`requireRole` en la action).

- **Marca inferida** (`lib/ad-audit/brand.ts`, migración 126): un Brand Brain y
  sus Brand Lines **por cuenta auditada**, con los mismos campos que
  `brand_brains` / `brand_lines`. Fuentes: el sitio principal (dominio de
  destino con más gasto, leído con `draftFromWebsite`, que también da los
  colores), el copy y la página de destino de los 50 anuncios con más gasto y
  lo que el análisis de concepto dedujo de cada creativo (qué vende, audiencia,
  oferta, dolor). Una llamada a Claude; solo evidencia. Cada línea = un
  producto/colección/servicio distinto (máx. 8) y **cada anuncio queda ligado a
  su línea** (`audit_ads.audit_brand_line_id`) para poder ver qué funciona por
  línea más adelante. Vive SOLO en `audit_brand_brains` / `audit_brand_lines`:
  no aparece en `/brand-brains`.
- **Llevar a Brand Brains** (`promoteAuditBrand`): crea el Brand Brain y sus
  líneas reales (con `insertBrandLine`) y guarda el vínculo
  (`promoted_brand_brain_id`, `promoted_brand_line_id`). Exige además
  `access_brand_brains`. Si ya se llevó, solo enlaza. Volver a inferir rehace la
  copia de la auditoría (líneas incluidas) pero NO toca lo que ya está en Brand
  Brains.

## Cómo hacer las acciones comunes

**Auditar**: Ads Manager → pestaña Campañas → marcar campañas → botón
«Auditar N campañas» → período (7/30/90 días) → «Enviar al dashboard». Tarda
minutos a propósito. Al terminar, aviso con «Abrir auditoría».

**Actualizar**: repetir la captura; todo es *upsert* (no duplica). Si se
corta a la mitad, repetir completa la parte que faltó.

**Leer una campaña**: pestañas por conjunto; vista **Creativo** (Hook, Hold,
CTR, CPA) o **Tienda** (embudo de la tienda, AOV, ROAS). Pasar el mouse por
una columna muestra fórmula y mínimo; por una celda, conteos y mediana.

**Detalle de un anuncio**: video del anuncio al lado del ganador (mejor CPA)
del mismo conjunto. Los botones de momentos y el clic en la curva llevan
**ambos** videos al mismo segundo y muestran % que sigue viendo en cada uno.

**Analizar por partes**: en la campaña, «Analizar partes de N creativos»
(de 2 en 2 desde el navegador, ~1 min por video; no cerrar la pestaña; lo ya
analizado se guarda). Después, la tabla muestra G/C/Ci por anuncio.

**Qué funciona**: desde la cuenta o la campaña → pestañas Ganchos / Cuerpos /
Cierres, Video / Imagen. Pasar el mouse sobre un video reproduce su tramo.

**Hipótesis**: al final de la campaña, «Generar hipótesis» (~30 s). Mejor
después de analizar por partes.

**Marca inferida**: en la cuenta → «Marca inferida» → «Inferir Brand Brain y
Brand Lines» (~1 min). «Llevar a Brand Brains» la crea en `/brand-brains`.

**Borrar**: en `/ad-lab/auditorias`, papelera → «Borrar todo»: borra métricas,
anuncios y los archivos en Storage. **Prospecto/Cliente**: clic en la etiqueta.

## Reglas y restricciones

- **Límites de Meta**: las lecturas cuentan contra los límites del Ads Manager
  del usuario. La extensión lee los encabezados de uso y pausa sola (≥75 % →
  30 s; ≥90 % → 2 min); errores 4/17/32/613 detienen la captura con aviso. En
  cuentas prestadas, un patrón raro puede hacer que Facebook pida verificación:
  no acelerar.
- Máximo 10 campañas por auditoría; insights por día en tandas de 2,000 filas
  (límite de 4.5 MB de Vercel); videos de 3 en 3 (los enlaces de Meta caducan
  en horas, se copian al capturar).
- Tablas `audit_*` con RLS **sin políticas**: todo se lee/escribe desde el
  servidor con el cliente admin tras `requireAuditAccess`
  (`lib/ad-audit/access.ts`). Son datos sensibles de prospectos.
- Videos con `preload="none"` en la tabla (se reproducen al pasar el mouse) para
  no gastar transferencia de Storage.
- No se usa ffmpeg ni se recortan videos: el navegador pide solo los segundos
  que reproduce.

## Dónde vive esto en el código

- `supabase/migrations/124_ad_audits.sql`, `125_ad_audit_hypotheses_metrics.sql`, `126_ad_audit_brand.sql` — tablas.
- `lib/ad-audit/parts.ts` (partes y tipos), `lib/ad-audit/findings.ts` (Qué funciona).
- `extension/content/audit.js` — captura; `extension/background.js` →
  `graph`/`graphAll` (con lectura de uso de límites).
- `app/api/extension/audit/[step]/route.ts` + `lib/ad-audit/ingest.ts` — recepción.
- `lib/ad-audit/metrics.ts` — fórmulas, medianas, veredictos, curva (puro).
- `lib/ad-audit/queries.ts` — lecturas para las páginas.
- `lib/actions/ad-audits.ts` — borrar, prospecto/cliente, analizar por partes, hipótesis, métricas.
- `components/ad-audit/*` — tabla de campaña, detalle, lista de cuentas.
- `lib/mcp/audit-tools.ts` — consulta desde el MCP (solo lectura; ver mcp-server.md).
- `lib/ad-audit/brand.ts` + `components/ad-audit/audit-brand.tsx` — marca inferida.
- `app/(dashboard)/ad-lab/auditorias/**` — páginas.
