# Hub de Cotizaciones — Guía para agentes

**Ruta:** `/cotizaciones` (solo rol admin; link "Cotizaciones" en el sidebar)
**Actualizado:** 2026-10-28

## Qué es
Leads que requieren propuesta. Cada lead tiene contexto para cotizar, tipo de
propuesta, precio, estado y los links al PDF/Slides generados.

## Cómo entran los leads (tabla `quote_leads`, migración 119)
- **GHL:** un workflow de GHL ("la oportunidad entra a *Proposal Pending*" del
  pipeline *aM Lead Pipeline*) hace POST a `/api/quotes/ghl?secret=…`.
  `mapGhlPayload` (`lib/quotes/core.ts`) busca por nombre flexible: contacto,
  negocio, Giro, "¿Qué tipo de sitio web buscas?", problema, redes, inversión,
  tamaño, Oferta, **AI Qualification Summary**, respuestas del formulario. La
  misma `opportunity_id` actualiza el lead existente (no duplica).
- **Manual:** botón "Nuevo lead".
- **Atajo del iPhone:** sigue llamando a Make directo; cuando Make termina y
  llama a `/api/quotes/make-callback` **sin** `lead_id`, se crea un lead
  "Atajo" con su PDF.

## Generar propuesta
`generateQuoteProposal` hace POST al webhook de Make "Cotizador — Intake"
(`MAKE_QUOTE_WEBHOOK_URL`, header `x-make-apikey` = `MAKE_QUOTE_WEBHOOK_APIKEY`)
con `texto` (contexto armado + tipo + precio a usar exactamente), una imagen
vacía (el escenario siempre manda una a OpenAI) y `lead_id`. Estado →
"generando". Make debe llamar al terminar a
`/api/quotes/make-callback?secret=…` con `{lead_id, business_name,
development_type, price, pdf_url, slides_url}` (o `error`) → estado
"generada" con links. También se pueden pegar los links a mano.

Plantillas con Slides hoy: **Web · Informativo** ($27,000 default) y **Web ·
eCommerce** ($37,000). Otras ofertas = "otra:<nombre>", sin plantilla: se
cotizan a mano hasta que exista su plantilla.

## Interfaz (2026-10-28)
Ancho completo. Arriba 5 números (`quoteKpis`): abiertas, por cotizar,
cotizado este mes, enviadas sin respuesta 7+ días, cierre 30 días. Tablero por
etapa (`STAGES`: Por cotizar = nuevo+lista, Generando = generando+error,
Propuesta lista, Enviada, Cerradas con zonas "Ganada"/"Perdida") — se arrastra
para cambiar de etapa — o vista Lista. El detalle abre en un panel lateral de
560 px (pantalla completa en celular): contacto con tel/WhatsApp/correo,
etapa, bloque de propuesta (tipo, precio, generar, PDF/Slides), contexto en
solo lectura con "Editar", notas (se guardan al salir) e historial.
⚠ "seguimiento" en enviadas de 7+ días; "falta info" sin tipo o precio.

## Estados
nuevo → lista → generando → generada → enviada → ganada / perdida (+ error).
`sent_at` / `closed_at` (migración 120) se fijan al mover de etapa.

## MCP (`lib/mcp/quote-tools.ts`, solo admin)
`cotizaciones` (por etapa + números), `detalle_cotizacion`,
`nueva_cotizacion`, `editar_cotizacion` (contexto, tipo/precio, etapa, links
pdf/slides), `generar_propuesta` (dispara Make; vista previa del contexto).
Para ofertas sin plantilla, Claude arma la presentación en la conversación y
guarda su link con `editar_cotizacion`. Lógica compartida en
`lib/quotes/server.ts`.
No se sincroniza de regreso a GHL (decisión del dueño, por ahora).

## Variables de entorno
`QUOTES_WEBHOOK_SECRET`, `MAKE_QUOTE_WEBHOOK_URL`, `MAKE_QUOTE_WEBHOOK_APIKEY`.
