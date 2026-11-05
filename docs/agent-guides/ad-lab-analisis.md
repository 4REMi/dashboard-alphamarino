# Ad Lab — Análisis de concepto

**Qué es:** desarmar un anuncio de la librería (Discovery o Boards) para
entender su concepto y llevarlo a trabajo. Sin Brand Brain: la marca se
infiere de la página, copy, landing (se lee sola) y lo que Gemini ve/oye.

## Dónde
- Detalle de un anuncio → **"Analizar concepto"** (video o imagen).
- **Ad Lab → Análisis** (`/ad-lab/analisis`): todos los análisis guardados,
  con búsqueda y filtros por marca y ángulo. Abrir uno no vuelve a analizar.

## Cómo funciona (`lib/actions/ad-analysis.ts`)
Transcripción (AssemblyAI, si es video) + Gemini (`lib/ai/video-understanding.ts`)
+ texto de la landing → Claude devuelve JSON corto (límites de palabras;
aprendizajes como `{titulo, detalle}`). Se guarda solo en `ad_analyses`
(migración 113), con el anuncio de entrada en `analysis.ad` para reabrirlo.
Clave: `ad_archive_id`; anuncios sin id de librería (guardados viejos o
subidos a mano) usan `saved:<id del board>`. ↻ vuelve a analizar.

## La ventana (`components/ad-lab/concept-analysis-modal.tsx`)
Creativo a la izquierda; arriba la idea en 5 segundos (nombre, resumen,
chips); pestañas Concepto / Estructura (clic → el video salta a ese segundo,
se resalta el momento en reproducción) / Aprendizajes / Marca / Transcripción.

## Acciones
- **Crear concepto en proyecto:** eliges proyecto y línea, adaptas nombre y
  persona; se copia ángulo, dolor, objeción, transformación y funnel al ciclo
  activo, con `insight` "Inspirado en: anuncio de …". Solo admin/subadmin.
- **Clonar con este ángulo:** mismo flujo que "Clonar" del detalle (si el
  anuncio no está guardado, primero pide board).
- Copiar gancho / copiar resumen.

## Posts orgánicos con video (2026-10-28)

En Discovery orgánico, un post con video ya no ofrece solo "Clonar imagen":
trae **Clonar guion** (transcribe y adapta a la marca; `CloneModal` con
`savedAdId` → `startCloneFromSavedAd`, que usa la fila guardada en vez de
crear un duplicado — los orgánicos no tienen `ad_archive_id`), **Extraer
script** y **Analizar concepto**, más "Clonar la portada como imagen" como
opción secundaria. Los posts de imagen/carrusel siguen igual y suman
"Analizar concepto".

## Análisis en segundo plano (2026-11-05)

El análisis ya no vive en el modal sino en `lib/ad-lab/analysis-jobs.ts` (registro a nivel de módulo, por `adArchiveId`).
- Cerrar el modal mientras analiza (clic fuera, Esc, X) muestra un aviso: "Seguir aquí" o "Cerrar y avisarme". El proceso no se cancela.
- Reabrir el mismo anuncio se engancha al análisis en curso; no lanza otro.
- `components/ad-lab/analysis-jobs-toaster.tsx` (montado en el layout del dashboard) muestra abajo a la derecha "Analizando concepto…" y, al terminar con el modal cerrado, "Análisis listo · Ver" / "Falló · Reintentar".
- Límite: si se recarga o cierra la pestaña, el aviso se pierde; el resultado igual se guarda en `ad_analyses` si el servidor alcanzó a terminar.
