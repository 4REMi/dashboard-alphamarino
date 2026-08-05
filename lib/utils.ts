import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("es-PA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("es-PA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date))
}

/**
 * Formats a cycle's real date range, e.g. "27 jun – 27 jul 2026".
 * Used everywhere a paid media cycle needs a human label — replaces the old
 * calendar-month-only labels now that cycles can start on any day.
 * Omits the start year when it matches the end year (the common case);
 * shows both years when the range spans a year boundary.
 */
export function formatCycleRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + "T00:00:00")
  const end = new Date(endDate + "T00:00:00")
  const sameYear = start.getFullYear() === end.getFullYear()
  const startLabel = start.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  })
  const endLabel = end.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  return `${startLabel} – ${endLabel}`
}
