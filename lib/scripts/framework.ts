import { findWritingTics } from "@/lib/ai/writing-tics"
// Constructor de guiones de video paso a paso — conocimiento del framework
// (runneth.com: Creative Strategy Engine, Hook Writing, Creative Mechanics).
// Orden: Ángulo → Método → Hook → Cuerpo (beats del método) → Cierre.
//
// "Método" = cómo se conectan hook, cuerpo y cierre. Hay dos familias con la
// MISMA forma (así todo el constructor las trata igual):
//   - MECHANICS: mecánicas creativas (reframe, social witness…): patrones
//     con giro, buenos para ángulos específicos.
//   - FRAMEWORKS: estructuras clásicas de copywriting de respuesta directa
//     (Hook–Cuerpo–CTA, PAS, AIDA, BAB, HSO, 4 P, Testimonio): décadas de uso,
//     la opción segura cuando una mecánica no encaja.

export type MechanicKey = "reframe" | "implied_answer" | "social_witness" | "overheard" | "borrowed_enemy" | "trojan_horse" | "contrast" | "this_and_a"

// Modo de un beat: hablado (voz/cámara), solo visual (sin voz: toma + texto en
// pantalla) o chat (el guion son los mensajes de un hilo/DM).
export type BeatMode = "spoken" | "visual" | "chat"
export const MODE_LABEL: Record<BeatMode, string> = { spoken: "hablado", visual: "solo visual, sin voz", chat: "mensajes de chat" }
export interface MechanicBeat { name: string; mode: BeatMode; guide: string }
export interface Mechanic {
  kind: "mechanic" | "framework"
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
    kind: "mechanic",
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
    kind: "mechanic",
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
    kind: "mechanic",
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
    kind: "mechanic",
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
    kind: "mechanic",
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
    kind: "mechanic",
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
    kind: "mechanic",
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
    kind: "mechanic",
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

// ── Frameworks clásicos de copywriting ───────────────────────────────────
// Estructuras de respuesta directa con décadas de uso. Misma ficha que una
// mecánica: el hook cumple el primer rol del framework, los beats son los
// roles intermedios y el cierre es el CTA (la etapa de awareness decide su
// tono). "No inventes datos" va en las reglas de todos: un framework pide
// pruebas y cifras, y la IA no debe fabricarlas.
export type FrameworkKey = "hook_body_cta" | "pas" | "aida" | "bab" | "hso" | "four_ps" | "testimonial"

export const FRAMEWORKS: Record<FrameworkKey, Mechanic> = {
  hook_body_cta: {
    kind: "framework",
    label: "Hook – Cuerpo – CTA",
    desc: "La estructura base de cualquier anuncio de video: un hook que detiene el scroll, un cuerpo que entrega UNA promesa con su prueba y un CTA claro.",
    why: "Es simple, flexible y difícil de arruinar. Su fuerza es la claridad: una promesa, una prueba, una acción. Funciona cuando el mensaje es directo y no necesitas una historia.",
    stages: [2, 3, 4, 5],
    hookShape: "Una sola promesa o dolor, en la voz del cliente y en una frase. Sin presentar la marca ni el producto todavía.",
    beats: [
      { name: "La promesa", mode: "spoken", guide: "Lo que el producto hace por esta persona, en UNA idea y con un detalle concreto. Sin lista de características." },
      { name: "La prueba", mode: "spoken", guide: "Por qué creerlo: demostración, resultado, testimonio o dato real. Muestra, no afirmes." },
    ],
    close: "cta", closeGuide: "Un solo CTA con el siguiente paso concreto (qué hacer y dónde), con el tono de la etapa de awareness.",
    rules: ["Una sola idea por video.", "El cuerpo cumple el hook, no lo repite.", "La prueba va antes del CTA, nunca después.", "No inventes cifras, resultados ni testimonios: usa solo lo que trae el contexto; si falta un dato, deja un marcador [así] para completarlo con el real."],
    example: "Plataforma de facturación: \"Si facturas desde Excel, estás perdiendo horas cada mes\" → \"Aquí las facturas se generan solas desde tus ventas\" → se ve el panel emitiendo 20 facturas a la vez → \"Pruébalo gratis hoy\".",
  },
  pas: {
    kind: "framework",
    label: "PAS — Problema, Agitar, Solución",
    desc: "Nombra el problema, agrávalo haciendo sentir su costo real y presenta el producto como el alivio.",
    why: "Se apoya en la aversión a la pérdida: duele más lo que se pierde que lo que se gana. Agitar hace que resolver el problema se sienta urgente y no opcional.",
    stages: [1, 2, 3],
    hookShape: "El Problema: nómbralo como lo diría el cliente, concreto y reconocible. Sin solución todavía.",
    beats: [
      { name: "Agitar", mode: "spoken", guide: "Intensifica la consecuencia de no resolverlo: qué le cuesta seguir así (tiempo, dinero, ánimo, oportunidades). Específico y emocional, sin dramatizar de más." },
      { name: "Solución", mode: "spoken", guide: "El producto como alivio concreto a ESE problema: cómo lo resuelve, en una o dos frases." },
    ],
    close: "cta", closeGuide: "CTA de alivio, según la etapa: da el paso para dejar de vivir con el problema.",
    rules: ["Agita con consecuencias reales de la persona, no con miedo genérico.", "No entres a la solución hasta haber agitado.", "Si suena a drama exagerado, pierde credibilidad: baja el tono.", "No inventes cifras ni resultados: usa solo lo que trae el contexto; si falta un dato, deja un marcador [así]."],
    example: "Software de cobranza: \"Cada mes te quedas hasta tarde persiguiendo pagos\" → \"y mientras tanto el cliente que no paga ya se gastó tu dinero\" → \"Aquí los recordatorios salen solos y te avisan cuando pagan\" → CTA.",
  },
  aida: {
    kind: "framework",
    label: "AIDA — Atención, Interés, Deseo, Acción",
    desc: "Captura la atención, despierta interés con algo que no sabían, construye deseo con el beneficio emocional y cierra con una acción.",
    why: "Sigue el orden natural en que una persona pasa de ignorar a querer: cada etapa prepara la siguiente. Es uno de los modelos de persuasión publicitaria más antiguos y usados.",
    stages: [2, 3, 4],
    hookShape: "Atención: un golpe de curiosidad, identidad o contraste que detiene el scroll. No explica; abre la pregunta.",
    beats: [
      { name: "Interés", mode: "spoken", guide: "Un dato, ángulo o 'por qué' que no sabían y los mantiene viendo. Hechos concretos, no adjetivos." },
      { name: "Deseo", mode: "spoken", guide: "Convierte el interés en ganas: el beneficio emocional, cómo se vería su vida con esto, o prueba de que otros ya lo tienen." },
    ],
    close: "cta", closeGuide: "Acción: una instrucción única y concreta (qué hacer, dónde, cuándo).",
    rules: ["No saltes etapas: sin interés, el deseo no pega.", "Interés = información nueva; Deseo = emoción.", "No inventes datos ni resultados: usa solo lo que trae el contexto; si falta uno, deja un marcador [así]."],
    example: "Café de especialidad: \"Casi todo el café del súper se tostó hace meses\" → \"Pierde su aroma a las pocas semanas; por eso sabe a nada\" → \"Imagina abrir la bolsa y que huela a recién tostado\" → \"Pide la tuya, se tuesta el día que la ordenas\".",
  },
  bab: {
    kind: "framework",
    label: "BAB — Antes, Después, Puente",
    desc: "Muestra el 'antes' (dónde está hoy), pinta el 'después' que desea y presenta el producto como el puente.",
    why: "Hace visualizar el resultado antes de hablar del producto. El contraste entre antes y después crea una tensión que el puente resuelve.",
    stages: [2, 3],
    hookShape: "El 'Antes': el estado actual de la persona, tan específico que se reconozca al instante.",
    beats: [
      { name: "Después", mode: "spoken", guide: "El futuro deseado, vívido y específico: cómo se ve y se siente su día cuando ya lo logró." },
      { name: "Puente", mode: "spoken", guide: "El producto como el camino de un estado al otro: qué hace y por qué funciona, sin lista de características." },
    ],
    close: "cta", closeGuide: "CTA para cruzar el puente: el primer paso concreto hacia ese 'después'.",
    rules: ["El 'después' es una escena concreta, no un beneficio abstracto.", "El producto no aparece hasta el puente.", "No inventes cifras ni resultados: usa solo lo que trae el contexto; si falta un dato, deja un marcador [así]."],
    example: "App de finanzas personales: \"Llegas a fin de mes sin saber a dónde se fue tu quincena\" → \"Imagina abrir tu app y ver exactamente cuánto te sobra y para qué\" → \"Eso es lo que hace tu dinero aquí: se ordena solo\" → CTA.",
  },
  hso: {
    kind: "framework",
    label: "HSO — Hook, Historia, Oferta",
    desc: "Un hook que promete, una historia corta con conflicto y descubrimiento que genera confianza y una oferta concreta como desenlace.",
    why: "Las historias bajan las defensas: la persona se identifica en vez de evaluar un claim, y la oferta llega como el siguiente paso natural del relato.",
    stages: [1, 2, 3],
    hookShape: "Abre el bucle: un gancho que promete una historia (\"Esto me pasó cuando…\", \"Hace seis meses yo estaba…\"). Sin resolverla.",
    beats: [
      { name: "El conflicto", mode: "spoken", guide: "Qué pasaba, qué intentó y por qué no funcionaba. Un momento concreto y humano (lugar, emoción, situación)." },
      { name: "El descubrimiento", mode: "spoken", guide: "El giro: qué encontró o entendió y cómo cambió el resultado. El producto aparece como parte natural de la historia, no como anuncio." },
    ],
    close: "cta", closeGuide: "La oferta: qué obtiene, bajo qué condiciones (precio, garantía) y el CTA, como el siguiente paso lógico de la historia.",
    rules: ["La historia es de UNA persona, en primera persona.", "El producto aparece después del conflicto, nunca antes.", "La oferta es concreta y va al final.", "No inventes anécdotas con cifras, nombres ni resultados que no estén en el contexto: usa un marcador [así] para que quien graba ponga la historia real."],
    example: "Servicio de contabilidad: \"Casi cierro mi negocio por un error en mis impuestos\" → el momento del susto con el SAT → \"Hasta que alguien me mostró cómo llevarlo al día\" → \"Hoy te lo ofrecemos así: [oferta] — empieza hoy\".",
  },
  four_ps: {
    kind: "framework",
    label: "4 P — Promesa, Imagen, Prueba, Empujón",
    desc: "Una promesa clara, una imagen del resultado, la prueba que la respalda y el empujón para actuar ahora.",
    why: "Cada P responde una duda que frena la compra: ¿qué gano?, ¿cómo se vería?, ¿por qué creerte?, ¿por qué ahora? Si falla una, la venta se cae ahí.",
    stages: [3, 4, 5],
    hookShape: "La Promesa: el beneficio principal, concreto y creíble, en una sola frase.",
    beats: [
      { name: "Imagen", mode: "spoken", guide: "Hazle ver el resultado: una escena específica de su vida con el beneficio ya logrado." },
      { name: "Prueba", mode: "spoken", guide: "Evidencia que respalda la promesa: resultado medible, testimonio, demostración o garantía." },
    ],
    close: "cta", closeGuide: "El Empujón: la razón real para actuar AHORA (oferta, cupo limitado verdadero, costo de esperar) + CTA.",
    rules: ["La urgencia debe ser real: no inventes escasez ni fechas límite.", "La prueba respalda exactamente la promesa del hook.", "No inventes cifras ni testimonios: usa solo lo que trae el contexto; si falta un dato, deja un marcador [así]."],
    example: "Curso de inglés online: \"Habla inglés en una junta en 90 días\" → \"Imagina presentar tu proyecto sin traducir en tu cabeza\" → \"[resultado real de alumnos / garantía]\" → \"El cupo de este grupo cierra el [fecha]\".",
  },
  testimonial: {
    kind: "framework",
    label: "Testimonio / Arco de historia",
    desc: "Alguien como el espectador cuenta lo que probó antes, cómo descubrió la solución y qué cambió.",
    why: "La identificación con alguien parecido es más creíble que cualquier claim de marca; es el formato natural del UGC.",
    stages: [2, 3, 4],
    hookShape: "Identificación inmediata, en primera persona (\"Yo también…\", \"Si tú también…\").",
    beats: [
      { name: "Lo que probé antes", mode: "spoken", guide: "Los intentos fallidos y la frustración: qué hizo y por qué no funcionó. Específico y honesto." },
      { name: "El descubrimiento", mode: "spoken", guide: "Cómo encontró el producto y qué fue distinto esta vez." },
      { name: "El resultado", mode: "spoken", guide: "Qué cambió, con un detalle concreto (tiempo, momento, sensación) y en sus propias palabras." },
    ],
    close: "cta", closeGuide: "CTA en la voz de la persona: qué le recomienda hacer a alguien como ella.",
    rules: ["Primera persona y tono de conversación, no de comercial.", "El resultado trae un detalle concreto; evita \"me cambió la vida\".", "Es un guion para grabar con un cliente o creador real: NO inventes cifras, resultados ni identidades; usa un marcador [así] donde vaya el dato real de esa persona."],
    example: "\"Yo también pensé que mi piel ya no tenía arreglo\" → probó cuatro cosas distintas → \"Hasta que una amiga me dio este sérum\" → \"A las [tiempo real] ya se notaba diferente\" → \"Si te pasa lo mismo, pruébalo\".",
  },
}
export const FRAMEWORK_KEYS = Object.keys(FRAMEWORKS) as FrameworkKey[]

// ── Registro unificado ────────────────────────────────────────────────────
// Todo el constructor (hooks, beats, cierres, presupuesto, revisión) trabaja
// con un MethodKey: no distingue entre mecánica y framework.
export type MethodKey = MechanicKey | FrameworkKey
export const METHODS: Record<MethodKey, Mechanic> = { ...MECHANICS, ...FRAMEWORKS }
export const MECHANIC_KEYS = Object.keys(MECHANICS) as MechanicKey[]
export const METHOD_KEYS = Object.keys(METHODS) as MethodKey[]

// Texto completo de un método (mecánica o framework) para los prompts.
export function methodBrief(k: MethodKey): string {
  const m = METHODS[k]
  return `${m.kind === "framework" ? "FRAMEWORK CLÁSICO" : "MECÁNICA"}: ${m.label} — ${m.desc}
Por qué funciona: ${m.why}
Cómo abre el hook: ${m.hookShape}
Cuerpo: ${m.beats.map((b, i) => `${i + 1}. ${b.name} [${b.mode === "spoken" ? "hablado" : b.mode === "visual" ? "SOLO VISUAL, sin voz" : "CHAT/mensajes"}] — ${b.guide}`).join(" ")}
Cierre: ${m.close === "cta" ? "con CTA" : "NATURAL, sin CTA hablado"} — ${m.closeGuide}
Reglas: ${m.rules.join(" ")}
Ejemplo: ${m.example}`
}

// Línea de estructura para mostrarla en pantalla: Hook → … → CTA. Los beats
// que no son hablados lo dicen (solo visual, chat).
export function methodFlow(k: MethodKey): string {
  const m = METHODS[k]
  return ["Hook", ...m.beats.map((b) => (b.mode === "spoken" ? b.name : `${b.name} (${MODE_LABEL[b.mode]})`)), m.close === "cta" ? "CTA" : "Cierre natural, sin CTA hablado"].join(" → ")
}

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
export const spokenBeats = (k: MethodKey) => METHODS[k].beats.filter((b) => b.mode !== "visual").length

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
  const KIND_TXT = { paralelismo: "paralelismo negativo", antitesis: "antítesis simétrica", frase_suelta: "frases cortas sueltas" } as const
  const tic = (where: string, t: string, skipShort = false) => {
    for (const x of findWritingTics(t, { skipShort })) out.push({ level: "warn", text: `${where} tiene ${KIND_TXT[x.kind]}: «${x.excerpt.slice(0, 80)}».`, fix: "Afirma directo lo que sí es o pasa, con oraciones completas y ritmo natural al hablar." })
  }
  for (const [i, h] of input.hooks.entries()) { tic(`Hook ${i + 1}`, h.spoken); tic(`Hook ${i + 1} (texto en pantalla)`, h.overlay ?? "", true) }
  for (const [i, b] of input.body.entries()) tic(`Cuerpo ${i + 1}`, b.spoken)
  if (input.close) tic("El cierre", input.close.spoken)
  if (!input.close) out.push({ level: "warn", text: "Falta el cierre.", fix: "Elige o escribe un cierre." })
  return out
}
