# Notificaciones individuales por Telegram según lo que le toca a cada quien

**Estado:** construido — ver `lib/notifications/README.md` (no queda aquí, se movió al código)
**Área:** Telegram / Equipo
**Agregado:** 2026-09-08
**Cerrado:** 2026-09-08

## Qué se construyó
El sistema completo, pensado para crecer: `lib/notifications/` (registro de eventos
tipado + `notify()` + flujo de vinculación por código + tabla `notification_log`).
Documentación completa y la lista de eventos activos vive en `lib/notifications/README.md`
de aquí en adelante — ese es el lugar a consultar, no este archivo.

Eventos activos al cerrar esto: `task_assigned`, `project_member_added`.

## Este archivo queda solo como referencia histórica
Para agregar un evento nuevo o ver qué existe hoy, ir directo a `lib/notifications/README.md`.
