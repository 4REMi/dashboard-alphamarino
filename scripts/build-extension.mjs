// Genera la extensión para cada navegador a partir de la misma carpeta
// extension/ (fuente única; su manifest.json es el de Chrome).
//   pnpm ext:build  →  dist-extension/chrome, dist-extension/firefox
// Diferencias de Firefox (Manifest V3):
//   - background con "scripts" (Firefox no corre service workers de extensión).
//   - browser_specific_settings.gecko: ID fijo (lo exige para storage y para
//     firmar) y versión mínima 128 (primera con content scripts world: "MAIN").
// El código JS es el mismo: Firefox entiende el namespace chrome.*.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const SRC = "extension"
const OUT = "dist-extension"
const GECKO_ID = "guardar-anuncios@alphamarino.dashboard"

rmSync(OUT, { recursive: true, force: true })
const manifest = JSON.parse(readFileSync(join(SRC, "manifest.json"), "utf8"))

const targets = {
  chrome: manifest,
  firefox: {
    ...manifest,
    background: { scripts: [manifest.background.service_worker] },
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: "128.0",
        // Manda el contenido de anuncios (texto/URLs de media) al dashboard propio.
        data_collection_permissions: { required: ["websiteContent"] },
      },
    },
  },
}

for (const [name, m] of Object.entries(targets)) {
  const dir = join(OUT, name)
  mkdirSync(dir, { recursive: true })
  cpSync(SRC, dir, { recursive: true, filter: (p) => !p.endsWith("README.md") })
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(m, null, 2) + "\n")
  console.log(`✔ ${dir} (v${m.version})`)
}
