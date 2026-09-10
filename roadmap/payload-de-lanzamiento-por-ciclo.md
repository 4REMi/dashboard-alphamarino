# Payload de lanzamiento por ciclo de Paid Media

**Estado:** idea
**Área:** Paid Media / Creative Tracker
**Agregado:** 2026-09-10

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

Preguntas abiertas (no mapeadas todavía):
- ¿Quién llena estos datos — es manual (un formulario admin) o se puede inferir de
  lo que ya existe en el ciclo?
- ¿El payload es solo de lectura (un brief a seguir) o interactúa con Meta Ads Manager
  (ej. algún día crear la estructura de campaña directo vía API)?
- ¿Vive dentro del dashboard como una pantalla nueva del ciclo, o es algo exportable
  (PDF/doc) para mandar a quien monta la campaña?
- ¿Un payload por ciclo, o también aplica a piezas evergreen que siguen corriendo
  fuera de un ciclo puntual?

## Por qué no ahora

Es una idea que acaba de surgir, sin mapear — necesita una sesión aparte para
definir el diseño antes de tocar código. Ahora mismo la prioridad es resolver el bug
de importación de creativos desde Meta (Historial de Meta), que sigue sin funcionar
en ningún proyecto.
