// Encuentra la mejor coincidencia por nombre (exacta o parcial, sin distinguir mayúsculas/acentos).
export function findByName<T extends { name: string }>(items: T[], name?: string): T | null {
  if (!name) return null
  const norm = (s: string) => s.toLowerCase().trim()
  const target = norm(name)
  return (
    items.find((p) => norm(p.name) === target) ??
    items.find((p) => norm(p.name).includes(target) || target.includes(norm(p.name))) ??
    null
  )
}
