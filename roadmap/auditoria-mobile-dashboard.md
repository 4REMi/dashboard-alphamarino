# Auditoría y rediseño responsive de todo el dashboard

**Estado:** idea
**Área:** Infra / UI
**Agregado:** 2026-09-08

## Contexto
El dashboard no está optimizado para celular en general — se preguntó por el costo de
hacer una auditoría/rediseño completo para que todo se vea bien en mobile.

## Qué implicaría
Tamaño real medido en su momento: 33 páginas, 111 componentes, ~38,600 líneas de código
de UI. Se estimaron dos niveles de rigor:
- **Pasada a nivel de código** (sin verificación visual real): ~1.6–1.8M tokens.
- **Pasada con QA visual real** (screenshots en varios anchos de pantalla, iterar hasta
  que se vea bien): ~3–4.5M tokens.

Recomendación que se dio: no hacerlo como una auditoría gigante de una sola vez — ir
sección por sección (ej. empezar por Proyectos o Ad Lab), medir el costo real de esa
sección, y decidir si seguir con el resto.

## Por qué no ahora
Es un proyecto grande y costoso; se dejó pendiente de decidir por dónde arrancar y con
qué nivel de rigor, en vez de comprometerse a todo el dashboard de una vez.
