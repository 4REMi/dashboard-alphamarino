#!/usr/bin/env node
// Chequeo de seguridad de server actions.
//
// Todo lo exportado de un archivo "use server" es un endpoint público: se
// puede llamar con un POST directo, sin pasar por la UI ni por el login.
// Este script falla si una función exportada no verifica en el servidor
// quién la llama, directamente o a través de un helper local.
//
// Cuenta como verificación (en la función o en un helper del mismo archivo
// que ella llame, transitivamente): requireSessionOrTrusted, requireRole
// (lib/auth/guards.ts), auth.getUser/getClaims, assertActingProfile,
// assertTrustedSource o CRON_SECRET.
//
// Las funciones públicas a propósito van en ALLOWLIST con su razón.
//
// Uso: node scripts/check-server-actions.mjs   (o pnpm check:actions)
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const ts = require("typescript")
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")

const ALLOWLIST = {
  // Login (sin sesión): logo del workspace.
  "lib/actions/workspace.ts:getWorkspaceSettings": "la usa la página de login",
  // Enlaces compartidos: validan el token del enlace.
  "lib/actions/image-clone.ts:getImageCloneByToken": "enlace público con token",
  "lib/actions/ad-clone.ts:getAdCloneByToken": "enlace público con token",
  "lib/actions/creatives.ts:getBriefByToken": "enlace público con token",
  "lib/actions/ad-lab.ts:getBoardByToken": "enlace público con token",
  // Revisión del cliente en enlaces compartidos (por id del creativo/brief).
  "lib/actions/client-review.ts:submitClientReview": "revisión del cliente desde enlace compartido",
  "lib/actions/client-review.ts:submitBriefClientReview": "revisión del cliente desde enlace compartido",
  // Consentimiento OAuth: revalida la petición; no lee ni escribe datos.
  "app/oauth/authorize/actions.ts:denyAuthorization": "solo redirige con access_denied",
  "lib/auth-actions.ts:signOut": "cerrar sesión",
  // Cálculos puros / datos públicos.
  "lib/actions/ad-nodes/providers/pricing.ts:estimateVideoCostUsd": "cálculo puro",
  "lib/actions/ad-nodes/providers/pricing.ts:getVideoModelResolutionOptions": "cálculo puro",
  "lib/actions/ad-nodes/providers/pricing.ts:estimateImageCostUsd": "cálculo puro",
  "lib/actions/ad-nodes/providers/pricing.ts:getModelAspectRatioOptions": "cálculo puro",
  "lib/actions/finances.ts:getExchangeRate": "tipo de cambio público",
}

const MARKERS = [
  "requireSessionOrTrusted(", "requireRole(", "getUser(", "getClaims(",
  "assertActingProfile(", "assertTrustedSource(", "CRON_SECRET",
]

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = ["lib", "app", "components"].flatMap((d) => walk(path.join(root, d)))
  .filter((f) => /^\s*["']use server["']/.test(fs.readFileSync(f, "utf8")))

const problems = []
const seenAllow = new Set()
for (const abs of files) {
  const rel = path.relative(root, abs).split(path.sep).join("/")
  const src = fs.readFileSync(abs, "utf8")
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true)
  const fns = new Map()
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      fns.set(n.name.text, { text: n.body.getText(sf), exported: !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword), line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 })
    } else if (ts.isVariableStatement(n)) {
      const exported = !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      for (const d of n.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          fns.set(d.name.text, { text: d.initializer.body.getText(sf), exported, line: sf.getLineAndCharacterOfPosition(d.getStart(sf)).line + 1 })
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)

  const verified = new Set()
  for (let changed = true; changed;) {
    changed = false
    for (const [name, fn] of fns) {
      if (verified.has(name)) continue
      if (MARKERS.some((m) => fn.text.includes(m)) || [...verified].some((h) => new RegExp(`\\b${h}\\(`).test(fn.text))) {
        verified.add(name); changed = true
      }
    }
  }
  for (const [name, fn] of fns) {
    if (!fn.exported) continue
    const key = `${rel}:${name}`
    if (ALLOWLIST[key]) { seenAllow.add(key); continue }
    if (!verified.has(name)) problems.push(`${rel}:${fn.line}  ${name}`)
  }
}

const stale = Object.keys(ALLOWLIST).filter((k) => !seenAllow.has(k))
if (stale.length) console.warn(`Aviso: entradas de ALLOWLIST que ya no existen:\n  ${stale.join("\n  ")}`)

if (problems.length) {
  console.error(
    `✖ ${problems.length} server action(s) sin verificación de quién llama:\n  ${problems.join("\n  ")}\n\n` +
    `Agrega al inicio "await requireSessionOrTrusted()" o "await requireRole([...])" (lib/auth/guards.ts),\n` +
    `o, si es pública a propósito, agrégala a ALLOWLIST en scripts/check-server-actions.mjs con su razón.`,
  )
  process.exit(1)
}
console.log(`✔ ${files.length} archivos "use server" revisados: todas las funciones exportadas verifican quién llama.`)
