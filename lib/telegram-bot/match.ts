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

// Como findByName, pero devuelve TODAS las coincidencias en vez de solo la
// primera — necesario cuando el texto de búsqueda es más largo/variable
// (títulos de tarea, que a diferencia de nombres de proyecto/cliente pueden
// repetirse entre proyectos por ser estandarizados) y una sola coincidencia
// no es suficiente para actuar sin confirmar que no hay ambigüedad.
export function findAllMatches<T>(items: T[], field: (item: T) => string, query?: string): T[] {
  if (!query) return []
  const norm = (s: string) => s.toLowerCase().trim()
  const target = norm(query)
  const exact = items.filter((i) => norm(field(i)) === target)
  if (exact.length > 0) return exact
  return items.filter((i) => norm(field(i)).includes(target) || target.includes(norm(field(i))))
}
