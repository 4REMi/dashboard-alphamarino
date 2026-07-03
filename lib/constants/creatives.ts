export const CREATIVE_MECHANICS = [
  {
    name: "Implied Answer",
    emoji: "🔍",
    description: "El hook plantea una pregunta que suena a juicio suave o curiosidad. Los visuales responden en silencio. Nadie declara la respuesta — el viewer la concluye solo.",
    architecture: "El viewer llega a la verdad por sí mismo. Las auto-conclusiones bypasean el escepticismo al ad.",
    awareness_fit: "Unaware · Problem-Aware",
  },
  {
    name: "Social Witness",
    emoji: "👥",
    description: "Alguien distinto al cliente nota el cambio — un cumplido, un doble vistazo, un '¿qué estás haciendo diferente?'. La validación de terceros es más creíble que los resultados auto-reportados.",
    architecture: "Úsalo como mecánica secundaria superpuesta a otra. La validación externa hace el trabajo de credibilidad.",
    awareness_fit: "Problem-Aware · Product-Aware",
  },
  {
    name: "Overheard Conversation",
    emoji: "🎧",
    description: "El ad está enmarcado como algo que no debías ver — un hilo de texto, un DM, un chat grupal. Se siente como espionaje, no como publicidad.",
    architecture: "Elimina completamente el filtro de 'esto es un anuncio'. El viewer entra sin defensas.",
    awareness_fit: "Unaware · Problem-Aware",
  },
  {
    name: "Reframe",
    emoji: "🔄",
    description: "Abre validando una creencia que el viewer ya tiene, luego voltea el frame completamente. El producto no es el héroe — la nueva perspectiva lo es.",
    architecture: "Manufactura el momento 'nunca lo había pensado así'. No confundir con un hook contrarian — el Reframe es arquitectura, no solo apertura.",
    awareness_fit: "Problem-Aware · Solution-Aware",
  },
  {
    name: "Borrowed Enemy",
    emoji: "⚔️",
    description: "Describe un problema, ingrediente o experiencia causado obviamente por un competidor específico — sin nombrarlo nunca. El viewer hace la conexión solo.",
    architecture: "Nombrar al competidor activa defensas. No nombrarlo pero hacer la referencia inconfundible permite que el viewer conquiste por sí mismo.",
    awareness_fit: "Solution-Aware · Product-Aware",
  },
  {
    name: "Trojan Horse",
    emoji: "🐴",
    description: "El ad parece contenido educativo, entretenimiento o una historia personal — hasta el último 20%, donde el producto aparece naturalmente como resolución.",
    architecture: "El ad avoidance es más alto en el momento de reconocimiento. El Trojan Horse retrasa ese reconocimiento hasta que el viewer ya está invertido emocionalmente.",
    awareness_fit: "Unaware — más poderoso para audiencias frías",
  },
  {
    name: "Contrast Without Comment",
    emoji: "⚖️",
    description: "Muestra dos realidades en paralelo — antes/después, con/sin, método viejo/nuevo — pero nunca editorialmente le dice al viewer cuál es mejor.",
    architecture: "La ausencia de editorialización es en sí una señal de credibilidad. La yuxtaposición visual hace el trabajo; el copy se retira.",
    awareness_fit: "Problem-Aware · Solution-Aware",
  },
  {
    name: "This and a…",
    emoji: "✨",
    description: "Dos cosas mostradas o nombradas juntas — el producto y algo aspiracional o emocionalmente resonante — con la yuxtaposición haciendo todo el trabajo.",
    architecture: "El significado se crea por asociación. El cerebro del viewer hace el trabajo, lo que aterriza más fuerte que un claim declarado.",
    awareness_fit: "Unaware · Problem-Aware",
  },
] as const

export type CreativeMechanic = typeof CREATIVE_MECHANICS[number]["name"]

export const MECHANIC_PAIRINGS: Array<[CreativeMechanic, CreativeMechanic]> = [
  ["Implied Answer",           "Social Witness"],
  ["Trojan Horse",             "Reframe"],
  ["Overheard Conversation",   "Social Witness"],
  ["Contrast Without Comment", "Borrowed Enemy"],
]

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

// ── Proven video-script structures (for Quick Create — scripts written from
// scratch, no reference ad to adapt) ────────────────────────────────────────
// The user always picks the structure explicitly — it is never inferred from
// the concept's angle_type. Keep additions here to structures that are
// genuinely distinct beat sequences for a spoken 20-40s script, not just a
// different flavor of an existing one.

export const SCRIPT_STRUCTURES = [
  {
    key: "pas",
    name: "PAS — Problem / Agitate / Solve",
    engine: "Dolor / fricción",
    beats: [
      "Hook: nombra el problema o dolor concreto",
      "Agita: intensifica la consecuencia de no resolverlo",
      "Resuelve: el producto como la solución",
      "CTA",
    ],
  },
  {
    key: "bab",
    name: "BAB — Before / After / Bridge",
    engine: "Deseo / visualización",
    beats: [
      "Hook: estado actual (before)",
      "After: el futuro deseado, vívido y específico",
      "Bridge: el producto como el puente hacia ese after",
      "CTA",
    ],
  },
  {
    key: "testimonial",
    name: "Testimonial / Story Arc",
    engine: "Prueba social, primera persona",
    beats: [
      "Hook: \"yo también...\" — identificación inmediata",
      "Intentos fallidos: qué probó antes y no funcionó",
      "Descubrimiento: cómo encontró la solución real",
      "Resultado + CTA",
    ],
  },
  {
    key: "myth_bust",
    name: "Myth-Bust / Pattern Interrupt",
    engine: "Curiosidad / disonancia cognitiva",
    beats: [
      "Hook: declara la creencia común",
      "La voltea (\"en realidad...\")",
      "Revela el mecanismo real",
      "CTA",
    ],
  },
  {
    key: "mechanism",
    name: "Mechanism-Led (Hook–Problem–Mechanism–Proof–Offer)",
    engine: "Mecanismo único / autoridad",
    beats: [
      "Hook",
      "Problem: el problema concreto",
      "New Idea / Mechanism: la razón real, el mecanismo nuevo que nadie más explica",
      "Proof: evidencia de que el mecanismo funciona",
      "Offer: la oferta concreta",
      "CTA",
    ],
  },
] as const

export type ScriptStructureKey = typeof SCRIPT_STRUCTURES[number]["key"]

export const AWARENESS_LABELS: Record<number, string> = {
  1: "Unaware",
  2: "Problem-Aware",
  3: "Solution-Aware",
  4: "Product-Aware",
  5: "Most-Aware",
}

export const PRODUCTION_STATUS_COLORS: Record<string, string> = {
  Pending:           "bg-amber-50 text-amber-700",
  "In Production":   "bg-blue-50 text-blue-700",
  "In Review":       "bg-violet-50 text-violet-700",
  Approved:          "bg-emerald-50 text-emerald-700",
  Published:         "bg-slate-900 text-white",
}

export const VERDICT_COLORS: Record<string, string> = {
  Winner:  "bg-amber-50 text-amber-700",
  Scale:   "bg-emerald-50 text-emerald-700",
  Iterate: "bg-blue-50 text-blue-700",
  Archive: "bg-gray-100 text-gray-400",
}

export const VERDICT_EMOJIS: Record<string, string> = {
  Winner:  "🏆",
  Scale:   "📈",
  Iterate: "🔄",
  Archive: "📦",
}

export const FORMAT_EMOJIS: Record<string, string> = {
  "VO + B-roll": "🎬",
  "UGC":         "🎥",
  "Static":      "🖼️",
  "Carousel":    "📊",
  "Other":       "✦",
}

export const PLATFORM_COLORS: Record<string, string> = {
  "Meta Ads":     "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/60",
  "TikTok Ads":   "bg-slate-900 text-white",
  "Google Ads":   "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200/60",
  "LinkedIn Ads": "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200/60",
  "Pinterest Ads":"bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/60",
}

export const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-sky-100 text-sky-700",
  MOF: "bg-violet-100 text-violet-700",
  BOF: "bg-emerald-100 text-emerald-700",
}

export const CONCEPT_STATUS_COLORS: Record<string, string> = {
  Active:     "bg-emerald-100 text-emerald-700",
  Archived:   "bg-gray-100 text-gray-500",
  Transmuted: "bg-blue-100 text-blue-700",
  Evergreen:  "bg-amber-100 text-amber-700",
}
