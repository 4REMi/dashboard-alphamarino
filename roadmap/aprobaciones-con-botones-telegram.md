# Aprobaciones con botones inline en Telegram

**Estado:** idea
**Área:** Telegram
**Agregado:** 2026-09-08

## Contexto
Cuando un asset creativo queda pendiente de aprobación del cliente, o termina una
clonación de imagen, sería útil recibir un mensaje en Telegram con botones tipo
"Aprobar" / "Rechazar" en vez de tener que entrar al dashboard.

## Qué implicaría
El webhook de Telegram (`app/api/telegram-webhook/route.ts`) hoy solo procesa updates
tipo `message` — no maneja `callback_query` (los taps de un botón inline) en absoluto.
Haría falta:
- Mandar mensajes con `reply_markup.inline_keyboard` (Bot API `sendMessage`).
- Manejar el update `callback_query` en el webhook.
- Responder con `answerCallbackQuery` para que el botón deje de "cargar" en Telegram.

Es la pieza de trabajo más grande de las ideas relacionadas con Telegram — no reusa
el pipeline de clasificación existente, es un flujo de interacción distinto.

## Por qué no ahora
Identificada como la más ambiciosa del grupo de ideas de Telegram; no se ha mapeado
el diseño ni se ha priorizado sobre las demás.
