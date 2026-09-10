# Reportes estandarizados por ciclo de Paid Media

**Estado:** idea
**Área:** Paid Media / Creative Tracker
**Agregado:** 2026-09-10

## Contexto

Hoy los reportes de cada ciclo se arman por fuera del dashboard, manualmente, después
de que el ciclo termina. La idea es que, si se va registrando el gasto y la campaña
que corre durante el ciclo (según se vaya dando, no hasta el final), el dashboard
pueda generar un reporte estandarizado directamente a partir de esos datos, en vez de
que el reporte se arme aparte desde cero cada vez.

Relacionado con [payload-de-lanzamiento-por-ciclo.md](./payload-de-lanzamiento-por-ciclo.md) —
ese payload es la instrucción de cómo ejecutar el ciclo; esto sería el resumen de qué
pasó. Juntos cierran el ciclo completo: brief de lanzamiento → ejecución → reporte.

## Qué implicaría

Sin mapear a detalle todavía. A grandes rasgos:
- Capturar gasto/performance de la campaña de forma continua durante el ciclo (no
  solo al cierre) — probablemente ligado a lo que ya se trae de Meta (campañas,
  `spend`/`results` que ya existen en `meta_campaign_creatives` y en los ciclos).
- Una plantilla de reporte estandarizada que se genere a partir de esos datos
  acumulados, en vez de un documento manual por fuera.

Preguntas abiertas (sin platicar todavía): ¿qué debe incluir el reporte estándar,
quién lo consume (cliente o solo interno — a diferencia del payload, este probablemente
sí lo vea el cliente), con qué frecuencia se genera (solo al cierre del ciclo, o
también reportes parciales a medio ciclo), y si hay que jalar datos en vivo de Meta
o basta con lo que ya se importa/registra manualmente.

## Por qué no ahora

Recién mencionada, sin mapear — pendiente de una sesión dedicada, igual que el
payload de lanzamiento. Prioridad actual sigue siendo el bug de importación de
creativos de Meta.
