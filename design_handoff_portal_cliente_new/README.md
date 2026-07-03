# Handoff: Portal del Cliente — Paid Media (v2, jerarquía Servicio → Concepto → Piezas)

**Repo destino:** `4REMi/dashboard-alphamarino` (rama base: `claude/plan-alpha-marino-dashboard-LZAG4`)
**Ruta a reemplazar:** `app/share/concepts/[projectId]/page.tsx` + `components/share/*`

## Overview

Rediseño completo del **portal público del cliente** para proyectos de Paid Media. El portal actual muestra un solo scroll agrupado por concepto; este rediseño introduce la jerarquía real del negocio:

**Servicio → Conceptos → Piezas (guion VO / video / imagen estática)**

Objetivos del rediseño:

1. **La jerarquía ES la navegación.** El cliente entra y elige un servicio; dentro ve sus conceptos; dentro de cada concepto, sus piezas. Migas de pan en cada nivel.
2. **Los guiones VO son ciudadanos de primera clase.** Un guion se muestra como texto numerado por escenas con su propio flujo de aprobación ("al aprobarlo pasamos a producir el video") — no como un asset más.
3. **Dimensión temporal.** Los conceptos se agrupan en: **En curso (mes actual)**, **Evergreen (siempre activos, validados)** y **Meses anteriores (archivo de solo lectura, agrupado por mes)**. El portal transmuta mes a mes sin perder historia.
4. **Revisión rápida.** Atajo "⚡ Revisar de corrido" que recorre todas las piezas pendientes una por una con barra de progreso y pantalla de cierre.
5. **Estrategia siempre visible pero secundaria.** Panel/acordeón con pestañas **Identificación / Teoría del ángulo / Mecanismo** replicando los campos del dashboard interno.

## About the Design Files

Los archivos en `design_files/` son **referencias de diseño creadas en HTML** (prototipos interactivos), NO código de producción. La tarea es **recrear estos diseños en el codebase Next.js existente** usando sus patrones establecidos (App Router, server components para data, client components para interacción, Tailwind, Supabase).

- `design_files/Portal Cliente Movil.dc.html` — prototipo móvil completo (ábrelo en un navegador; incluye marco de iPhone). Es la experiencia principal: el cliente típico es dueño de negocio poco técnico que entra desde el celular.
- `design_files/Portal Cliente Desktop.dc.html` — mismo flujo en desktop (sidebar de navegación + panel de estrategia sticky + modal de revisión rápida).
- `ios-frame.jsx`, `browser-window.jsx`, `support.js` — runtime de los prototipos; ignóralos para la implementación.

Ambos prototipos son **funcionales**: navega, aprueba, pide cambios, abre el archivo — el comportamiento que veas es el comportamiento esperado.

## Fidelity

**High-fidelity.** Colores, tipografía, espaciados, radios y flujos están finalizados. Recrear pixel-perfect con Tailwind. El copy de los datos de ejemplo (Clínica Sonría) es placeholder; el copy de UI (labels, botones, mensajes) es final.

## Modelo de datos requerido

El diseño asume esta jerarquía (mapear al esquema Supabase existente):

- **Servicio** (nuevo agrupador, o derivado de `product_service` en `creative_concepts`): `nombre`, `emoji/icono`.
- **Concepto** (`creative_concepts`): `nombre`, `angle_type` (badge oscuro con emoji), `funnel_stage` (TOF/MOF/BOF → "Audiencia fría/tibia/caliente"), `vigencia`: `actual` | `evergreen` (status Evergreen existente) | `archivado` + `mes` (para archivados), y los campos de estrategia:
  - **Identificación:** `principio_organizador`, `a_quien_le_hablamos`, `awareness_stage`, `funnel_stage`
  - **Teoría del ángulo:** `teoria`
  - **Mecanismo:** `por_que_va_a_funcionar`, `problema_especifico`, `objecion_que_derrumba`, `transformacion_prometida`
- **Pieza** (`creative_assets` + guiones): `tipo`: `guion` | `video` | `imagen`; guiones llevan `lineas[]` (escenas numeradas); `client_status`: `pendiente` | `aprobada` | `cambios` + `client_feedback`.

## Screens / Views — Móvil (experiencia principal)

### 1. Servicios (home)
- Header: badge marca 30×30 `#0f172a` radius 9 con "A" blanca + "Alpha Marino" (13px/600) + nombre del cliente a la derecha (10.5px `#64748b`).
- Eyebrow "TU PUBLICIDAD, POR SERVICIO" (10px, uppercase, tracking .18em, `#64748b`) + H1 "¿Qué servicio quieres revisar?" (Unbounded 20px/600).
- **Card por servicio** (bg blanco, borde `#e2e8f0`, radius 20, padding 18, sombra `0 1px 3px rgba(15,23,42,.05)`): icono 44×44 en tile de color suave, nombre (15px/700), meta "N conceptos activos · N piezas" (11px `#64748b`), barra de progreso verde `#10b981` (5px, track `#e8edf4`) + "N/M aprobadas". Badge superior derecho: "N por revisar" (ámbar: texto `#b45309`, bg `#fffbeb`, borde `#fde68a`, pill) o "✓ Al día" (verde `#047857` sobre `#ecfdf5`).
- **Atajo revisión rápida**: card con borde punteado `#d1dce8`, "⚡ ¿Poco tiempo? Revisa las N piezas pendientes de corrido." + link "Revisar →" (`#2563eb`). Solo visible si hay pendientes.

### 2. Conceptos de un servicio
- Header con back (círculo 32px `#f1f5f9` con "‹") + breadcrumb "Servicios /" (10px) + nombre del servicio (14px/700).
- Texto intro: "Cada **concepto** es una idea publicitaria distinta que estamos probando para este servicio."
- Conceptos agrupados con separadores de sección (label uppercase 10.5px/700 `#334155` + línea): **"EN CURSO · <MES AÑO>"** y **"♾️ SIEMPRE ACTIVOS · EVERGREEN"**.
- **Card de concepto**: badges (ángulo: bg `#0f172a` texto blanco radius 6; funnel: bg/color semántico; "⭐ Validado" ámbar si evergreen) + nombre (14.5px/700) + fila de 3 mini-stats (Por revisar `#b45309` / Aprobadas `#047857` / Cambios `#0369a1`) + footer accionable: ámbar "Guion + video esperan tu revisión — Abrir ›" (bg `#fffbeb`, borde-top `#fde68a`) o verde "✓ Todo revisado — Ver ›" (bg `#ecfdf5`).
- **Archivo**: card semitransparente "🗂️ Conceptos de meses anteriores" colapsable (chevron ⌄/⌃); al abrir, subheaders por mes (9.5px uppercase `#94a3b8`) y filas compactas: badge de ángulo gris, nombre, "N piezas · campaña finalizada", "Ver ›". 

### 3. Piezas de un concepto
- Header back + breadcrumb "<Servicio> /" + nombre del concepto.
- **Banner condicional** arriba: archivado → gris `#f1f5f9` "🗂️ Campaña de <Mes> — archivo de solo lectura. Estas piezas ya circularon."; evergreen → ámbar `#fffbeb` "♾️ Concepto Evergreen — validado con resultados; se mantiene activo mes a mes."
- **Panel de estrategia** (card con borde punteado, colapsable "¿Por qué este concepto?"): al abrir muestra **3 pestañas** (Identificación / Teoría / Mecanismo — 8.5px uppercase 700, activa: texto `#0f172a` + subrayado 2px `#2563eb`; inactiva `#94a3b8`), contenido sobre bg `#fbfcfe` con campos label (8.5px uppercase `#94a3b8`) + texto (12px `#334155`), separados por hairline `#eef2f7`:
  - **Identificación:** Principio organizador · A quién le hablamos · Awareness stage · Funnel stage (pill TOF/MOF/BOF con colores semánticos + etiqueta de audiencia)
  - **Teoría del ángulo:** texto de la teoría
  - **Mecanismo:** ¿Por qué va a funcionar? · Problema específico · Objeción que derrumba · Transformación prometida
- **Card de pieza** (radius 18; borde `1.5px solid #fde68a` si pendiente, `1px solid #e2e8f0` si no):
  - Header: icono en tile (📝 `#fffbeb` / 🎬 `#f0f9ff` / 🖼️ `#f5f3ff`), título (13px/600), subtítulo (10px `#64748b`; para guiones: "Paso 1 · se produce el video al aprobarlo"), pill de estado (Pendiente ámbar / ✓ Aprobada verde / Cambios pedidos azul).
  - **Guion**: bg `#f8fafc`, escenas numeradas — círculo 20px `#0f172a` con número blanco + texto 12.5px/1.65. Nota: "📝 Este texto es la voz en off. Al aprobarlo pasamos a producir el video."
  - **Video**: placeholder oscuro `#0f172a` con botón play (usar `<video>` real en producción, max-h como el `ClientAssetReview` actual).
  - **Imagen**: placeholder `#e8edf4` (usar `<img>` real).
  - Si tiene feedback previo: banda azul `#f0f9ff` "**Tu comentario:** «…»".
  - Acciones (solo si pendiente y no archivado): "Pedir cambios" (ghost, borde `#d1dce8`) + "Aprobar ✓" / "Aprobar guion ✓" (bg `#10b981`, texto blanco, flex 1.3, sombra verde suave).
  - "Pedir cambios" abre textarea inline + botones Cancelar / "Enviar cambios" (bg `#f59e0b`). Enviar requiere texto no vacío.

### 4. Revisión rápida (quick review)
- Pantalla/flujo enfocado: header con ✕ (vuelve a Servicios), "Revisión rápida", breadcrumb "Servicio · Concepto", contador "N de M" + barra de progreso 3px `#0f172a`.
- Muestra UNA pieza a la vez (guion completo / media grande). Footer sticky con las mismas acciones + hint "Después de esta: <título> →" o "Esta es la última pieza".
- Aprobar o enviar cambios avanza automáticamente. Al terminar: 🎉 "¡Todo revisado!" + "Gracias. El equipo de Alpha Marino ya recibió tus respuestas…" + botón "Volver al inicio".
- La cola se congela al entrar (ids de pendientes en ese momento).

## Screens / Views — Desktop

- **Header** (56px, bg `rgba(255,255,255,.92)`, borde inferior): marca + "Alpha Marino · <Cliente> — Portal del cliente"; derecha: barra de progreso global 120px + "N/M revisadas" + botón "⚡ Revisión rápida (N)" (ámbar).
- **Layout**: grid `280px 1fr`.
- **Sidebar** (bg blanco, borde derecho): por servicio — header (emoji + nombre + badge pendientes), lista de conceptos (fila con prefijo "•" o "♾️", punto ámbar 6px si tiene pendientes; seleccionado: bg `#0f172a` texto blanco, radius 9), y "🗂️ Meses anteriores" colapsable con subheaders por mes y filas marcadas "solo lectura".
- **Main** (max-width 1000, padding 28/32): breadcrumb servicio (10px uppercase) + título del concepto (Unbounded 22px) + badges ángulo/funnel en línea + banners archivado/evergreen. Grid `1fr 320px`:
  - Izquierda: cards de pieza (idénticas a móvil, media 200–220px, acciones alineadas a la derecha).
  - Derecha (**sticky top:0**): panel de estrategia con las 3 pestañas (mismos campos que móvil, labels 9px, texto 12.5px) + footer con conteo "N piezas en este concepto · N pendientes".
- **Revisión rápida**: modal overlay (bg `rgba(15,23,42,.5)` + blur, card 620px radius 20, sombra `0 24px 60px rgba(15,23,42,.35)`), mismo flujo que móvil.

## Interactions & Behavior

- Aprobar / pedir cambios reutiliza la server action existente `submitClientReview` (`lib/actions/client-review.ts`) — mismo contrato que `ClientAssetReview` actual. Los guiones necesitarán su propia entidad/acción equivalente.
- Todos los contadores (badges, progreso, mini-stats, footer de estrategia) se derivan del estado de las piezas y se actualizan al aprobar/pedir cambios (optimistic UI con `useTransition`, como el componente actual).
- Conceptos/piezas archivados: **nunca** cuentan en pendientes ni entran en la cola de revisión rápida; sin botones de acción.
- Textarea de cambios: enviar deshabilitado/ignorado si está vacío; al enviar guarda feedback y muestra la banda "Tu comentario".
- Transiciones: barras de progreso `transition width .3–.4s`; sin animaciones adicionales.

## Design Tokens

- **Fuentes**: Poppins (body, ya en `globals.css`), Unbounded (títulos H1/números hero, ya en `globals.css`).
- **Colores**: bg página `#f5f6fa`; superficie `#fff`; bordes `#e2e8f0` / hairline `#eef2f7` / inputs `#d1dce8`; texto `#0f172a` / secundario `#334155`–`#475569` / muted `#64748b` / sutil `#94a3b8`.
- **Semánticos**: pendiente ámbar `#b45309` sobre `#fffbeb`, borde `#fde68a`, dot `#fbbf24`; aprobado verde `#047857` sobre `#ecfdf5`, CTA `#10b981`; cambios azul `#0369a1` sobre `#f0f9ff`; enviar cambios `#f59e0b`; link/tab activa `#2563eb`.
- **Funnel**: TOF sky (`#0369a1`/`#f0f9ff`), MOF violeta (`#6d28d9`/`#f5f3ff`), BOF esmeralda (`#047857`/`#ecfdf5`).
- **Radios**: cards 16–20px, pills 99px, badges 6px, botones 11–14px.
- **Táctil**: botones de acción móvil ≥44px de alto.

## Assets

Sin assets nuevos. El badge "A" es placeholder — usar `logo_url` de `workspace_settings` como en el shell actual. Medias de piezas: usar `asset_url` reales con la detección imagen/video del `ClientAssetReview` existente.

## Files

- `design_files/Portal Cliente Movil.dc.html` — prototipo móvil interactivo (referencia principal)
- `design_files/Portal Cliente Desktop.dc.html` — prototipo desktop interactivo
- `design_files/ios-frame.jsx`, `design_files/browser-window.jsx`, `design_files/support.js` — runtime de los prototipos (no implementar)

## Checklist de implementación sugerido

1. Extender esquema: entidad guion (o `creative_assets.tipo`), campos de estrategia nuevos en `creative_concepts` (`principio_organizador`, `awareness_stage`, `por_que_va_a_funcionar`, `problema_especifico`, `objecion_que_derrumba`, `transformacion_prometida`), `vigencia`/`mes` (derivable de status Evergreen + fechas), y relación servicio.
2. Reescribir `app/share/concepts/[projectId]/page.tsx` con la navegación por niveles (móvil primero — el cliente típico entra desde celular).
3. Nuevos client components en `components/share/`: navegación, card de pieza (guion/video/imagen), panel de estrategia con pestañas, revisión rápida.
4. Probar los 4 casos: servicio con pendientes, todo aprobado, concepto evergreen, concepto archivado.
