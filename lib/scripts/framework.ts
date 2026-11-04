// Constructor de guiones de video paso a paso — conocimiento del framework
// (runneth.com: Creative Strategy Engine, Hook Writing, Creative Mechanics).
// Orden: Ángulo → Mecánica → Hook → Cuerpo (beats de la mecánica) → Cierre.

export type MechanicKey = "reframe" | "implied_answer" | "social_witness" | "overheard" | "borrowed_enemy" | "trojan_horse" | "contrast" | "this_and_a"

// Modo de un beat: hablado (voz/cámara), solo visual (sin voz: toma + texto en
// pantalla) o chat (el guion son los mensajes de un hilo/DM).
export type BeatMode = "spoken" | "visual" | "chat"
export interface MechanicBeat { name: string; mode: BeatMode; guide: string }
export interface Mechanic {
  label: string
  desc: string
  why: string            // por qué funciona
  stages: number[]       // etapas de awareness donde funciona mejor (1–5)
  hookShape: string      // cómo debe abrir el hook esta mecánica
  beats: MechanicBeat[]  // cuerpo
  close: "cta" | "natural"
  closeGuide: string
  rules: string[]
  example: string
}

// Fichas tomadas de la biblioteca Creative Mechanics (runneth).
export const MECHANICS: Record<MechanicKey, Mechanic> = {
  reframe: {
    label: "The Reframe",
    desc: "Valida una creencia que el espectador ya tiene, muestra que lo ha hecho todo bien según esa lógica y luego voltea el encuadre: el problema real era otro.",
    why: "Genera el momento 'nunca lo había pensado así', que convierte y se comparte. El héroe es la nueva perspectiva, no el producto.",
    stages: [2, 3],
    hookShape: "Valida la creencia convencional (\"Te dijeron que…\", \"Hiciste todo lo que se supone…\"). No voltees todavía: el giro es la estructura de todo el anuncio, no del hook.",
    beats: [
      { name: "Lo está haciendo todo bien", mode: "spoken", guide: "Muestra que según esa lógica la persona hace todo bien y aun así no funciona." },
      { name: "El giro", mode: "spoken", guide: "Revela que el problema real es otro. Una frase contundente." },
      { name: "La solución al problema real", mode: "spoken", guide: "El producto resuelve el problema REAL, no el supuesto." },
    ],
    close: "cta", closeGuide: "CTA según la etapa, desde la nueva perspectiva.",
    rules: ["No es un hook contrarian: el giro llega a la mitad, no en la primera línea.", "El producto entra solo después del giro."],
    example: "App de sueño: \"Te dijeron que solo necesitas 8 horas\" → se ve que hace todo bien → \"El problema nunca fueron las horas, era la calidad\" → la app explica por qué sigue cansado.",
  },
  implied_answer: {
    label: "The Implied Answer",
    desc: "El hook es una pregunta que suena a juicio leve, confusión o curiosidad; los visuales la responden en silencio con una verdad aspiracional.",
    why: "Las conclusiones propias saltan el escepticismo: el insight se siente como pensamiento del espectador, no como claim de marca.",
    stages: [1, 2],
    hookShape: "Una PREGUNTA que suena a observación que alguien haría sobre el cliente (\"¿Por qué siempre te quedas en casa?\"). Sin mencionar producto.",
    beats: [
      { name: "La respuesta silenciosa", mode: "visual", guide: "El mundo del producto responde la pregunta SIN palabras: solo lo que se ve (y texto mínimo si acaso)." },
    ],
    close: "natural", closeGuide: "El producto aparece al final sin explicar la conexión; nada de CTA hablado (si acaso, en pantalla).",
    rules: ["La marca nunca dice la respuesta ni la conexión en voz.", "La respuesta es visual."],
    example: "\"¿Por qué siempre te quedas en casa?\" → él colgando arte increíble en un departamento hermoso → verdad implícita: su casa es tan buena que no necesita salir.",
  },
  social_witness: {
    label: "The Social Witness",
    desc: "Alguien distinto al cliente nota el cambio: un cumplido, una mirada doble, un '¿qué estás haciendo diferente?'.",
    why: "La validación de un tercero es más creíble que un resultado autodeclarado, e implica que el cambio es tan visible que otros lo notan.",
    stages: [2, 4],
    hookShape: "El momento del testigo: alguien que nota el cambio y lo comenta (\"Espera… ¿hiciste algo diferente?\").",
    beats: [
      { name: "Vida normal", mode: "visual", guide: "El cliente en su vida normal, sin hablar del producto." },
      { name: "La reacción del cliente", mode: "spoken", guide: "Respuesta discreta, NO un pitch (una sonrisa, una frase corta)." },
    ],
    close: "natural", closeGuide: "El producto aparece como la explicación obvia, sin locutor vendiendo.",
    rules: ["El cliente no vende: su reacción es discreta.", "El cambio se valida por el tercero, no por el cliente."],
    example: "Sérum capilar: compañera en el pasillo: \"¿Hiciste algo diferente? Tu cabello se ve increíble\" → ella solo sonríe → producto al final, sin voz.",
  },
  overheard: {
    label: "The Overheard Conversation",
    desc: "Se presenta como algo que no debías ver: un hilo de texto, un DM, un chat grupal, una conversación entre amigos.",
    why: "Quita el filtro de 'esto es un anuncio': se procesa como contenido social, y entre amigos no se usa lenguaje de marketing.",
    stages: [1, 2],
    hookShape: "El primer mensaje del hilo, informal y real (\"ok no me juzgues pero…\"), como lo escribiría un amigo.",
    beats: [
      { name: "Alguien menciona el problema", mode: "chat", guide: "Mensajes del hilo: una persona cuenta el problema o pregunta." },
      { name: "La recomendación casual", mode: "chat", guide: "La otra persona recomienda el producto de forma casual (puede mandar foto/captura)." },
    ],
    close: "natural", closeGuide: "Termina como terminaría una conversación real. Sin voz de marca ni CTA formal.",
    rules: ["Sin locutor ni voz de marca.", "Lenguaje de amigos: minúsculas, abreviaciones, nada de claims de marketing.", "Sin CTA formal."],
    example: "Probiótico: hilo de iMessage → \"ok no me juzguen pero llevo un mes con este probiótico\" → \"omg cuál\" → manda captura del producto → fin.",
  },
  borrowed_enemy: {
    label: "The Borrowed Enemy",
    desc: "Describe un problema, ingrediente, sensación o experiencia que obviamente causa un competidor específico, sin nombrarlo nunca.",
    why: "Nombrar al competidor genera defensa y riesgo legal; describirlo de forma inconfundible deja que el espectador haga la conquista solo.",
    stages: [3, 4],
    hookShape: "El problema descrito con detalle vívido y reconocible, con lenguaje que SOLO aplica a la alternativa (sin nombrarla).",
    beats: [
      { name: "El enemigo reconocible", mode: "spoken", guide: "Detalles específicos (ingredientes, forma, sensación, efecto) que solo aplican a la alternativa." },
      { name: "La alternativa natural", mode: "spoken", guide: "El producto como la salida obvia." },
    ],
    close: "cta", closeGuide: "CTA según la etapa (es para gente que ya compara opciones).",
    rules: ["NUNCA nombres al competidor ni marcas reales.", "La referencia debe ser inconfundible por los detalles."],
    example: "Bebida energética limpia: \"Ese bajón con temblores… ingredientes que no puedes pronunciar…\" → todo el que toma Red Bull sabe de quién se habla → la bebida como alternativa.",
  },
  trojan_horse: {
    label: "The Trojan Horse",
    desc: "Parece contenido educativo, entretenimiento o historia personal hasta el último 20 %, donde el producto aparece natural como parte de la resolución.",
    why: "La evasión del anuncio ocurre al reconocerlo; aquí ese momento llega cuando la persona ya está enganchada y el producto se siente ganado.",
    stages: [1],
    hookShape: "Abre como contenido puro (tutorial, historia, observación) sin mencionar producto ni marca.",
    beats: [
      { name: "El contenido de valor", mode: "spoken", guide: "Valor genuino o tensión narrativa, sin mencionar el producto." },
      { name: "El desarrollo", mode: "spoken", guide: "Sigue aportando; el producto todavía no aparece." },
      { name: "El producto entra natural", mode: "spoken", guide: "El producto aparece como parte de la resolución (último 20 %), sin anunciarlo." },
    ],
    close: "natural", closeGuide: "Sin venta dura: el contenido hizo el trabajo. Como mucho una línea casual.",
    rules: ["El producto aparece solo en el último 20 %.", "Nada de venta dura."],
    example: "Cuchillo: tutorial real de cómo picar cebolla → técnica completa → \"y obvio ayuda que este cuchillo sí mantiene el filo\".",
  },
  contrast: {
    label: "The Contrast Without Comment",
    desc: "Dos realidades lado a lado (antes/después, con/sin, método viejo/nuevo) sin que nadie diga cuál es mejor.",
    why: "Decir lo obvio se siente anuncio; mostrarlo y dejar que se concluya se siente evidencia. No editorializar da credibilidad.",
    stages: [2, 3],
    hookShape: "Visual: la primera realidad (el problema) mostrada de forma neutral, o el split screen arrancando. Sin juicio en texto.",
    beats: [
      { name: "Realidad A (sin / antes)", mode: "visual", guide: "El estado problema, mostrado de forma neutral. Sin voz." },
      { name: "Realidad B (con / después)", mode: "visual", guide: "El estado solución, mostrado de forma neutral. Sin voz." },
    ],
    close: "natural", closeGuide: "Sin voz ni texto que juzgue. A lo mucho logo/producto en pantalla.",
    rules: ["Sin voz en off.", "Sin texto que diga cuál es mejor: el contraste habla solo."],
    example: "Colchón, split screen sin voz: izquierda, despertar pesado y snooze; derecha, despertar antes de la alarma, estirándose, descansado.",
  },
  this_and_a: {
    label: "This and a…",
    desc: "El producto aparece junto a algo aspiracional, inesperado o emocional; la yuxtaposición hace todo el trabajo.",
    why: "El significado se hace por asociación: el producto hereda el valor de lo que ya se desea sin reclamarlo.",
    stages: [1, 2],
    hookShape: "El primer elemento de la lista aspiracional (\"Los sábados…\", \"Luz de mañana…\").",
    beats: [
      { name: "Los elementos de la lista", mode: "spoken", guide: "Ritmo de lista \"…y un…\": cada elemento aspiracional tiene su beat." },
      { name: "…y el producto", mode: "spoken", guide: "El producto cierra la lista con mínima conexión: solo \"y un\" o equivalente, sin explicar." },
    ],
    close: "natural", closeGuide: "Sin explicar por qué van juntos; el ritmo de la lista es el cierre.",
    rules: ["No expliques por qué el producto pertenece ahí.", "Ritmo de lista \"y un…\"."],
    example: "\"Un buen libro, un café helado y un vuelo con Loop Earplugs.\"",
  },
}

// Texto completo de una mecánica para los prompts.
export function mechanicBrief(k: MechanicKey): string {
  const m = MECHANICS[k]
  return `MECÁNICA: ${m.label} — ${m.desc}
Por qué funciona: ${m.why}
Cómo abre el hook: ${m.hookShape}
Cuerpo: ${m.beats.map((b, i) => `${i + 1}. ${b.name} [${b.mode === "spoken" ? "hablado" : b.mode === "visual" ? "SOLO VISUAL, sin voz" : "CHAT/mensajes"}] — ${b.guide}`).join(" ")}
Cierre: ${m.close === "cta" ? "con CTA" : "NATURAL, sin CTA hablado"} — ${m.closeGuide}
Reglas: ${m.rules.join(" ")}
Ejemplo: ${m.example}`
}
export const MECHANIC_KEYS = Object.keys(MECHANICS) as MechanicKey[]

export const TRIGGERS = [
  "Pattern interrupt", "Identity call-out", "Pain agitation", "Curiosity gap",
  "Prueba social", "Contrarian / mito", "Aspiración", "Urgencia / riesgo",
] as const

export const AWARENESS: Record<number, { label: string; hook: string; close: string }> = {
  1: { label: "Unaware", hook: "No menciones el producto ni la solución. Describe el dolor o deseo como si leyeras su mente.", close: "Cierre suave: invita a conocer más, sin presión de compra." },
  2: { label: "Problem-aware", hook: "Agita el dolor sin suavizarlo; que sienta que lo entiendes por completo.", close: "Presenta la solución como alivio y un CTA claro de bajo compromiso." },
  3: { label: "Solution-aware", hook: "Diferénciate de lo que ya probó; posiciónate contra las alternativas.", close: "Por qué esta solución y no otra + CTA." },
  4: { label: "Product-aware", hook: "Elimina objeciones con prueba social y FOMO.", close: "Quita la última objeción (garantía, prueba, testimonio) + CTA." },
  5: { label: "Most-aware", hook: "Directo: oferta, urgencia, garantía, CTA.", close: "Oferta concreta, urgencia real y CTA directo." },
}

export interface ScriptHook { key?: string; trigger: string; spoken: string; visual: string; overlay: string; why?: string }
export interface ScriptPart { spoken: string; visual: string; overlay?: string }

// Velocidad de habla promedio de un anuncio: ~150 palabras/min = 2.5 por segundo.
export const WORDS_PER_SECOND = 2.5
export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
export const estimateSeconds = (text: string) => Math.round(wordCount(text) / WORDS_PER_SECOND)

// Presupuesto de palabras por parte para una duración objetivo:
// hook ~15 %, cierre ~20 %, el resto repartido entre los beats del cuerpo.
// Los beats solo visuales no gastan palabras: el presupuesto se reparte entre
// los hablados/chat. Un cierre natural es más corto.
export function wordBudget(targetSeconds: number, beats: number, closeNatural = false) {
  const total = Math.round(targetSeconds * WORDS_PER_SECOND)
  const hook = Math.max(6, Math.round(total * 0.15))
  const close = Math.max(4, Math.round(total * (closeNatural ? 0.1 : 0.2)))
  const beat = Math.max(6, Math.round((total - hook - close) / Math.max(1, beats)))
  return { total, hook, close, beat }
}
export const spokenBeats = (k: MechanicKey) => MECHANICS[k].beats.filter((b) => b.mode !== "visual").length

// Revisión con las reglas de Hook Writing. Ayuda, no bloquea.
export function lintScript(input: { hooks: ScriptHook[]; body: ScriptPart[]; close: ScriptPart | null; brandName?: string | null; targetSeconds?: number }): { level: "warn" | "info"; text: string; fix: string }[] {
  const out: { level: "warn" | "info"; text: string; fix: string }[] = []
  if (input.targetSeconds) {
    const rest = [...input.body.map((b) => b.spoken), input.close?.spoken ?? ""].join(" ")
    for (const [i, h] of input.hooks.entries()) {
      const secs = estimateSeconds(`${h.spoken} ${rest}`)
      if (secs > input.targetSeconds * 1.15) out.push({ level: "warn", text: `Guion ${i + 1} dura ~${secs} s (objetivo ${input.targetSeconds} s).`, fix: "Recorta el beat más largo o elige opciones más cortas." })
    }
  }
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const adWords = /^(descubre|conoce|te presentamos|presentamos|introducing|discover|¿?buscas|¿?estas buscando|¿?quieres)/
  for (const [i, h] of input.hooks.entries()) {
    const s = norm(h.spoken.trim())
    if (adWords.test(s)) out.push({ level: "warn", text: `Hook ${i + 1} suena a anuncio ("${h.spoken.split(" ").slice(0, 3).join(" ")}…").`, fix: "Empieza por el dolor o deseo, en la voz del cliente." })
    if (input.brandName && s.startsWith(norm(input.brandName))) out.push({ level: "warn", text: `Hook ${i + 1} abre con la marca.`, fix: "La marca nunca va primero: abre con la persona o el problema." })
    if (!/\d/.test(h.spoken) && h.trigger.toLowerCase().includes("prueba")) out.push({ level: "info", text: `Hook ${i + 1} es de prueba social pero no trae un dato concreto.`, fix: "Agrega una cifra o resultado específico." })
  }
  const triggers = input.hooks.map((h) => h.trigger)
  const dup = triggers.find((t, i) => triggers.indexOf(t) !== i)
  if (dup) out.push({ level: "info", text: `Dos hooks usan el mismo disparador (${dup}).`, fix: "Para testear, varía el disparador manteniendo el ángulo." })
  const all = [...input.body.map((b) => b.spoken), input.close?.spoken ?? ""].join(" ")
  if (all && !/\d/.test(all)) out.push({ level: "info", text: "El guion no tiene ningún dato concreto (cifra, tiempo, precio, resultado).", fix: "Los detalles específicos hacen creíble el mensaje." })
  if (!input.close) out.push({ level: "warn", text: "Falta el cierre.", fix: "Elige o escribe un cierre." })
  return out
}
