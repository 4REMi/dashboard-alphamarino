export const ANGLE_GUIDE = [
  {
    name: "Desired Outcome",
    emoji: "❤️",
    guiding_question: "¿Con qué sueñan al despertar?",
    mechanism: "Activa el sistema de recompensa. La persona visualiza la versión mejorada de su vida. El producto se convierte en el vehículo de esa transformación.",
    when_to_use: "Awareness stage 3–5. El buyer ya quiere el resultado pero no ha imaginado concretamente su vida con él.",
    hook_example: "Imagina despertar mañana y que tu negocio ya no dependa de ti para funcionar.",
  },
  {
    name: "Objection",
    emoji: "🛑",
    guiding_question: "¿Qué les impide comprar ahora mismo?",
    mechanism: "Elimina la fricción cognitiva. Nombrar la objeción en voz alta la desactiva — el prospecto siente que lo entiendes mejor que nadie.",
    when_to_use: "Awareness stage 4–5. El buyer está casi listo para comprar pero tiene una duda específica que lo frena.",
    hook_example: "Sé lo que estás pensando: 'esto es demasiado caro'. Déjame mostrarte por qué es exactamente al revés.",
  },
  {
    name: "Feature / Benefit",
    emoji: "✅",
    guiding_question: "¿Qué del producto les importa realmente?",
    mechanism: "Conecta una característica técnica con un beneficio emocional real. La característica sola no vende — el beneficio que produce, sí.",
    when_to_use: "Awareness stage 3–5. El buyer compara opciones y necesita entender qué lo hace diferente en términos que le importan.",
    hook_example: "Nuestra plataforma actualiza en tiempo real — lo que significa que nunca más pierdes una venta por datos desactualizados.",
  },
  {
    name: "Use Case",
    emoji: "🔥",
    guiding_question: "¿Cómo viven el dolor día a día?",
    mechanism: "Coloca al espectador en una escena específica donde reconoce su propia experiencia. La especificidad crea identificación instantánea.",
    when_to_use: "Awareness stage 2–4. El buyer vive el dolor diariamente pero no lo ha conectado con una solución.",
    hook_example: "Son las 9pm, llevas 3 horas en una hoja de cálculo y aún no sabes cuánto facturaste este mes.",
  },
  {
    name: "Consequence",
    emoji: "⚠️",
    guiding_question: "¿Qué empeora si no lo resuelven?",
    mechanism: "Activa la aversión a la pérdida. El cerebro reacciona más fuertemente a lo que puede perder que a lo que puede ganar.",
    when_to_use: "Awareness stage 2–3. El buyer sabe que tiene un problema pero no ha calculado el costo real de no resolverlo.",
    hook_example: "Cada mes que tardas en automatizar esto estás dejando $15,000 en la mesa.",
  },
  {
    name: "Misconception",
    emoji: "💭",
    guiding_question: "¿Qué creen que es verdad y no lo es?",
    mechanism: "El reencuadre cognitivo crea curiosidad obligatoria. La mente necesita resolver la contradicción — esto genera atención máxima.",
    when_to_use: "Awareness stage 1–3. El buyer tiene una creencia errónea que le impide buscar la solución correcta.",
    hook_example: "Todos te dijeron que necesitas más seguidores para vender. Están equivocados.",
  },
  {
    name: "Education",
    emoji: "💡",
    guiding_question: "¿Qué no saben sobre su propio problema?",
    mechanism: "Posiciona tu marca como autoridad. La educación crea deuda de reciprocidad: 'me enseñaron algo valioso, les confío mi decisión'.",
    when_to_use: "Awareness stage 1–3. Audiencias frías que no conocen el problema a fondo ni han buscado solución.",
    hook_example: "La razón real por la que tus ads no convierten no es el presupuesto. Es esto.",
  },
  {
    name: "Acceptance",
    emoji: "😌",
    guiding_question: "¿Qué han normalizado sin darse cuenta?",
    mechanism: "Crea disonancia cognitiva suave. Hace que el espectador se dé cuenta de que ha tolerado algo inaceptable — y que no tiene por qué seguir haciéndolo.",
    when_to_use: "Awareness stage 2–3. El buyer ha normalizado una situación problemática y necesita un espejo que se la señale.",
    hook_example: "¿Cuánto tiempo llevas diciéndote 'así funciona esto' cuando en realidad no tiene que ser así?",
  },
  {
    name: "Failed Solutions",
    emoji: "❌",
    guiding_question: "¿Qué han intentado que no funcionó?",
    mechanism: "Valida la frustración acumulada del prospecto. 'Tenías razón en estar frustrado' baja las defensas y abre la mente a una solución nueva.",
    when_to_use: "Awareness stage 3–4. El buyer ha intentado resolver el problema antes y fracasó. Tiene escepticismo acumulado.",
    hook_example: "Si ya probaste cursos, coaches y herramientas y nada funcionó, no es tu culpa — el problema es otro.",
  },
  {
    name: "Identity",
    emoji: "🪪",
    guiding_question: "¿Quién aspiran a ser?",
    mechanism: "Vende pertenencia, no producto. La decisión de compra se convierte en un acto de autoexpresión e identidad tribal.",
    when_to_use: "Awareness stage 3–5. Mercados donde la compra define quién eres, no solo lo que tienes.",
    hook_example: "Esto no es para cualquiera. Es para los que ya decidieron que no van a conformarse con menos.",
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
