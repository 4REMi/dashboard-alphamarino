# Roadmap — SOPs

Estado: **por construir** (definido en conversación del 2026-10-16). Nada de
esto existe todavía; hoy un SOP es una ficha con link a doc y/o video
(`sops`, migración 013) que se adjunta a tareas y plantillas.

Principio: **nada de slop.** La IA propone, un humano aprueba y verifica.
Nadie llena "objetivo / cuándo usarlo" a mano: el SOP gira alrededor de un
**video o documento que ya existe**.

## Fase 1 — SOP alrededor de video y/o Google Doc (prioridad)

### Fuentes (una o ambas)
- **Video:** el equipo lo sube a YouTube como **oculto**; el dashboard lo
  reproduce embebido (funciona con ocultos). Gemini **no** puede leer links de
  YouTube no públicos, así que al crear el SOP se arrastra además **el archivo
  del mismo video**: va directo del navegador a la Files API de Gemini (se
  borra a las 48 h), no se guarda en el dashboard. Validar subida directa sin
  pasar por Vercel (límites de body).
- **Documento:** link de Google Docs. Legible solo si está compartido como
  "cualquiera con el link"; si no, subir PDF.
- Con ambas fuentes la IA las cruza y marca contradicciones.
- Plan B si el archivo es impráctico: transcripción de YouTube vía API del
  canal (solo audio, peor para pasos de pantalla).

### Creación (modal, 3 pasos)
1. Título, categoría, dueño + fuentes (✓ cuando la fuente es legible).
2. Generando (30 s – 2 min, se puede cerrar; avisa al terminar).
3. Revisión del borrador:
   - Pasos numerados con **resultado esperado**; cada paso enlaza al **minuto
     del video** (▶ 03:42) o a 📄 si salió del documento.
   - "Necesitas": accesos/herramientas mencionados. Advertencias.
   - **"No quedó claro"**: lo que la fuente no explica (no se inventa). No se
     puede publicar con puntos abiertos (responder o "no aplica").
   - Editar / mover / borrar / agregar pasos.

### Resto de la fase 1
- Estados: borrador → publicado (→ verificado más adelante). Dueño, versión,
  fecha de última revisión; cambiar fuente = nueva versión con diff.
- En la tarea: ver pasos sin salir; clic abre el video en el minuto;
  opcional convertir pasos en checklist.
- **Retroalimentación**: "este paso no funcionó / está desactualizado" desde la
  tarea → aviso al dueño; el SOP muestra "reportes pendientes".
- SOPs actuales: aparecen "sin pasos" con botón "Generar pasos" desde sus
  links.
- Antes de construir: **prueba de calidad con 1–2 videos reales** (uno bueno y
  uno difícil).

## Fase 2 — Crear SOPs desde el MCP (desde cero)

Capacidades: redactar desde la conversación; usar contexto del dashboard
(tarea, bitácora, notas fijas); investigar documentación oficial citándola;
ida y vuelta antes de guardar; guardar y adjuntar a tarea/plantilla; proponer
mejoras a SOPs existentes con antes → después.

Limitaciones: no conoce los trucos internos si no se le dicen; no ve
pantallas; la documentación oficial puede estar vieja (sobre todo MX); no
puede probar el proceso; sin video no hay minutos.

Reglas: solo borradores (nunca publica solo); vista previa completa antes de
guardar; cada paso con **origen** (usuario / doc oficial con link /
**inferido** resaltado); sección "No quedó claro" bloquea publicar;
validación que rechaza pasos vagos o sin resultado esperado; marca "Creado por
IA" hasta que alguien lo verifique. Ideal: borrador del MCP → cuando alguien
lo ejecuta, graba video y se regeneran los pasos.

Visión: cuando una tarea la tiene que hacer un humano pero un agente sabe
explicarla, el agente crea el borrador del SOP y se adjunta a la tarea.

## Fase 3 — Lectura por un agente 24/7

- `leer_sop` en el MCP con formato fijo (no texto libre).
- Por paso: quién ejecuta (humano / agente / cualquiera), verificación
  objetiva, condiciones de alto ("si X, detente y avisa a Y"), permisos y
  herramientas requeridas.
- Variables ({cliente}, {tienda}, {cuenta Meta}) llenadas con datos del
  proyecto.
- Versión del SOP congelada por tarea; registro de ejecución en Actividad de
  IA.
