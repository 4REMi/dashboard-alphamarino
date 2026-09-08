# Alertas proactivas del dashboard hacia Telegram

**Estado:** idea
**Área:** Telegram
**Agregado:** 2026-09-08

## Contexto
Todo lo que existe hoy en Telegram/Vowen es "pull" en el sentido de que tú disparas el
mensaje o la nota de voz. La idea complementaria es que el dashboard mismo, sin que nadie
lo dispare, te mande avisos por Telegram cuando pasa algo que amerita atención.

Ejemplos:
- Aviso diario/semanal de dominios por vencer pronto.
- Aviso de tareas vencidas o sin asignar.
- Resumen de assets con "cambios solicitados" por el cliente que llevan tiempo sin atenderse.

## Qué implicaría
Un cron (Vercel Cron o similar) que corra periódicamente, consulte la base, arme un
resumen, y llame a `sendMessage()` (ya existe en `lib/telegram-bot/telegram.ts`) hacia
`TELEGRAM_ALLOWED_CHAT_ID`. No requiere ningún webhook nuevo — es la dirección inversa
de lo que ya existe.

## Por qué no ahora
Mencionada como complemento natural de la automatización por voz/Telegram, pero no se
ha priorizado ni mapeado qué alertas exactas valen la pena ni con qué frecuencia.
