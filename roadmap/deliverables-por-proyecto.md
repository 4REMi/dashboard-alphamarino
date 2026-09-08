# Chequeo de entregables por proyecto, conectado a Servicios

**Estado:** mapeado
**Área:** Servicios / Proyectos
**Agregado:** 2026-09-08

## Contexto
El catálogo de Servicios (`/services`) ya tiene `ServiceOffer.deliverables: ServiceDeliverable[]`,
donde cada entregable es `{ text, cadence }` (cadence: `once | monthly | quarterly | biannual`).
Esa estructura se diseñó a propósito pensando en esto — el comentario de la migración
`060_service_offer_deliverables_structured.sql` dice textualmente: *"lays the groundwork
for eventually tracking, per project cycle, which recurring deliverables have shipped."*
Pero nunca se conectó con nada.

## Qué implicaría
Hoy son dos sistemas totalmente desconectados:
- Los `ServiceDeliverable[]` del catálogo nunca se asignan a un proyecto.
- El sistema de `deliverables` a nivel proyecto (`lib/actions/deliverables.ts`) es otra
  cosa — un log de archivos/texto subidos contra una tarea marcada `requires_deliverable`,
  sin cadencia ni checklist.
- Sí existe un concepto de ciclo por proyecto (`paid_media_cycles`), pero solo se usa
  para métricas de paid media.

Piezas que harían falta:
1. Vincular un proyecto a una oferta de servicio (`service_offer_id` en `projects`, o tabla intermedia).
2. Generalizar el concepto de ciclo (reusar/extender `paid_media_cycles`, o una tabla
   nueva `project_cycles`) para saber cuándo "vence" cada entregable según su cadencia.
3. Una tabla de "completado" (`project_deliverable_completions`: `project_id, cycle_id,
   deliverable_index, completed_at`) para marcar qué entregable de la oferta ya se
   entregó en cada ciclo.

## Por qué no ahora
Nadie ha pedido construirlo todavía — quedó en la fase de "vale la pena mapearlo" cuando
se preguntó por el roadmap original de esta idea. Buen candidato para retomar cuando el
catálogo de Servicios empiece a usarse activamente para asignar ofertas a proyectos reales.
