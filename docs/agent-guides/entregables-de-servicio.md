# Entregables del servicio — Guía para agentes

**Ruta:** dentro de `/projects/[id]` — tarjeta "Alcance del servicio"
**Para quién:** ambos, gateado por permiso (ver "Quién puede ver/hacer qué")
**Actualizado:** 2026-09-11

## Qué es y para qué sirve

Rastrea si un proyecto está cumpliendo lo que el cliente contrató — cuántas
unidades de cada entregable (videos, reportes, juntas, lo que sea) se debieron
entregar este periodo, contra cuántas realmente se han entregado. Nace de un hueco
real: con servicios recurrentes (paid media y cualquier otro de naturaleza
recurrente), a veces se entregan 4 videos cuando tocaban 3, o 5 cuando tocaban 10, y
no había ningún tracking de eso.

**Distinción conceptual — no confundir con nada más que se llame "entregable" en
este sistema.** Esto es sobre lo que el **cliente tangiblemente recibe**. Es un
sistema completamente separado de:
- `tasks.requires_deliverable` / `deliverable_instructions` — un flag en una tarea
  interna, ligado a evidencia subida por tarea (`components/projects/deliverables-
  section.tsx`, tabla `deliverables`). Eso es trabajo interno, no algo del cliente.
- `task_set_tasks` en Ops Lab — plantillas de tareas internas de onboarding/
  producción, sin ningún vínculo con esto.

**Es 100% interno.** No existe ningún portal, link o vista de cliente para esto —
nunca se expone fuera del dashboard. Es control interno del equipo, punto.

## Conceptos y vocabulario clave

- **Oferta de servicio** (`service_offers`, sección Servicios): define QUÉ se
  entrega — cada línea de su campo `deliverables` (JSONB) tiene `text`, `cadence`
  (once/monthly/quarterly/biannual), y ahora también `quantity` (cuántas unidades
  por periodo de esa cadencia; `null` = sin cantidad definida).
- **Oferta adjunta a un proyecto** (`project_service_offers`): un proyecto puede
  tener **varias ofertas independientes** adjuntas a la vez (muchos a muchos) — no
  una sola oferta base. Los addons (`service_addons`) no tienen entregables propios,
  quedan fuera de este tracking.
- **Periodo** (`project_deliverable_periods`): una fila por (proyecto, oferta, línea
  de entregable, periodo de calendario) — se genera sola (perezosamente) la primera
  vez que se abre la tarjeta, con la cantidad esperada precargada desde la oferta.
  El periodo es **siempre por calendario** (mes/trimestre/semestre, o un único
  periodo para "once") — deliberadamente igual para cualquier tipo de proyecto, no
  se ancla a `paid_media_cycles` ni a ningún concepto de ciclo propio de un tipo de
  proyecto en particular.
- **Cantidad esperada ajustable por periodo**: el default viene de la oferta, pero
  se puede sobreescribir para un periodo puntual sin afectar los demás ni la
  definición original en Servicios.
- **Línea sin cantidad (`quantity: null`)**: se trata como 1 unidad implícita — sí
  se rastrea, como una casilla simple de entregado/no entregado.

## Cómo hacer las acciones comunes

**Agregar cantidad a un entregable de una oferta**: en Servicios, al editar/crear
una oferta, cada línea de "Entregables" ahora tiene un campo de cantidad junto al
texto y la cadencia.

**Adjuntar una oferta a un proyecto**: botón "Agregar oferta" en la tarjeta "Alcance
del servicio" del proyecto (admin/subadmin).

**Marcar algo como entregado**: click en las casillas de la fila del entregable —
cada clic avanza/retrocede el contador de cumplido (admin/subadmin, o cualquiera con
el permiso `manage_tasks`).

**Ajustar la cantidad esperada de un periodo específico**: ícono de lápiz junto al
contador (solo admin/subadmin) — cambia SOLO ese periodo, no la oferta.

## Reglas y restricciones

- Quitar una oferta de un proyecto **no borra el historial** de periodos ya
  generados — solo detiene la generación de periodos nuevos para esa oferta.
- El periodo vigente se calcula siempre por calendario, para todos los tipos de
  proyecto por igual — nunca se acopla a un concepto de ciclo específico de un tipo
  de proyecto (ej. Paid Media).
- No hay cron — los periodos se generan al vuelo cuando alguien abre la tarjeta.

## Quién puede ver/hacer qué

- **Ver la tarjeta**: gateado por el permission key `view_service_deliverables`
  (`lib/permissions.ts`) — default `true` para todos los roles, pero es un override
  real: un admin puede apagarlo para una persona específica desde su perfil, igual
  que cualquier otro permission key del sistema.
- **Adjuntar/quitar oferta, editar cantidad esperada de un periodo**: solo
  admin/subadmin — es una decisión de alcance/contrato.
- **Marcar como entregado**: admin/subadmin, o cualquiera con `manage_tasks` — misma
  gente que ya toca el avance operativo día a día del proyecto.

## Dónde vive esto en el código

- `supabase/migrations/072_project_service_offers.sql` — tabla de ofertas adjuntas.
- `supabase/migrations/073_project_deliverable_periods.sql` — tabla de periodos.
- `lib/actions/service-deliverables.ts` — todas las acciones (attach/detach,
  generación perezosa de periodos, marcar entregado, ajustar cantidad).
- `components/projects/hub/service-deliverables-card.tsx` — la tarjeta del hub.
- `lib/actions/services.ts` — `parseDeliverables` (id/quantity por línea).
- `components/services/service-catalog-manager.tsx` — `DeliverablesEditor` (input
  de cantidad).
- `lib/types.ts` — `ServiceDeliverable`, `ProjectServiceOffer`,
  `ProjectDeliverablePeriod`.
- `lib/permissions.ts` — `view_service_deliverables`.
