# Ad Lab — Auditorías de cuentas publicitarias — Guía para agentes

**Ruta:** `/ad-lab/auditorias` → `/ad-lab/auditorias/[cuenta]` → `…/c/[campaña]` → `…/c/[campaña]/a/[anuncio]`
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

Fase 1 (esta): captura desde la extensión, vista por conjunto (Creativo /
Tienda), detalle del anuncio con videos sincronizados, curva y embudo.
Fase 2 (pendiente): ganchos / cuerpos / cierres que funcionan (requiere el
análisis de concepto por partes), hipótesis con evidencia, pantalla para
editar las métricas. El mockup de todo vive en el artifact "Ad Account Judge".

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

- `supabase/migrations/124_ad_audits.sql` — tablas.
- `extension/content/audit.js` — captura; `extension/background.js` →
  `graph`/`graphAll` (con lectura de uso de límites).
- `app/api/extension/audit/[step]/route.ts` + `lib/ad-audit/ingest.ts` — recepción.
- `lib/ad-audit/metrics.ts` — fórmulas, medianas, veredictos, curva (puro).
- `lib/ad-audit/queries.ts` — lecturas para las páginas.
- `lib/actions/ad-audits.ts` — borrar, prospecto/cliente.
- `components/ad-audit/*` — tabla de campaña, detalle, lista de cuentas.
- `app/(dashboard)/ad-lab/auditorias/**` — páginas.
