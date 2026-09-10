# Payload de lanzamiento por ciclo de Paid Media

**Estado:** mapeado
**Área:** Paid Media / Creative Tracker
**Agregado:** 2026-09-10
**Actualizado:** 2026-09-10 — ronda de preguntas/respuestas con el usuario, ver abajo

## Contexto

El Creative Tracker de cada proyecto ya tiene conceptos, assets subidos por concepto,
y la posibilidad de marcar conceptos como evergreen para que sigan al mes siguiente.
Pero todo eso es material creativo — no existe nada que conecte ese trabajo con la
ejecución real de la campaña en Meta Ads Manager (o donde sea que se lance). Hoy esa
conexión vive solo en la cabeza de quien configura la campaña.

La idea (palabras del usuario): "un payload final por ciclo del creative tracker...
algo que dé las instrucciones completas de cómo usar todo lo creado y trabajado" —
sentía que esta parte del dashboard, aunque funcional, está un poco desconectada del
flujo operativo del negocio (creative vs. media buying).

## Qué implicaría

Un "payload" (documento/vista dentro del dashboard, o exportable) por ciclo, que
combine:
- Los conceptos y assets confirmados de ese ciclo (lo que ya existe).
- Estructura de campaña sugerida/definida (campaign → ad set → ads, o el mapeo que
  se use).
- Presupuesto a configurar.
- Duración / fechas de inicio y fin.
- Fechas de checkpoint — cuándo revisar resultados, cuándo decidir si algo se pausa
  o se escala.

## El objetivo real: sacar al usuario de la operación

El motivador de fondo no es solo "documentar la campaña" — es que hoy el usuario
ejecuta el payload él mismo, jugando el rol de estratega creativo Y project manager
de paid media, y quiere que eventualmente lo pueda ejecutar alguien más (un media
buyer, incluso alguien "amateur" en paid media) sin tener que preguntarle nada. El
payload tiene que traer suficiente info y reglas explícitas para que esa persona
estructure la campaña bien, sin dejarla "correr libre".

Métrica de éxito propuesta: varios ciclos seguidos donde nadie tuvo que preguntarle
al usuario nada de configuración — "tests que pasan" (ciclos ejecutados sin
intervención suya) es la señal de que el payload está cumpliendo su propósito.

## Decisiones de diseño ya tomadas (ronda de preguntas)

1. **Ejecutor hoy vs. objetivo**: hoy lo ejecuta el usuario (estratega + PM). El
   objetivo es que lo ejecute un media buyer del equipo — el payload debe ser
   suficientemente explícito para alguien sin experiencia en paid media.

2. **Qué decisiones lleva ingrained**: presupuesto y reglas de testing — suficiente
   info para que alguien amateur estructure la campaña sin salirse del carril.

3. **¿Una vía o con retroalimentación?** Ni reporte completo ni solo instrucción
   muda — un checklist de confirmación ligero (ej. "estructura montada", "presupuesto
   configurado", "campaña en vivo") que la persona va marcando al ejecutar. No hace
   falta un reporte de resultados aparte — el performance ya vive en el ciclo del
   Creative Tracker.

4. **Plantillas de estructura**: el usuario pensaba en ~3 categorías sueltas: testing,
   escalamiento, y diferencia e-commerce/servicio local. Al platicarlo se identificaron
   dos ejes independientes en vez de una sola lista:
   - **Tipo de negocio** (e-commerce vs. servicio local) → cambia la estructura de
     campaña real (funnel, objetivo, tipo de conversión).
   - **Fase del ciclo** (testing vs. escalamiento) → cambia presupuesto/duración,
     no necesariamente toda la estructura.
   Con esos dos ejes probablemente alcanzan 2-3 plantillas reales, no 4 completas.
   Además, el dashboard ya tiene `project_type` con phase sets — vale la pena que
   estas plantillas de campaña enganchen ahí en vez de crear un sistema de plantillas
   nuevo y paralelo.

5. **Checkpoints sin revisar**: usar el sistema de notificaciones ya existente
   (`lib/notifications/`) para pingar al equipo cuando se llega a una fecha de
   checkpoint sin que se haya marcado como revisado.

6. **Memoria entre ciclos**: no hace falta "memoria" tipo IA — ya se guarda
   `spend`/`results` por ciclo. El payload debería jalar automáticamente los números
   del/los último(s) ciclo(s) como contexto (CPA, ROAS, tendencia) y mostrar una
   recomendación sugerida (escalar / mantener / matar) que la persona confirma o
   cambia — nunca una decisión automática de presupuesto sin supervisión humana.

7. **Responsabilidad si algo sale mal**: split simple — quien ejecuta el payload es
   responsable de seguirlo fielmente; quien lo diseñó/armó es responsable de que el
   contenido esté bien armado. Para que quede rastro, el payload debería tener un
   "responsable de este ciclo" asignado explícitamente (reusar el sistema de
   asignación de tareas que ya existe) y quedar timestamp de cuándo se marcó como
   ejecutado.

8. **Visibilidad del cliente**: nunca — 100% interno.

## Preguntas técnicas aún abiertas (siguiente ronda)

- ¿Dónde vive el payload — pantalla nueva dentro del ciclo del proyecto, tabla nueva
  (`cycle_payloads` o similar), o es un documento generado (export) sin persistencia
  propia?
- ¿Se genera automáticamente a partir de lo que ya existe en el ciclo (conceptos,
  assets, métricas del ciclo anterior), con un formulario para llenar lo que falta
  (presupuesto, fechas), o es 100% manual?
- ¿El checklist de confirmación es parte de la misma tabla del payload, o son
  entradas separadas (más parecido a subtareas/checklist de una tarea, que ya existe
  como patrón en `task_checklist_items`)?
- ¿Las plantillas de estructura de campaña son texto/instrucciones (brief legible) o
  datos estructurados (campaign/ad set/ads como filas reales, pensando a futuro en
  alguna integración con la Marketing API de Meta)?
- ¿Este payload aplica también a piezas evergreen fuera de un ciclo puntual, o es
  estrictamente por ciclo?

## Por qué no ahora

Ya se mapeó el diseño conceptual (arriba), pero faltan las decisiones técnicas de
implementación (modelo de datos, dónde vive, cómo se genera) antes de tocar código.
Ahora mismo la prioridad es resolver el bug de importación de creativos desde Meta
(Historial de Meta), que sigue sin funcionar en ningún proyecto.
