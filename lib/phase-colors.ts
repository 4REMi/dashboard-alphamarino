// Deterministic color palette for project phases — indexed by phase_order % 8.
// Used in both the task table phase badge and the project phases stepper
// so that colors match across both views.

export const PHASE_COLORS = [
  { bg: "bg-blue-500",    light: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-400"    },
  { bg: "bg-violet-500",  light: "bg-violet-100",  text: "text-violet-700",  border: "border-violet-400"  },
  { bg: "bg-amber-500",   light: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-400"   },
  { bg: "bg-emerald-500", light: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-400" },
  { bg: "bg-rose-500",    light: "bg-rose-100",    text: "text-rose-700",    border: "border-rose-400"    },
  { bg: "bg-cyan-500",    light: "bg-cyan-100",    text: "text-cyan-700",    border: "border-cyan-400"    },
  { bg: "bg-orange-500",  light: "bg-orange-100",  text: "text-orange-700",  border: "border-orange-400"  },
  { bg: "bg-indigo-500",  light: "bg-indigo-100",  text: "text-indigo-700",  border: "border-indigo-400"  },
] as const

export type PhaseColorEntry = typeof PHASE_COLORS[number]

export function phaseColor(phaseOrder: number): PhaseColorEntry {
  return PHASE_COLORS[phaseOrder % PHASE_COLORS.length]
}
