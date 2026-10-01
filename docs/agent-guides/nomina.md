# Nómina — Guía para agentes

**Ruta:** `/employees/nomina` (vista del mes) y `/employees/[id]` → tarjeta "Compensación"
**Para quién:** solo admin (RLS `is_admin()` + chequeo en `lib/actions/payroll.ts`)
**Actualizado:** 2026-10-01

## Qué es
Control de salarios base, bonos y comisiones del equipo, ligado a Finanzas.

## Modelo (migración 107)
- `compensation_profiles` (una fila por persona): esquema (`fixed` | `commission` |
  `mixed`), salario base **mensual** (bruto, sin impuestos), moneda (USD/MXN),
  **día de pago por persona** (default 1), desde cuándo genera salario, activo.
- `compensation_salary_history`: cada cambio de salario base.
- `bonus_agreements`: bonos pactados ("Onboarding bien ejecutado → $150"). **No se
  disparan solos** (se decidió no ligarlos a fases porque las fases cambian): se
  eligen al agregar un bono y llenan monto y motivo.
- `payroll_items`: cada pago (`salary` | `bonus` | `commission`), con mes, fecha de
  pago, proyecto opcional y estado `pending` | `paid` | `skipped`.

## Reglas
- Salarios se generan solos al abrir Nómina (mes actual y hasta 6 meses atrás desde
  `starts_on`), uno por persona por mes. Bonos y **comisiones son discrecionales**:
  se agregan a mano (monto, moneda, motivo, proyecto opcional).
- Colores: rojo vencido, ámbar pendiente, verde pagado, gris omitido.
- **Pagar** convierte a USD (Frankfurter, tipo de cambio del día) y crea un gasto en
  Finanzas: `recurring_expenses` One-time, categoría Payroll, con la fecha real.
  "Deshacer pago" borra ese gasto. Finanzas trabaja en USD.
- Cambiar el salario actualiza los salarios pendientes de este mes en adelante.
- Gastos "Payroll" recurrentes viejos: Nómina los detecta y ofrece darlos de baja
  con `ended_at` = fin del mes anterior (el historial se conserva, sin contar doble).
- Finanzas muestra "Costo de equipo pagado este mes", % del ingreso y lo pendiente
  (solo admin).

## Código
`lib/actions/payroll.ts`, `components/employees/payroll-view.tsx`,
`components/employees/compensation-card.tsx`, `app/(dashboard)/employees/nomina/page.tsx`.
