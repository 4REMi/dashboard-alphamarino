# Roadmap

Ideas y funcionalidades futuras que se han platicado pero **todavía no se construyen** —
ya sea porque falta mapear el diseño, porque hay otras prioridades primero, o porque
simplemente no es urgente todavía.

## Cómo funciona

Cuando en una conversación surge una idea que no se va a implementar de inmediato,
se agrega aquí como un archivo nuevo en vez de construirse. Esto no reemplaza pedir
que algo se construya ahora — es solo el lugar donde vive lo que se pospone.

Cada idea es un archivo `.md` suelto en esta carpeta (sin subcarpetas por ahora,
son pocas). Nombre de archivo: `kebab-case-descriptivo.md`.

## Formato de cada archivo

```markdown
# Título corto

**Estado:** idea | mapeado | pausado
**Área:** (ej. Ad Lab, Finanzas, Telegram/Vowen, Proyectos, Infra)
**Agregado:** YYYY-MM-DD

## Contexto
Por qué surgió, qué problema resuelve.

## Qué implicaría
Notas de diseño si ya se habló de eso — tablas nuevas, decisiones tomadas,
preguntas abiertas. Si nunca se mapeó, esta sección puede quedar breve.

## Por qué no ahora
La razón concreta por la que se pospuso (falta mapear, prioridad menor,
depende de otra cosa, etc.)
```

**Estados:**
- `idea` — mencionada, nada de diseño todavía.
- `mapeado` — ya se platicó el diseño concreto (tablas, flujos, decisiones), pero no se construyó.
- `pausado` — se empezó a construir o a mapear y se dejó a medias intencionalmente.

## Índice

| Archivo | Área | Estado |
|---|---|---|
| [deliverables-por-proyecto.md](./deliverables-por-proyecto.md) | Servicios / Proyectos | mapeado |
| [consultas-por-voz.md](./consultas-por-voz.md) | Telegram/Vowen | idea |
| [alertas-proactivas-telegram.md](./alertas-proactivas-telegram.md) | Telegram | idea |
| [aprobaciones-con-botones-telegram.md](./aprobaciones-con-botones-telegram.md) | Telegram | idea |
| [auditoria-mobile-dashboard.md](./auditoria-mobile-dashboard.md) | Infra / UI | idea |
| [telegram-webhook-sin-verificacion.md](./telegram-webhook-sin-verificacion.md) | Telegram / Seguridad | pausado |
| [notificaciones-por-empleado-telegram.md](./notificaciones-por-empleado-telegram.md) | Telegram / Equipo | construido — ver `lib/notifications/README.md` |

Actualiza esta tabla cada vez que agregues o cierres un archivo.
