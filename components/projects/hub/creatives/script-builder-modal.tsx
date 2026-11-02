"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Sparkles, Check, RefreshCw, Wand2, ChevronRight, AlertTriangle, Info, Clock, Copy, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { suggestMechanics, generateHooks, generateBeat, generateCloses } from "@/lib/actions/script-builder"
import { saveScriptDrafts, addScriptDraftsToBrief } from "@/lib/actions/creatives"
import { MECHANICS, MECHANIC_KEYS, AWARENESS, lintScript, estimateSeconds, type MechanicKey, type ScriptHook, type ScriptPart } from "@/lib/scripts/framework"
import type { AdCloneLine, BrandBrain, CreativeBrief, CreativeConcept } from "@/lib/types"
import { cn } from "@/lib/utils"

// Constructor de guion de VIDEO paso a paso (runneth: Strategy Engine → Mecánica
// → Hook → Cuerpo por beats → Cierre). La IA propone opciones en cada paso; tú
// eliges, editas o pides más. "Armar todo con IA" completa lo que falte con la
// opción recomendada, sin salir de los pasos.

interface Props {
  concept: CreativeConcept
  projectId: string
  brandBrains: BrandBrain[]
  projectBrandBrainId?: string
  existingBrief?: CreativeBrief
  onClose: () => void
  onCreated: (brief: CreativeBrief) => void
}

let seq = 0
const withKey = (h: ScriptHook): ScriptHook => ({ ...h, key: `h${Date.now().toString(36)}${seq++}` })

const STEPS = ["Base", "Mecánica", "Hooks", "Cuerpo", "Cierre", "Revisión"] as const

export function ScriptBuilderModal({ concept, projectId, brandBrains, projectBrandBrainId, existingBrief, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [brainId, setBrainId] = useState(existingBrief?.brand_brain_id ?? projectBrandBrainId ?? brandBrains[0]?.id ?? "")
  const [mechOptions, setMechOptions] = useState<{ key: MechanicKey; why: string }[]>([])
  const [mechanic, setMechanic] = useState<MechanicKey | null>(null)
  const [showAllMech, setShowAllMech] = useState(false)
  const [hookOptions, setHookOptions] = useState<ScriptHook[]>([])
  const [picked, setPicked] = useState<ScriptHook[]>([])
  const [beatOptions, setBeatOptions] = useState<Record<number, ScriptPart[]>>({})
  const [body, setBody] = useState<ScriptPart[]>([])
  const [closeOptions, setCloseOptions] = useState<ScriptPart[]>([])
  const [close, setClose] = useState<ScriptPart | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<CreativeBrief | null>(null)

  const stage = AWARENESS[concept.awareness_stage ?? 2] ?? AWARENESS[2]
  const beats = mechanic ? MECHANICS[mechanic].beats : []
  const brain = brandBrains.find((b) => b.id === brainId)
  const primary = picked[0] ?? null

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(label); setError(null)
    try { return await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)); return null } finally { setBusy(null) }
  }

  // ── Acciones por paso ────────────────────────────────────────────────
  async function loadMechanics() {
    const r = await run("Eligiendo mecánicas…", () => suggestMechanics(concept.id, brainId))
    if (r) { setMechOptions(r); setStep(1) }
    return r
  }
  async function loadHooks(opts: { like?: ScriptHook } = {}) {
    if (!mechanic) return null
    const r = await run(opts.like ? "Variaciones de ese hook…" : "Escribiendo 6 hooks…", () => generateHooks(concept.id, brainId, mechanic, { like: opts.like, avoid: hookOptions.map((h) => h.spoken) }))
    const keyed = r?.map(withKey) ?? null
    if (keyed) { setHookOptions(keyed); setStep(2) }
    return keyed
  }
  async function loadBeat(i: number, prev = body.slice(0, i), hook = primary, mech = mechanic) {
    if (!hook || !mech) return null
    const r = await run(`Escribiendo "${MECHANICS[mech].beats[i]}"…`, () => generateBeat(concept.id, brainId, mech, hook, i, prev))
    if (r) setBeatOptions((o) => ({ ...o, [i]: r }))
    return r
  }
  async function loadCloses(b = body, hook = primary, mech = mechanic) {
    if (!hook || !mech) return null
    const r = await run("Escribiendo cierres…", () => generateCloses(concept.id, brainId, mech, hook, b))
    if (r) setCloseOptions(r)
    return r
  }
  function chooseMechanic(k: MechanicKey) {
    if (k !== mechanic) { setMechanic(k); setHookOptions([]); setPicked([]); setBody([]); setBeatOptions({}); setCloseOptions([]); setClose(null) }
  }
  function pickBeat(i: number, part: ScriptPart) {
    const next = [...body.slice(0, i), part]
    setBody(next)
    // Cambiar un beat invalida lo que venía después.
    setBeatOptions((o) => Object.fromEntries(Object.entries(o).filter(([k]) => Number(k) <= i)))
    setClose(null); setCloseOptions([])
  }

  // Armar todo con IA: completa lo que falte con la opción recomendada.
  async function buildAll() {
    let mech = mechanic
    if (!mech) {
      const ms = mechOptions.length ? mechOptions : await loadMechanics()
      if (!ms?.length) return
      mech = ms[0].key; setMechanic(mech)
    }
    let hooks = picked
    if (!hooks.length) {
      const hs = hookOptions.length ? hookOptions : (await run("Escribiendo 6 hooks…", () => generateHooks(concept.id, brainId, mech!, {})))?.map(withKey)
      if (!hs?.length) return
      setHookOptions(hs); hooks = [hs[0]]; setPicked(hooks)
    }
    const b = [...body]
    for (let i = b.length; i < MECHANICS[mech].beats.length; i++) {
      const opts = await loadBeat(i, b, hooks[0], mech)
      if (!opts?.length) return
      b.push(opts[0])
    }
    setBody(b)
    let c = close
    if (!c) {
      const cs = await loadCloses(b, hooks[0], mech)
      if (!cs?.length) return
      c = cs[0]; setClose(c)
    }
    setStep(5)
  }

  // Al entrar a Cuerpo / Cierre, pide lo que falte.
  useEffect(() => {
    if (busy) return
    if (step === 3 && primary && mechanic && body.length < beats.length && !beatOptions[body.length]) loadBeat(body.length)
    if (step === 4 && primary && body.length === beats.length && !closeOptions.length) loadCloses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, body.length])

  // ── Guion armado ─────────────────────────────────────────────────────
  const line = (section: string, p: ScriptPart): AdCloneLine => ({ speaker: section, original: "", adapted: p.spoken, visual: p.visual || null, overlay: p.overlay || null })
  const scriptFor = (h: ScriptHook): AdCloneLine[] => [
    line(`Hook · ${h.trigger}`, h),
    ...body.map((p, i) => line(beats[i] ?? "Cuerpo", p)),
    ...(close ? [line("Cierre", close)] : []),
  ]
  const bodyText = [...body.map((p) => p.spoken), close?.spoken ?? ""].join(" ")
  const lint = useMemo(() => lintScript({ hooks: picked, body, close, brandName: brain?.name }), [picked, body, close, brain])
  const complete = picked.length > 0 && body.length === beats.length && beats.length > 0 && !!close

  async function save() {
    const drafts = picked.map(scriptFor)
    const r = await run("Guardando…", () => existingBrief ? addScriptDraftsToBrief(existingBrief.id, projectId, drafts) : saveScriptDrafts(projectId, concept.id, brainId, drafts))
    if (r) setSaved(r)
  }

  const reach = [true, !!mechOptions.length || !!mechanic, !!mechanic && (hookOptions.length > 0 || picked.length > 0), picked.length > 0, body.length === beats.length && beats.length > 0, complete]
  const card = "rounded-xl border p-3 text-left transition-colors"

  if (saved) {
    return (
      <Dialog open onOpenChange={() => onCreated(saved)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Guion guardado</DialogTitle>
          <p className="text-sm text-muted-foreground">{picked.length} guion{picked.length === 1 ? "" : "es"} ({picked.length > 1 ? "un hook distinto cada uno, mismo cuerpo" : "listo para el editor"}) en el brief.</p>
          {saved.share_token && (
            <button type="button" onClick={() => navigator.clipboard.writeText(`${location.origin}/share/brief/${saved.share_token}`)}
              className="h-9 rounded-lg border border-border text-sm inline-flex items-center justify-center gap-2 hover:bg-muted"><Copy className="w-4 h-4" />Copiar link del brief</button>
          )}
          <Button onClick={() => onCreated(saved)}>Listo</Button>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[min(1180px,96vw)] w-[96vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Encabezado */}
        <div className="px-5 pt-4 pb-3 border-b border-border space-y-3 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold truncate">Guion de video · {concept.name}</DialogTitle>
              <p className="text-xs text-muted-foreground">{stage.label}{mechanic ? ` · ${MECHANICS[mechanic].label}` : ""}{brain ? ` · ${brain.name}` : ""}</p>
            </div>
            <Button size="sm" variant="outline" onClick={buildAll} disabled={!!busy || !brainId}><Wand2 className="w-4 h-4" />Armar todo con IA</Button>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1 shrink-0">
                <button type="button" disabled={!reach[i] || !!busy} onClick={() => setStep(i)}
                  className={cn("h-7 px-2.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
                    step === i ? "bg-foreground text-background" : reach[i] ? "text-foreground hover:bg-muted" : "text-muted-foreground/50")}>
                  <span className={cn("w-4 h-4 rounded-full text-[10px] flex items-center justify-center", step === i ? "bg-background/20" : "bg-muted")}>{i}</span>{s}
                </button>
                {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_400px]">
          {/* Paso actual */}
          <div className="lg:overflow-y-auto p-5 space-y-4 min-w-0">
            {busy && <div className="flex items-center gap-2 text-sm text-violet-600"><Loader2 className="w-4 h-4 animate-spin" />{busy}</div>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            {step === 0 && (
              <div className="space-y-4 max-w-2xl">
                <p className="text-sm text-muted-foreground">Todo el guion sale de esta base. Si algo no está bien, corrígelo en el concepto antes de seguir.</p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {([["Concepto", concept.name], ["Persona", concept.target_persona], ["Dolor / deseo", concept.pain_point], ["Objeción", concept.objection], ["Transformación", concept.transformation], ["Etapa de awareness", `${stage.label} — ${stage.hook}`]] as [string, string | null][]).map(([k, v]) => (
                    <div key={k} className={cn("rounded-lg bg-muted/40 px-3 py-2 min-w-0", k === "Concepto" || k === "Etapa de awareness" ? "sm:col-span-2" : "")}>
                      <dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="break-words">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
                {brandBrains.length > 1 && (
                  <label className="block space-y-1 max-w-sm"><span className="text-xs text-muted-foreground">Brand Brain</span>
                    <select value={brainId} onChange={(e) => setBrainId(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                      {brandBrains.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select></label>
                )}
                <Button onClick={() => (mechOptions.length ? setStep(1) : loadMechanics())} disabled={!!busy || !brainId}>Elegir mecánica <ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">La mecánica define cómo se conectan hook, cuerpo y cierre. Recomendadas para este concepto:</p>
                <div className="grid gap-2">
                  {mechOptions.map((m, i) => (
                    <button key={m.key} type="button" onClick={() => chooseMechanic(m.key)}
                      className={cn(card, mechanic === m.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/30")}>
                      <span className="flex items-center gap-2 text-sm font-semibold">{MECHANICS[m.key].label}{i === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">Recomendada</span>}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">{MECHANICS[m.key].desc}</span>
                      <span className="block text-xs mt-1.5">{m.why}</span>
                      <span className="block text-[11px] text-muted-foreground mt-1.5">Cuerpo: {MECHANICS[m.key].beats.join(" → ")}</span>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowAllMech((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">{showAllMech ? "Ocultar" : "Ver"} las 8 mecánicas</button>
                {showAllMech && (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {MECHANIC_KEYS.filter((k) => !mechOptions.some((m) => m.key === k)).map((k) => (
                      <button key={k} type="button" onClick={() => chooseMechanic(k)}
                        className={cn(card, "text-xs", mechanic === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/30")}>
                        <span className="block text-sm font-semibold">{MECHANICS[k].label}</span>{MECHANICS[k].desc}
                      </button>
                    ))}
                  </div>
                )}
                <Button onClick={() => (hookOptions.length ? setStep(2) : loadHooks())} disabled={!mechanic || !!busy}>Escribir hooks <ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Elige uno o varios. Con varios se arma un guion por hook con el mismo cuerpo, para testear hooks en Meta. <span className="text-foreground">{stage.label}:</span> {stage.hook}</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {hookOptions.map((h, i) => {
                    const on = picked.some((p) => p.key === h.key)
                    return (
                      <div key={i} className={cn(card, "space-y-1.5", on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border")}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted">{h.trigger}</span>
                          <button type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x.key !== h.key) : [...p, h]))}
                            className={cn("ml-auto h-6 px-2 rounded-md text-[11px] font-medium border inline-flex items-center gap-1", on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
                            {on ? <><Check className="w-3 h-3" />Elegido</> : "Elegir"}
                          </button>
                        </div>
                        <p className="text-sm font-medium leading-snug">“{h.spoken}”</p>
                        <p className="text-[11px] text-muted-foreground">🎬 {h.visual}</p>
                        {h.overlay && <p className="text-[11px] text-muted-foreground">📝 {h.overlay}</p>}
                        {h.why && <p className="text-[11px] italic text-muted-foreground">{h.why}</p>}
                        <button type="button" onClick={() => loadHooks({ like: h })} disabled={!!busy} className="text-[11px] text-violet-600 hover:underline">Más como este</button>
                      </div>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => loadHooks()} disabled={!!busy}><RefreshCw className="w-4 h-4" />Otros 6</Button>
                  <Button size="sm" onClick={() => setStep(3)} disabled={!picked.length || !!busy}>Armar el cuerpo <ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}

            {step === 3 && mechanic && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{MECHANICS[mechanic].label}: el cuerpo se arma beat por beat. Elige una opción por beat; puedes editarla en el guion de la derecha.</p>
                {beats.map((b, i) => {
                  const chosen = body[i]
                  const opts = beatOptions[i]
                  if (i > body.length) return <p key={b} className="text-sm text-muted-foreground/60">{i + 1}. {b}</p>
                  return (
                    <div key={b} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{i + 1}. {b}</p>
                        {chosen && <Check className="w-4 h-4 text-emerald-600" />}
                        {(opts || chosen) && <button type="button" onClick={() => loadBeat(i)} disabled={!!busy} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" />Otras opciones</button>}
                      </div>
                      {opts && (
                        <div className="grid sm:grid-cols-2 gap-2">
                          {opts.map((o, j) => (
                            <button key={j} type="button" onClick={() => pickBeat(i, o)}
                              className={cn(card, "space-y-1", chosen?.spoken === o.spoken ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/30")}>
                              <span className="block text-sm">“{o.spoken}”</span>
                              <span className="block text-[11px] text-muted-foreground">🎬 {o.visual}{o.overlay ? ` · 📝 ${o.overlay}` : ""}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {chosen && !opts && <p className="text-sm text-muted-foreground pl-1">“{chosen.spoken}”</p>}
                      {!opts && !chosen && i === body.length && !busy && <Button size="sm" variant="outline" onClick={() => loadBeat(i)}><Sparkles className="w-4 h-4" />Proponer</Button>}
                    </div>
                  )
                })}
                <Button size="sm" onClick={() => setStep(4)} disabled={body.length !== beats.length || !!busy}>Elegir cierre <ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground"><span className="text-foreground">{stage.label}:</span> {stage.close}</p>
                <div className="grid gap-2">
                  {closeOptions.map((o, j) => (
                    <button key={j} type="button" onClick={() => setClose(o)}
                      className={cn(card, "space-y-1", close?.spoken === o.spoken ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/30")}>
                      <span className="block text-sm">“{o.spoken}”</span>
                      <span className="block text-[11px] text-muted-foreground">🎬 {o.visual}{o.overlay ? ` · 📝 ${o.overlay}` : ""}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => loadCloses()} disabled={!!busy}><RefreshCw className="w-4 h-4" />Otros cierres</Button>
                  <Button size="sm" onClick={() => setStep(5)} disabled={!close || !!busy}>Revisar <ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4 max-w-2xl">
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Revisión (reglas de Hook Writing)</p>
                  {lint.length === 0 ? <p className="text-sm text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5"><Check className="w-4 h-4" />Sin observaciones.</p> : lint.map((l, i) => (
                    <div key={i} className={cn("rounded-lg px-3 py-2 text-sm flex gap-2", l.level === "warn" ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "bg-muted/50")}>
                      {l.level === "warn" ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />}
                      <span>{l.text} <span className="text-muted-foreground">{l.fix}</span></span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Se guardarán {picked.length} guion{picked.length === 1 ? "" : "es"}</p>
                  {picked.map((h, i) => <p key={i} className="text-xs text-muted-foreground">Guion {i + 1}: hook “{h.spoken.slice(0, 60)}{h.spoken.length > 60 ? "…" : ""}” · ~{estimateSeconds(`${h.spoken} ${bodyText}`)} s</p>)}
                </div>
                <Button onClick={save} disabled={!complete || !!busy}>{busy === "Guardando…" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Guardar al brief</Button>
              </div>
            )}
          </div>

          {/* Guion en vivo */}
          <aside className="border-t lg:border-t-0 lg:border-l border-border bg-muted/20 lg:overflow-y-auto p-4 space-y-3 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">Guion</p>
              {primary && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Clock className="w-3 h-3" />~{estimateSeconds(`${primary.spoken} ${bodyText}`)} s</span>}
            </div>
            {!primary && <p className="text-sm text-muted-foreground">El guion aparece aquí conforme eliges cada parte.</p>}
            {picked.map((h, i) => (
              <Block key={h.key ?? `h${i}`} title={`Hook${picked.length > 1 ? ` ${i + 1}` : ""} · ${h.trigger}`} part={h}
                onRemove={() => setPicked((p) => p.filter((x) => x.key !== h.key))}
                onChange={(v) => setPicked((p) => p.map((x) => (x.key === h.key ? { ...x, ...v } : x)))} />
            ))}
            {body.map((p, i) => <Block key={`b${i}`} title={beats[i]} part={p} onChange={(v) => setBody((b) => b.map((x, j) => (j === i ? { ...x, ...v } : x)))} />)}
            {close && <Block title="Cierre" part={close} onChange={(v) => setClose({ ...close, ...v })} />}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Block({ title, part, onChange, onRemove }: { title: string; part: ScriptPart; onChange: (v: Partial<ScriptPart>) => void; onRemove?: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5 space-y-1">
      <div className="flex items-center gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1 truncate">{title}</p>
        {onRemove && <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground" aria-label="Quitar"><X className="w-3 h-3" /></button>}
      </div>
      <AutoTextarea value={part.spoken} onChange={(e) => onChange({ spoken: e.target.value })} rows={1}
        className="w-full bg-transparent text-sm leading-snug resize-none focus:outline-none" />
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span title="Qué se ve">🎬</span>
        <input value={part.visual} onChange={(e) => onChange({ visual: e.target.value })} placeholder="Qué se ve" className="flex-1 min-w-0 bg-transparent focus:outline-none" /></label>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span title="Texto en pantalla">📝</span>
        <input value={part.overlay ?? ""} onChange={(e) => onChange({ overlay: e.target.value })} placeholder="Texto en pantalla" className="flex-1 min-w-0 bg-transparent focus:outline-none" /></label>
    </div>
  )
}
