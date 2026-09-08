# El webhook de Telegram no verifica el secret token

**Estado:** idea
**Área:** Telegram / Seguridad
**Agregado:** 2026-09-08

## Contexto
Detectado durante la auditoría del sistema de Telegram: `app/api/telegram-webhook/route.ts`
no valida el header `X-Telegram-Bot-Api-Secret-Token` de Telegram. El único filtro es la
lista blanca de `chat_id` (`TELEGRAM_ALLOWED_CHAT_ID`) — si el mensaje no viene de ese chat
se ignora, pero cualquiera que descubra la URL del webhook puede mandarle un POST arbitrario
y el endpoint lo procesa hasta ese punto (solo se descarta después, por chat_id).

## Qué implicaría
Configurar un `secret_token` al registrar el webhook con la API de Telegram
(`setWebhook`), y validar el header `X-Telegram-Bot-Api-Secret-Token` contra ese secreto
al inicio del handler, antes de parsear/procesar nada — mismo espíritu que la verificación
que ya se hizo para el webhook de Vowen.

## Por qué no ahora
Es un hueco de seguridad real pero de riesgo bajo en la práctica (el filtro por chat_id
ya evita que un mensaje ajeno dispare una acción), y no se ha priorizado sobre el resto
del trabajo. Vale la pena cerrarlo en algún momento, no es urgente.
