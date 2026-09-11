# Acceso de ventas al banco de ofertas (Servicios)

**Estado:** idea
**Área:** Servicios / Permisos
**Agregado:** 2026-09-11

## Contexto

Al platicar la capa de entregables (ver `docs/agent-guides/entregables-de-
servicio.md`), el usuario mencionó una segunda función pensada para la sección
Servicios que se pospuso para no crecer el alcance de ese esfuerzo: una o varias
personas de ventas que puedan hacer upsells, downsells, o cotizar por su cuenta,
siempre y cuando tengan acceso al banco de ofertas/servicios/addons, con claridad de
qué entregables recibe el cliente en cada oferta.

Hoy Servicios es admin-only de forma dura (`app/(dashboard)/services/page.tsx`
redirige a cualquiera que no sea `role === "admin"`, ni siquiera subadmin pasa) y no
existe ningún permission key relacionado en `lib/permissions.ts` — el gateo es ad
hoc, no integrado al sistema de permisos existente.

## Qué implicaría

Sin mapear a detalle todavía. A grandes rasgos:
- Un nuevo permission key (o un rol nuevo tipo "ventas") con acceso de LECTURA al
  banco de ofertas/addons — probablemente sin acceso de escritura al catálogo en sí
  (crear/editar ofertas sigue siendo admin).
- Definir si "cotizar por su cuenta" implica construir algo nuevo (generador de
  cotizaciones) o si con ver el catálogo + precios + entregables ya es suficiente
  para que lo hagan por fuera del sistema.
- Definir si necesitan ver/actuar sobre `project_service_offers` (la capa de
  entregables) o si eso queda fuera de su alcance.

## Por qué no ahora

Se pospuso deliberadamente para mantener acotada la capa de entregables. Requiere su
propia sesión de mapeo (rol/permiso nuevo, alcance de "cotizar", si hay escritura
involucrada) antes de tocar código.
