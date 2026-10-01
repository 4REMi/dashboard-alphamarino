# Nómina — Guía para agentes

**Ruta:** `/employees/nomina` (vista del mes) y `/employees/[id]` → tarjeta "Compensación"
**Para quién:** admin edita todo; cada empleado ve SOLO la suya en `/mi-compensacion` (RLS, migración 108)
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

## Mi compensación y reporte de bonos (migración 108)
- `/mi-compensacion` (menú "Mi compensación"): cada empleado con salario fijo activo
  ve su contrato (salario, día de pago, esquema, notas), sus bonos pactados y sus
  pagos. **Nunca la de otros**: lee con su propia sesión y las políticas RLS
  `*_own_read` solo devuelven sus filas.
- **Reporte mensual de bonos** (`bonus_reports` + `bonus_report_items`): agrega
  actividades (bono pactado, descripción, proyecto, enlace de evidencia) y lo envía.
  Se puede editar el mes actual y el anterior hasta el **día 3** del mes siguiente;
  después se cierra (validado en el servidor).
- Admin (en Nómina → "Reportes de bonos"): aprobar crea el bono pendiente en Nómina
  (monto del acuerdo, ajustable); rechazar deja comentario; "Regresar" lo vuelve a
  borrador; "Terminar revisión" avisa al empleado.
- Telegram: aviso a los admins al enviar (`bonus_report_submitted`), recordatorio al
  empleado el último día del mes y el día 2 (`bonus_report_reminder`, desde el cron
  diario `check-cycles`), y resultado de la revisión (`bonus_report_reviewed`).

## Código
`lib/actions/payroll.ts`, `components/employees/payroll-view.tsx`,
`components/employees/compensation-card.tsx`, `app/(dashboard)/employees/nomina/page.tsx`,
`lib/actions/my-compensation.ts`, `components/employees/my-compensation.tsx`,
`components/employees/bonus-reports-review.tsx`, `app/(dashboard)/mi-compensacion/page.tsx`.
