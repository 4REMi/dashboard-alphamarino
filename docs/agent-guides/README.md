# Guías de uso para agentes

Documentación portátil, pensada para entregarse **de antemano** a quien (persona o
agente de IA) vaya a operar una sección del dashboard — para que llegue con el
modelo mental correcto en vez de aprenderlo a prueba y error dentro del producto.

Esto es infraestructura, no un experimento: es la referencia autoritativa de cómo
funciona cada apartado, en el mismo nivel de seriedad que el código que describe.
Vive versionada junto al código a propósito, para que nunca se desincronice de la
realidad del producto.

## Para quién es esto

- **Un nuevo empleado** (ej. un media buyer) que va a ejecutar algo en el dashboard
  sin haber estado en las conversaciones donde se diseñó.
- **Un agente de IA** al que se le da acceso o contexto del dashboard para operar
  una sección por su cuenta (ej. ejecutar un payload de lanzamiento, clasificar
  tareas dictadas por voz, generar un reporte).
- **Claude** (esta misma sesión u otra futura) — antes de tocar una sección, leer su
  guía primero evita relearn-by-grepping y mantiene el diseño original a la vista en
  vez de reinventarlo cada vez.

No reemplaza las SOPs (`/sops`, dentro del producto) — esas son procedimientos
operativos de un proyecto específico para humanos que ya están dentro del dashboard.
Esto es la capa anterior: cómo funciona el sistema en sí.

## Regla dura: mantenerlo sincronizado

**Cualquier cambio sustancial a una sección documentada aquí se refleja en su guía
en el mismo commit que el cambio de código** — no después, no "cuando haya tiempo".
Un cambio sustancial es: se agrega/quita una función visible, cambia una regla de
negocio, cambia dónde vive algo, cambia quién puede hacer qué. Un refactor interno
sin cambio de comportamiento no necesita tocar la guía.

Si no existe guía todavía para la sección que se está tocando, no es obligatorio
crearla en ese momento — pero si ya existe, se actualiza, sin excepción.

## Formato — una plantilla, sin variaciones

Cada archivo es `kebab-case.md` suelto en esta carpeta (sin subcarpetas por ahora).
Todos siguen esta misma estructura, en este orden:

```markdown
# [Apartado] — Guía para agentes

**Ruta:** /ruta/en/el/dashboard
**Para quién:** admin | empleado | ambos (con las diferencias, si aplica)
**Actualizado:** YYYY-MM-DD

## Qué es y para qué sirve
Uno o dos párrafos. El problema real que resuelve esta sección, no una lista de
características.

## Conceptos y vocabulario clave
Los nombres EXACTOS que usa el sistema (ej. "ciclo", "concepto", "asset", "fase",
"Mi lista", "personal") con su definición precisa. Un agente que use el término
equivocado va a confundir a quien lo lea o a fallar en el sistema.

## Cómo hacer las acciones comunes
Pasos concretos y verificables, no exploración. Si una acción tiene una forma
"correcta" y una forma que técnicamente funciona pero no es la ideal, se dice cuál
es cuál.

## Reglas y restricciones
Qué NO se debe hacer, y qué se rompe si se hace de todos modos. Casos límite reales
que ya se descubrieron (bugs, decisiones de diseño deliberadas), no hipotéticos.

## Quién puede ver/hacer qué
Diferencias entre admin y empleado, si las hay. Omitir esta sección si no aplica.

## Dónde vive esto en el código
Referencias rápidas a archivos clave (acciones, componentes, migraciones) — para
que un agente de IA que sí pueda tocar código sepa dónde empezar sin tener que
grep-ear todo el repo desde cero.
```

## Índice

| Archivo | Apartado | Actualizado |
|---|---|---|
| [tareas.md](./tareas.md) | Tareas (`/tasks`) | 2026-09-11 |

Actualiza esta tabla cada vez que agregues un archivo nuevo.
