# Extensión de Chrome — Guardar anuncios en Ad Lab

Manda anuncios del **Ads Manager** y de la **Biblioteca de anuncios** de Meta a
un board de Ad Lab. Detalle de cómo funciona: `docs/agent-guides/extension-chrome.md`.

## Instalar (sin Chrome Web Store)

1. Descarga esta carpeta `extension/` (o el repo completo).
2. Abre `chrome://extensions` y activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** → elige la carpeta `extension/`.
4. Fija la extensión en la barra (ícono de pieza de rompecabezas → 📌).
5. Abre su ícono → **Conexión con el dashboard**:
   - URL del dashboard (la misma con la que entras, ej. `https://…`).
   - API key personal: en el dashboard, tu perfil → tarjeta **API keys de IA (MCP)** → generar.
   - **Guardar y probar** → acepta el permiso que pide Chrome para ese dominio.
   Arriba debe aparecer tu nombre en verde.

Necesitas el permiso de Ad Lab en el dashboard.

## Usar

- **Ads Manager**: marca anuncios en la pestaña «Anuncios» → botón abajo a la
  derecha «Enviar N anuncios a un board». La extensión baja el video original
  con tu propia sesión de Facebook, así que funciona con cualquier cuenta que
  tú veas (también auditorías de prospectos). Tu sesión no se comparte con el
  dashboard: solo se le manda el archivo.
- **Ad Library**: botón «Guardar» en cada anuncio.

## Actualizar

Después de un `git pull`, en `chrome://extensions` pulsa ↻ en la tarjeta de la
extensión y recarga las pestañas de Facebook.
