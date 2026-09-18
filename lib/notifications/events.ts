// ============================================================
// Notification event registry — the single source of truth for what
// notifications exist in this app. This IS the documentation: every
// event this system can send lives here, typed, so notify() (see
// notify.ts) can't be called with a wrong event key or a payload
// missing a required field without TypeScript catching it.
//
// To add a new event:
//   1. Add an entry below with a `label` (Spanish, for the log/UI)
//      and a `build(data, lang)` function that returns the message text
//      in Spanish or English depending on `lang`.
//   2. Call `notify(profileId, "your_event_key", { ...data })` at
//      whatever point in the code triggers it.
// That's it — no other file needs to change. See README.md in this
// folder for the full guide and the list of what's wired up so far.
//
// Language: notify() reads the recipient's own profiles.language ("es" |
// "en", same field the dashboard UI already uses for their locale) and
// passes it to build() — each person gets notified in whatever language
// they already use, no separate notification-language setting needed.
// ============================================================

export type NotificationLang = "es" | "en"

export const NOTIFICATION_EVENTS = {
  task_assigned: {
    label: "Tarea asignada",
    build: (data: { taskTitle: string; projectName?: string }, lang: NotificationLang) =>
      lang === "en"
        ? `📋 You were assigned a task: *${data.taskTitle}*${data.projectName ? ` · ${data.projectName}` : ""}`
        : `📋 Se te asignó una tarea: *${data.taskTitle}*${data.projectName ? ` · ${data.projectName}` : ""}`,
  },
  project_member_added: {
    label: "Agregado a proyecto",
    build: (data: { projectName: string }, lang: NotificationLang) =>
      lang === "en"
        ? `📁 You were added to project *${data.projectName}*`
        : `📁 Te agregaron al proyecto *${data.projectName}*`,
  },
  // Three variants of the same underlying event — a task marked "pingueada"
  // (Ping) was moved to Done — chosen per recipient by
  // notifyPingedTaskCompleted (lib/actions/tasks.ts) depending on whether
  // they're the one who completed it, and whether they were targeted
  // specifically or just part of the project-wide broadcast. Replaces the
  // old decorative "Urgente" flag, which nobody actually acted on now that
  // a real notification system exists. Never blocking — Ping only narrows
  // who hears about a completion, it doesn't gate the task itself on
  // anything.
  task_pinged_completed: {
    label: "Tarea pingueada completada (equipo)",
    build: (data: { taskTitle: string; projectName: string; completedByName: string }, lang: NotificationLang) =>
      lang === "en"
        ? `🔔 *${data.taskTitle}* (pinged) was completed by ${data.completedByName} · ${data.projectName}`
        : `🔔 *${data.taskTitle}* (pingueada) fue completada por ${data.completedByName} · ${data.projectName}`,
  },
  // Sent instead of task_pinged_completed when Ping was aimed at specific
  // people rather than the whole project — makes clear this wasn't a
  // broadcast, someone pinged you directly.
  task_pinged_completed_targeted: {
    label: "Tarea pingueada completada (dirigido)",
    build: (data: { taskTitle: string; projectName: string; completedByName: string }, lang: NotificationLang) =>
      lang === "en"
        ? `🔔 You were pinged — *${data.taskTitle}* was completed by ${data.completedByName} · ${data.projectName}`
        : `🔔 Te pinguearon — *${data.taskTitle}* fue completada por ${data.completedByName} · ${data.projectName}`,
  },
  // Sent to whoever actually completed the pinged task, instead of either
  // variant above — reads as a confirmation of their own action rather
  // than news about someone else's.
  task_pinged_completed_self: {
    label: "Tarea pingueada completada (por ti)",
    build: (data: { taskTitle: string; projectName: string }, lang: NotificationLang) =>
      lang === "en"
        ? `✅ You completed a pinged task: *${data.taskTitle}* · ${data.projectName}`
        : `✅ Completaste una tarea pingueada: *${data.taskTitle}* · ${data.projectName}`,
  },
  // Bitácora — igual que Ping en tareas, opt-in por nota (nunca automático:
  // la mayoría de las notas son solo constancia interna). Sin variante
  // "self" — a diferencia de completar una tarea pingueada, quien escribe
  // la nota no necesita una confirmación de que la escribió.
  project_note_notify: {
    label: "Nota de bitácora (equipo)",
    build: (data: { projectName: string; authorName: string; body: string }, lang: NotificationLang) =>
      lang === "en"
        ? `📋 New log note in *${data.projectName}* by ${data.authorName}:\n${data.body}`
        : `📋 Nueva nota en la bitácora de *${data.projectName}*, de ${data.authorName}:\n${data.body}`,
  },
  project_note_notify_targeted: {
    label: "Nota de bitácora (dirigida)",
    build: (data: { projectName: string; authorName: string; body: string }, lang: NotificationLang) =>
      lang === "en"
        ? `📋 ${data.authorName} tagged you on a log note in *${data.projectName}*:\n${data.body}`
        : `📋 ${data.authorName} te avisó de una nota en la bitácora de *${data.projectName}*:\n${data.body}`,
  },
  // The daily cycle check (app/api/cron/check-cycles, lib/actions/projects.ts
  // runDailyCycleCheck) fires each of these at most once per cycle — a
  // preventive heads-up ~4 days before end_date, and (only if the project
  // hasn't opted into auto-close) a single notice the day it's confirmed
  // overdue. Sent to every project member, same broadcast pattern as Ping.
  cycle_ending_soon: {
    label: "Ciclo por terminar",
    build: (data: { projectName: string; endDate: string }, lang: NotificationLang) =>
      lang === "en"
        ? `📅 The active cycle for *${data.projectName}* ends ${data.endDate} — plan the close/renewal`
        : `📅 El ciclo activo de *${data.projectName}* termina el ${data.endDate} — hay que planear el cierre/renovación`,
  },
  cycle_overdue: {
    label: "Ciclo vencido sin cerrar",
    build: (data: { projectName: string; endDate: string }, lang: NotificationLang) =>
      lang === "en"
        ? `⚠️ The cycle for *${data.projectName}* ended ${data.endDate} and is still open — close it or open the next one`
        : `⚠️ El ciclo de *${data.projectName}* terminó el ${data.endDate} y sigue abierto — ciérralo o abre el siguiente`,
  },
  cycle_auto_closed: {
    label: "Ciclo cerrado automáticamente",
    build: (data: { projectName: string; endDate: string }, lang: NotificationLang) =>
      lang === "en"
        ? `🔒 The cycle for *${data.projectName}* (ended ${data.endDate}) was closed automatically — this project has auto-close on`
        : `🔒 El ciclo de *${data.projectName}* (terminó el ${data.endDate}) se cerró automáticamente — este proyecto tiene el auto-cierre activado`,
  },
  // One of these per person, per batch — not one "task_assigned" per task.
  // Applying a phase set (at project creation, or later via "Agregar
  // fases"/"Aplicar phase set") can auto-assign many tasks by position in a
  // single shot; this collapses that into a single notification.
  project_phase_tasks_assigned: {
    label: "Fases aplicadas a proyecto",
    build: (data: { projectName: string; taskCount: number }, lang: NotificationLang) =>
      lang === "en"
        ? `📁 Phases were applied on *${data.projectName}* — you got ${data.taskCount} task${data.taskCount === 1 ? "" : "s"}`
        : `📁 Se aplicaron fases en *${data.projectName}* — te tocaron ${data.taskCount} tarea${data.taskCount === 1 ? "" : "s"}`,
  },
} as const

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS
export type NotificationPayload<K extends NotificationEventKey> =
  Parameters<(typeof NOTIFICATION_EVENTS)[K]["build"]>[0]
