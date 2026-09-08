# Consultas de lectura por voz/Telegram (no solo registrar, también preguntar)

**Estado:** idea
**Área:** Telegram/Vowen
**Agregado:** 2026-09-08

## Contexto
El pipeline del bot (`lib/telegram-bot/`) hoy solo **escribe** — clasifica un mensaje/nota
y registra ingresos, gastos, dominios, tareas, notas de bitácora o clientes nuevos. No
existe ninguna forma de **preguntarle** algo y que responda con un dato real del dashboard.

Ejemplos de lo que se pidió explorar:
- "¿Cuánto llevo de ingresos este mes?"
- "¿Qué proyectos están atrasados?"
- "¿Cuándo vence el dominio de X?"

## Qué implicaría
Un nuevo `tipo` en el clasificador (`consulta`), con un campo que describa qué se está
preguntando, y un handler nuevo que en vez de insertar en Supabase, hace un `select`
y arma una respuesta en texto. Requeriría pensar bien el scope de qué preguntas soporta
al inicio (evitar que el clasificador intente interpretar cualquier pregunta libre).

## Por qué no ahora
Se identificó como la pieza que le falta al patrón actual (todo es push, nada es pull),
pero no se ha mapeado el diseño concreto — qué preguntas exactas soportar primero, cómo
se ve la respuesta, si conviene limitarlo a un set fijo de consultas o dejarlo abierto.
