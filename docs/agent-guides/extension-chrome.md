# Extensión de Chrome/Firefox — Guardar anuncios en boards — Guía para agentes

**Ruta:** extensión de navegador (`extension/` en la raíz del repo) → rutas `/api/extension/*` → boards de `/ad-lab/boards`
**Para quién:** quien tenga el permiso `access_ad_lab` (admin y subadmin por defecto; empleados solo si se les activa)
**Actualizado:** 2026-11-26

## Qué es y para qué sirve

Una extensión de navegador para Chrome y Firefox (Manifest V3, sin publicar en
ninguna tienda) que
manda anuncios a un board de Ad Lab sin salir de Meta. Cubre dos lugares:

- **Ads Manager**: anuncios propios o de clientes que se están corriendo. Es la
  razón principal de la extensión: bajar el video/imagen original de lo que se
  está sirviendo, para usarlo como referencia, análisis o clon.
- **Biblioteca de anuncios** (Ad Library): anuncios de cualquier marca, como la
  extensión de ForePlay.

## Conceptos y vocabulario clave

- **Board**: el mismo `ad_boards` de `/ad-lab/boards`. La extensión lista,
  crea y agrega a boards; no los edita ni los borra.
- **Board activo**: el último board elegido; aparece primero en el selector.
  Se guarda solo en el navegador (`chrome.storage.local`).
- **Ads Manager → con la sesión de quien la usa, no capturando la página**: Ads
  Manager reproduce los videos por streaming (`blob:`), así que no hay un MP4
  que tomar de la página. En cambio:
  1. `content/token-main.js` (corre en el mundo de la página) lee el token de
     acceso de la sesión del Ads Manager (`window.__accessToken`); si no está, se
     busca en los `<script>` de la página (`ads-manager.js → getAccessToken`).
  2. El service worker (`background.js → resolveAdWithSession`) pide a la Graph
     API el anuncio, el creativo y el MP4 original (`/{video_id}?fields=source`,
     con respaldo en `/act_X/advideos`) **con ese token**. Así funciona con
     cualquier cuenta que la persona vea en su Ads Manager — auditorías de
     prospectos incluidas — sin tocar el Business Manager.
  3. Al dashboard solo le llegan las URLs (en `ads`); **el token nunca sale del
     navegador**.
  4. Respaldo: si no hubo token o la sesión no trajo el video, el dashboard
     intenta con `META_SYSTEM_USER_TOKEN` (`getMetaAdById`), que solo ve cuentas
     asignadas a su usuario de sistema. Cada resultado dice `via: "session" |
     "system_user"` y el aviso muestra «(con tu sesión)» / «(con el usuario de
     sistema)».
  Leer el token de la página no es un método oficial de Meta: si cambian dónde lo
  guardan, se ajusta `token-main.js` / `tokenFromScripts`; mientras tanto todo
  cae al usuario de sistema.
- **Ad Library → desde la página**: ahí el video sí es un `<video src>` normal;
  la extensión manda la URL y el servidor la copia a Storage.
- **Filas que crea en `saved_ads`**:
  - Ads Manager: `ad_archive_id = "ads_manager_<adId>"`, `source = "ads_manager"`,
    `page_name = "<cuenta> · <nombre del anuncio>"`, campaña e ID en `notes`.
  - Ad Library: `ad_archive_id = <ID de la biblioteca>` (el mismo que usa
    Discovery/Apify), `source = "extension"`.
  - Si el anuncio ya estaba guardado, NO se duplica ni se sobreescribe: solo se
    agrega al board (y se copia la media si faltaba).

## Cómo hacer las acciones comunes

**Chrome y Firefox, una sola fuente:** `extension/` es el código (manifest de
Chrome). `pnpm ext:build` (`scripts/build-extension.mjs`) genera
`dist-extension/chrome` y `dist-extension/firefox`; la de Firefox solo cambia el
manifest (`background.scripts` en vez de `service_worker`, ID
`guardar-anuncios@alphamarino.dashboard`, mínimo Firefox 128 por
`world: "MAIN"`). El JS es el mismo (Firefox entiende `chrome.*`). En Firefox
los permisos de sitios pueden quedar sin conceder: el popup lo detecta y muestra
«Dar permisos». Sin firma de Mozilla, en Firefox solo se instala como
complemento temporal (se borra al cerrar el navegador).

**Instalar (una vez por computadora):** ver `extension/README.md`. En resumen:
`chrome://extensions` → Modo desarrollador → «Cargar descomprimida» → carpeta
`extension/`. Luego, desde el ícono: URL del dashboard + API key personal
(perfil → tarjeta «API keys de IA (MCP)») → «Guardar y probar». Chrome pide
permiso sobre el dominio del dashboard: hay que aceptarlo.

**Desde Ads Manager:** con la cuenta abierta en esa pestaña, ir a «Anuncios» → marcar las casillas de los anuncios
(o abrir uno para editarlo) → aparece abajo a la derecha «Enviar N anuncios a un
board» → elegir o crear el board. También desde el popup («Enviar N al board»)
o pegando IDs en «Enviar por ID de anuncio» (con la pestaña del Ads Manager activa
para que use tu sesión; desde otra pestaña solo funciona el usuario de sistema).

**Desde la Ad Library:** cada tarjeta tiene un botón «Guardar» arriba a la
derecha → elegir o crear el board.

## Reglas y restricciones

- **Máximo 25 anuncios por envío** (cada uno descarga un video completo; la ruta
  tiene `maxDuration = 300`).
- **El usuario de sistema solo ve cuentas asignadas en el Business Manager de la
  agencia**; por eso el camino principal es la sesión del usuario (arriba). Si ni
  la sesión ni el usuario de sistema pueden leer el anuncio, el error junta ambos
  textos de Meta. Causas típicas: el ID es de una campaña/conjunto, o la pestaña
  del Ads Manager no está abierta (sin sesión no hay token). Primera prueba real
  (2026-11-26): con solo el usuario de sistema falló en una cuenta de prospecto;
  así nació el camino por sesión.
- **Videos > 250 MB** no se copian a Storage; queda el enlace de Meta, que
  caduca, y se avisa con ⚠.
- **La Ad Library se detecta por texto** («ID de la biblioteca» / «Library ID»),
  no por clases CSS (las de Facebook están ofuscadas y cambian). Si Meta cambia
  ese texto, se ajusta `ID_RE` en `extension/content/ad-library.js`.
- **Ads Manager depende de `selected_ad_ids` en la URL.** Si Meta deja de
  ponerlo ahí, el botón flotante no aparece; queda el envío por ID manual.
- **La Ad Library solo descarga del CDN de Meta** (`*.fbcdn.net`,
  `*.cdninstagram.com`, `facebook.com`, solo https). Cualquier otra URL se
  ignora para que la ruta no sirva para que el servidor descargue cualquier cosa (SSRF).
- Carruseles: v1 guarda solo la primera imagen/video.

## Quién puede ver/hacer qué

La API key identifica a la persona; las rutas exigen `access_ad_lab`
(`can(profile, "access_ad_lab")`). Sin ese permiso responde 403 aunque la key
sea válida. Lo guardado queda con `created_by`/`added_by` de esa persona.

## Dónde vive esto en el código

- `scripts/build-extension.mjs` — genera las versiones Chrome/Firefox.
- `extension/` — la extensión (manifest; `background.js` hace todas las
  llamadas al dashboard y a la Graph API con la sesión; `content/` scripts por
  sitio, `token-main.js` en el mundo de la página; `popup/`).
- `app/api/extension/{me,boards,save}/route.ts` — rutas (Bearer token).
- `lib/ad-lab/extension.ts` — auth (`withExtensionAuth`, reusa
  `verifyMcpToken` + contexto de confianza), boards y guardado. Sin
  `"use server"` a propósito.
- `lib/ad-lab/storage-mirror.ts` — copia de media a Storage (compartido con
  `lib/actions/ad-lab.ts`).
