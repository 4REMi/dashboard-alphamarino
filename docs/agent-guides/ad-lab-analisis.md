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
