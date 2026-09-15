// Shared palette for Split Text's numbered parts/connections — same colors
// used on the node's part badges, the part handles, and the numbered edge
// badge so a part reads as "the same color" everywhere it shows up.
export const SPLIT_PART_COLORS = [
  "#f43f5e", // rose
  "#3b82f6", // blue
  "#22c55e", // green
  "#eab308", // yellow
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
]

export function splitPartColor(index: number): string {
  return SPLIT_PART_COLORS[index % SPLIT_PART_COLORS.length]
}
