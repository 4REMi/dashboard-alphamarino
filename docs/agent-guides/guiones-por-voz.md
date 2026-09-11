# Guiones por voz (Telegram/Vowen) — Guía para agentes

**Ruta:** N/A todavía — vive en el bot (Telegram/Vowen), no en una pantalla del dashboard
**Para quién:** admin/subadmin (mismo permiso que ya requiere crear guiones desde el dashboard)
**Estado:** 🚧 BORRADOR — diseño en mapeo, sin construir. No usar como referencia de
comportamiento real todavía; ver "Preguntas abiertas" antes de implementar.
**Actualizado:** 2026-09-11

## Qué es y para qué sirve

Extensión del bot de Telegram/Vowen (el mismo pipeline que ya crea tareas, notas de
bitácora, proyectos y clientes por voz) para que también pueda crear **guiones**
dentro del Creative Tracker de un proyecto — combinando el contexto de una marca
(Brand Brain), un proyecto, y un concepto ya existente en el Creative Tracker, sin
tener que abrir el dashboard.

## Conceptos y vocabulario clave

- **Guion (script)**: vive dentro de `adapted_script` de un `creative_brief`, ligado
  siempre a un **concepto** (`creative_concepts`), un **Brand Brain**, y un
  **proyecto**. Un brief puede tener varios guiones (`script_titles` les da nombre).
- **Tres formas de crear un guion, hoy solo desde el dashboard**:
  - **Manual** — se escribe/pega el texto completo, sin IA (`saveManualScript`).
  - **IA sin referencia** ("Quick Create") — se genera desde cero usando el
    concepto + Brand Brain + una **estructura** elegida explícitamente
    (`generateScriptDrafts` → `saveScriptDrafts`).
  - **Tropicalizado** — se transcribe un **video de referencia real** y se adapta
    ese guion al tono/idioma de la marca (dentro de `generateBriefContent`,
    vía AssemblyAI + Claude).
- **Estructura** (`ScriptStructureKey`, en `lib/constants/creatives.ts`): plantillas
  con nombre — PAS (Problem/Agitate/Solve), BAB (Before/After/Bridge), y otras. Nunca
  se infiere sola, siempre se elige explícitamente.
- **Concepto** (`creative_concepts`): la unidad del Creative Tracker a la que se
  liga un guion — tiene su propio ángulo, persona objetivo, pain point, etc., que ya
  alimentan la generación por IA.

## Restricción técnica importante

Las acciones existentes (`saveManualScript`, `generateScriptDrafts`,
`saveScriptDrafts`, `generateBriefContent`) autentican por **sesión de cookie**
(`getRole()` vía `createClient()`) — el bot NO puede llamarlas tal cual, porque no
corre con una sesión de usuario. Necesita su propia lógica de inserción usando el
admin client, replicando el patrón que ya usan `lib/telegram-bot/handlers/*.ts`
(escritura directa a las tablas, sin pasar por las Server Actions del dashboard).

## Preguntas abiertas (sin resolver — no implementar hasta cerrar esto)

**Contexto general**
- ¿Se resuelve el concepto por nombre dentro del proyecto mencionado (como ya se
  hace con tareas → proyecto), con el mismo patrón ambiguity-safe (`findByName`/
  `findAllMatches`) si hay varios parecidos?
- El Brand Brain normalmente ya está ligado al proyecto — ¿hay casos reales donde un
  proyecto tiene más de una línea de marca y haría falta preguntar cuál usar?

**Manual**
- ¿Es un caso de uso real dictar un guion completo por voz, o el modo manual queda
  de menor prioridad frente a IA/tropicalizado?

**IA sin referencia**
- ¿Cómo se elige la estructura (PAS, BAB, etc.) por voz — se dice el nombre, o hay
  un default si no se menciona?
- Normalmente se generan 3 variantes — ¿el bot manda las 3 para elegir (responder
  con un número), o guarda una de una vez y se ajusta después desde el dashboard?

**Tropicalizado**
- Necesita un video real de referencia. ¿Se manda el video directo al bot por
  Telegram (sí soporta archivos), o se referencia por nombre un video que ya vive en
  la librería de Ad Lab (`saved_ads`) y el bot lo busca igual que hace con
  proyectos/clientes?

## Dónde vive esto en el código (lo existente, referencia para el diseño)

- `lib/actions/creatives.ts` — `saveManualScript`, `generateScriptDrafts`,
  `saveScriptDrafts`, `generateBriefContent` (contiene el flujo de tropicalización).
- `lib/constants/creatives.ts` — `SCRIPT_STRUCTURES`, `ScriptStructureKey`.
- `components/projects/hub/creatives/quick-script-modal.tsx` — UI de referencia del
  flujo "IA sin referencia" en el dashboard.
- `components/projects/hub/creatives/brief-creator.tsx` — UI de referencia del flujo
  de tropicalización (incluye el toggle de "no transcribir" por video, ver
  `no_transcribe_ad_ids`).
- `lib/telegram-bot/` — pipeline del bot a extender (`classify.ts`, `router.ts`,
  `handlers/`), mismo patrón que tareas/notas/proyectos/clientes por voz.
