# El webhook de Telegram no verifica el secret token

**Estado:** pausado — código listo, falta que el usuario registre el secreto con Telegram
**Área:** Telegram / Seguridad
**Agregado:** 2026-09-08

## Contexto
Detectado durante la auditoría del sistema de Telegram: `app/api/telegram-webhook/route.ts`
no validaba el header `X-Telegram-Bot-Api-Secret-Token` de Telegram. El único filtro era la
lista blanca de `chat_id` (`TELEGRAM_ALLOWED_CHAT_ID`) — si el mensaje no venía de ese chat
se ignoraba, pero cualquiera que descubriera la URL del webhook podía mandarle un POST
arbitrario y el endpoint lo procesaba hasta ese punto (solo se descartaba después, por chat_id).

## Qué se hizo
`app/api/telegram-webhook/route.ts` ya valida el header
`X-Telegram-Bot-Api-Secret-Token` contra una nueva variable de entorno
`TELEGRAM_WEBHOOK_SECRET`, **solo si esa variable está configurada** — así no se rompe
el bot mientras el webhook siga registrado en Telegram sin el secreto.

## Lo que falta (le toca al usuario, no requiere código)
1. Generar un secreto (ej. `openssl rand -hex 32`).
2. Ponerlo en Vercel como `TELEGRAM_WEBHOOK_SECRET`.
3. Volver a registrar el webhook con Telegram incluyendo ese secreto:
   ```
   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://dashboard-alphamarino.vercel.app/api/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```
   (pegar en el navegador o correr con `curl`, con los valores reales).

Hasta que no se haga el paso 3, la verificación queda inactiva (por diseño) y el bot
sigue funcionando igual que antes.
