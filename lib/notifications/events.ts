// ============================================================
// Notification event registry — the single source of truth for what
// notifications exist in this app. This IS the documentation: every
// event this system can send lives here, typed, so notify() (see
// notify.ts) can't be called with a wrong event key or a payload
// missing a required field without TypeScript catching it.
//
// To add a new event:
//   1. Add an entry below with a `label` (Spanish, for the log/UI)
//      and a `build(data)` function that returns the message text.
//   2. Call `notify(profileId, "your_event_key", { ...data })` at
//      whatever point in the code triggers it.
// That's it — no other file needs to change. See README.md in this
// folder for the full guide and the list of what's wired up so far.
// ============================================================

export const NOTIFICATION_EVENTS = {
  task_assigned: {
    label: "Tarea asignada",
    build: (data: { taskTitle: string; projectName?: string }) =>
      `📋 Se te asignó una tarea: *${data.taskTitle}*${data.projectName ? ` · ${data.projectName}` : ""}`,
  },
  project_member_added: {
    label: "Agregado a proyecto",
    build: (data: { projectName: string }) =>
      `📁 Te agregaron al proyecto *${data.projectName}*`,
  },
} as const

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS
export type NotificationPayload<K extends NotificationEventKey> =
  Parameters<(typeof NOTIFICATION_EVENTS)[K]["build"]>[0]
