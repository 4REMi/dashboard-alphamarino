# Extensión de Chrome — Guardar anuncios en boards — Guía para agentes

**Ruta:** extensión de navegador (`extension/` en la raíz del repo) → rutas `/api/extension/*` → boards de `/ad-lab/boards`
**Para quién:** quien tenga el permiso `access_ad_lab` (admin y subadmin por defecto; empleados solo si se les activa)
**Actualizado:** 2026-11-26

## Qué es y para qué sirve

Una extensión de Chrome (Manifest V3, sin publicar en la Chrome Web Store) que
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
- **Ads Manager → por ID, no por página**: Ads Manager reproduce los videos por
  streaming (`blob:`), así que no hay un MP4 que tomar de la página. La
  extensión solo lee los IDs (`selected_ad_ids` de la URL) y el servidor
  descarga el original con la Graph API usando `META_SYSTEM_USER_TOKEN`
  (`getMetaAdById`, el mismo que usa la importación de creativos de Meta).
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

**Instalar (una vez por computadora):** ver `extension/README.md`. En resumen:
`chrome://extensions` → Modo desarrollador → «Cargar descomprimida» → carpeta
`extension/`. Luego, desde el ícono: URL del dashboard + API key personal
(perfil → tarjeta «API keys de IA (MCP)») → «Guardar y probar». Chrome pide
permiso sobre el dominio del dashboard: hay que aceptarlo.

**Desde Ads Manager:** pestaña «Anuncios» → marcar las casillas de los anuncios
(o abrir uno para editarlo) → aparece abajo a la derecha «Enviar N anuncios a un
board» → elegir o crear el board. También desde el popup («Enviar N al board»)
o pegando IDs en «Enviar por ID de anuncio».

**Desde la Ad Library:** cada tarjeta tiene un botón «Guardar» arriba a la
derecha → elegir o crear el board.

## Reglas y restricciones

- **Máximo 25 anuncios por envío** (cada uno descarga un video completo; la ruta
  tiene `maxDuration = 300`).
- **Ads Manager solo funciona con cuentas asignadas al usuario de sistema de
  Meta del dashboard** (no basta con que la persona vea la cuenta en su Ads
  Manager — pasa con clientes cuya cuenta vive en su propio Business Manager).
  Meta responde el MISMO error («does not exist, cannot be loaded due to missing
  permissions») si falta esa asignación o si el ID no es de un anuncio (ej. el
  de la campaña); el mensaje nombra ambas causas e incluye el texto de Meta. Ya
  pasó en la primera prueba real (2026-11-26). Arreglo: Business Manager →
  Usuarios del sistema → Asignar activos → Cuentas publicitarias (si la cuenta no
  aparece, el cliente primero da acceso de socio). Los demás anuncios del envío
  sí se guardan.
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

- `extension/` — la extensión (manifest, `background.js` hace todas las
  llamadas al dashboard; `content/` scripts por sitio; `popup/`).
- `app/api/extension/{me,boards,save}/route.ts` — rutas (Bearer token).
- `lib/ad-lab/extension.ts` — auth (`withExtensionAuth`, reusa
  `verifyMcpToken` + contexto de confianza), boards y guardado. Sin
  `"use server"` a propósito.
- `lib/ad-lab/storage-mirror.ts` — copia de media a Storage (compartido con
  `lib/actions/ad-lab.ts`).
