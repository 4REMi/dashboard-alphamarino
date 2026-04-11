export const ANGLE_GUIDE = [
  {
    name: "Problem Agitation",
    mechanism: "Amplifica el dolor existente antes de ofrecer solución. El buyer siente que su problema es más urgente de lo que creía.",
    when_to_use: "Awareness stage 2–3. El buyer ya sabe que tiene el problema pero no lo ha priorizado.",
    hook_example: "¿Sigues aguantando eso? Cada día que esperas lo hace peor.",
  },
  {
    name: "Mechanism Reveal",
    mechanism: "Explica por qué otras soluciones fallan, luego presenta el mecanismo correcto. Genera credibilidad al mostrar comprensión profunda del problema.",
    when_to_use: "Awareness stage 3–4. El buyer ha intentado otras soluciones sin éxito.",
    hook_example: "La razón por la que nada te ha funcionado no es tu disciplina. Es esto.",
  },
  {
    name: "Enemy Framing",
    mechanism: "Identifica un villano externo responsable del problema del buyer. Alivia culpa y crea unidad entre el buyer y la marca.",
    when_to_use: "Awareness stage 2–3. Funciona cuando hay una causa externa real (industria, sistema, mala información).",
    hook_example: "Las marcas grandes no quieren que sepas esto.",
  },
  {
    name: "Before/After Transformation",
    mechanism: "Contrasta el estado actual (doloroso) con el estado deseado (posible). Activa la imaginación del buyer sobre su versión mejorada.",
    when_to_use: "Awareness stage 2–4. Funciona en casi cualquier vertical con transformación visible.",
    hook_example: "Hace 6 meses no podía cerrar ni un cliente. Hoy facturé $80k.",
  },
  {
    name: "Social Proof",
    mechanism: "Usa evidencia social para validar la solución. El cerebro usa la conducta de otros como atajo de decisión.",
    when_to_use: "Awareness stage 4–5. El buyer ya considera la categoría pero necesita validación externa.",
    hook_example: "47,000 negocios ya usan esto. ¿Por qué tú todavía no?",
  },
  {
    name: "Contrarian",
    mechanism: "Desafía una creencia común del mercado. El patrón interruptor obliga atención y genera curiosidad al contradecir lo esperado.",
    when_to_use: "Awareness stage 1–3. Mercados saturados donde el buyer ya escuchó todo lo normal.",
    hook_example: "Deja de ahorrar. El ahorro te está haciendo pobre.",
  },
  {
    name: "Direct Desire",
    mechanism: "Habla directamente al deseo sin rodeos. Elimina fricción cognitiva para buyers con alta intención.",
    when_to_use: "Awareness stage 4–5. Buyer listo para comprar, solo necesita el empujón.",
    hook_example: "Quieres perder 10 kg en 60 días. Aquí está exactamente cómo.",
  },
  {
    name: "Fear of Missing Out",
    mechanism: "Activa el miedo a quedarse atrás o perder una oportunidad. La aversión a la pérdida es 2x más poderosa que el deseo de ganancia.",
    when_to_use: "Awareness stage 3–5. Funciona con ofertas con escasez real o tendencias de mercado.",
    hook_example: "Los que compraron hace 3 meses ya recuperaron su inversión. Tú todavía estás esperando.",
  },
  {
    name: "Authority",
    mechanism: "Establece credibilidad y expertise antes de la propuesta. El buyer baja sus defensas ante una fuente percibida como experta.",
    when_to_use: "Awareness stage 2–4. Nichos donde la confianza es la barrera principal (salud, finanzas, legal).",
    hook_example: "15 años auditando empresas me enseñaron el error que nadie menciona.",
  },
  {
    name: "Curiosity Gap",
    mechanism: "Abre un loop de información que solo se cierra con la acción. El cerebro tiene aversión a la incertidumbre incompleta.",
    when_to_use: "Awareness stage 1–3. Audiencias frías donde la curiosidad debe preceder al deseo.",
    hook_example: "Hay un ingrediente en tu cocina que bloquea tu metabolismo. No es lo que crees.",
  },
] as const

export type AngleType = typeof ANGLE_GUIDE[number]["name"]

export const AWARENESS_LABELS: Record<number, string> = {
  1: "Unaware",
  2: "Problem-Aware",
  3: "Solution-Aware",
  4: "Product-Aware",
  5: "Most-Aware",
}

export const PRODUCTION_STATUS_COLORS: Record<string, string> = {
  Pending:       "bg-gray-100 text-gray-600",
  "In Production": "bg-blue-100 text-blue-700",
  "In Review":   "bg-yellow-100 text-yellow-700",
  Approved:      "bg-emerald-100 text-emerald-700",
  Published:     "bg-purple-100 text-purple-700",
}

export const VERDICT_COLORS: Record<string, string> = {
  Winner:  "bg-emerald-100 text-emerald-700",
  Scale:   "bg-blue-100 text-blue-700",
  Iterate: "bg-yellow-100 text-yellow-700",
  Archive: "bg-gray-100 text-gray-500",
}

export const CONCEPT_STATUS_COLORS: Record<string, string> = {
  Active:     "bg-emerald-100 text-emerald-700",
  Archived:   "bg-gray-100 text-gray-500",
  Transmuted: "bg-blue-100 text-blue-700",
  Evergreen:  "bg-amber-100 text-amber-700",
}
