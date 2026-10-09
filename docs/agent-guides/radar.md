# Radar Paid Media

**Qué es:** lo que se salió de la estrategia de cada cliente de paid media,
con el dato que lo disparó y un botón para actuar. Funciona con reglas fijas, no con IA.

## Dónde vive
- `/radar` (sidebar): vista de agencia. Clientes ordenados por urgencia
  (rojo urgente, ámbar atención, verde oportunidad, azul "sin estrategia"),
  con barra de ritmo de gasto y miniaturas. A la derecha, el Radar del cliente.
- Hub Paid Media de cada proyecto (`#radar`), debajo del ciclo.
- Quién ve: admin/subadmin todo; empleados solo los proyectos donde son miembros.
  Definir estrategia, aplicar y descartar: admin/subadmin.

## Estrategia del ciclo (obligatoria)
Sin estrategia para el ciclo activo, el Radar solo muestra "Define la
estrategia". Son 6 decisiones (`components/radar/strategy-dialog.tsx`):
- presupuesto del ciclo (moneda de la cuenta de Meta, todos los canales);
- qué hacer al límite (solo avisar / pausar automático);
- líneas con canal, conversión y meta de costo por resultado;
- conceptos a probar;
- **la apuesta del ciclo**: una frase escrita por una persona; la IA nunca la llena.

El presupuesto y la meta se proponen a partir del ciclo anterior. Al confirmar,
la estrategia queda **fijada en la bitácora** (marcada `[Radar]`; la anterior se
desfija). Cada ciclo nuevo requiere estrategia nueva, para que nadie deje una
cuenta en piloto automático.

## Reglas (`lib/radar/engine.ts`)
- Ritmo de gasto: proyección contra lo pactado; al 100% → pausar campañas.
- Subinversión.
- Costo por resultado por línea.
- Apagar anuncio: gasta 2× la meta sin rendir.
- Graduar: anuncio en campaña/conjunto con "prueba/test" que cumple la meta.
- Fatiga: frecuencia ≥2.8 y CTR −30% entre los primeros y los últimos 3 días.
- Estructura contra presupuesto: campañas de más.
- Anuncios gastando sin concepto.
- Conceptos a probar sin lanzar.
- Datos de Meta con más de 30 h.

Se muestran máximo 5, ordenadas por severidad e impacto. El resumen de arriba
son 1–2 frases generadas por reglas.

## Acciones (`lib/actions/radar.ts`)
- **Pausar anuncio / campañas:** escribe en Meta (`META_SYSTEM_USER_TOKEN`), con confirmación.
- **Crear tarea:** queda asignada a quien la aplica.
- Todo queda en `radar_events` y como nota en la bitácora.
- **Descartar** exige un motivo de un clic (Ya lo sé / Es intencional / Dato
  equivocado / No aplica). No reaparece en el ciclo y se puede deshacer.
- **Freno de presupuesto** (`runRadarBudgetGuard`, corre tras `/api/cron/sync-meta`):
  aviso por Telegram al 80% y 90%; al 100% pausa solo si la estrategia dice
  "pausar automático". Cada aviso sale una vez por ciclo.

## Multicanal
Gasto y resultados se normalizan por canal: Meta llega automático y los demás
canales desde campañas manuales (snapshots). Las reglas de presupuesto y costo
usan todos los canales; las de anuncio solo aplican donde hay datos por anuncio
(hoy, Meta). Un canal nuevo con API = un conector nuevo, sin tocar reglas ni UI.

## Migración
`supabase/migrations/111_radar.sql`: `radar_strategies`, `radar_events`.
