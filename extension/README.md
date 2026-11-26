# Extensión de Chrome y Firefox — Guardar anuncios en Ad Lab

Manda anuncios del **Ads Manager** y de la **Biblioteca de anuncios** de Meta a
un board de Ad Lab. Detalle de cómo funciona: `docs/agent-guides/extension-chrome.md`.

## Generar los paquetes

Esta carpeta es la fuente única (su `manifest.json` es el de Chrome). Para
sacar la versión de cada navegador:

```bash
pnpm ext:build
```

Deja `dist-extension/chrome` y `dist-extension/firefox`.

## Instalar en Chrome (sin Chrome Web Store)

1. Usa `dist-extension/chrome` (o esta carpeta `extension/`, que es igual).
2. Abre `chrome://extensions` y activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** → elige esa carpeta.
4. Fija la extensión en la barra (ícono de pieza de rompecabezas → 📌).
5. Abre su ícono → **Conexión con el dashboard**:
   - URL del dashboard (la misma con la que entras, ej. `https://…`).
   - API key personal: en el dashboard, tu perfil → tarjeta **API keys de IA (MCP)** → generar.
   - **Guardar y probar** → acepta el permiso que pide Chrome para ese dominio.
   Arriba debe aparecer tu nombre en verde.

Necesitas el permiso de Ad Lab en el dashboard.

## Instalar en Firefox (128 o más nuevo)

Firefox solo deja instalar de forma permanente extensiones **firmadas por
Mozilla**. Mientras no se firme:

1. Abre `about:debugging#/runtime/this-firefox`.
2. **Cargar complemento temporal…** → elige el `.zip` de Firefox (o el
   `manifest.json` dentro de `dist-extension/firefox`).
3. Configúrala igual que en Chrome. Si el popup muestra **Permisos → Dar
   permisos**, acéptalo (Firefox no los concede al instalar) y recarga las
   pestañas de Facebook.

⚠ Una extensión temporal **se borra al cerrar Firefox**; hay que volver a
cargarla cada vez. Para que quede instalada: firmarla en addons.mozilla.org como
**no listada** (no aparece en la tienda; la revisión automática tarda minutos)
y distribuir el `.xpi` que regresa. ID fijo de la extensión en Firefox:
`guardar-anuncios@alphamarino.dashboard` (en `scripts/build-extension.mjs`) —
no cambiarlo, o Firefox la trata como otra extensión.

## Usar

- **Ads Manager**: marca anuncios en la pestaña «Anuncios» → botón abajo a la
  derecha «Enviar N anuncios a un board». La extensión baja el video original
  con tu propia sesión de Facebook, así que funciona con cualquier cuenta que
  tú veas (también auditorías de prospectos). Tu sesión no se comparte con el
  dashboard: solo se le manda el archivo.
- **Ad Library**: botón «Guardar» en cada anuncio.

## Actualizar

Después de un `git pull`: `pnpm ext:build`; en Chrome pulsa ↻ en la tarjeta de
la extensión (`chrome://extensions`), en Firefox vuelve a cargarla; y recarga
las pestañas de Facebook.
