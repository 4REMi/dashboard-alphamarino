"use client"

import { useState, useTransition, useRef } from "react"
import type { BrandBrain, BrandBrainColor } from "@/lib/types"
import { createBrandBrain, updateBrandBrain } from "@/lib/actions/brand-brains"
import { X, Plus, Trash2, Loader2, Upload, ChevronRight } from "lucide-react"

const INDUSTRIES = [
  "E-commerce", "Moda y ropa", "Fitness y salud", "Alimentación",
  "Tecnología", "Belleza y cosméticos", "Hogar y decoración",
  "Educación", "Servicios profesionales", "Entretenimiento", "Otro",
]

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
]

const TABS = ["Datos básicos", "Copy de marketing", "Info adicional", "Assets"] as const
type Tab = typeof TABS[number]

interface Props {
  brain?: BrandBrain
  onClose: () => void
  onSaved: (brain: BrandBrain) => void
}

function TagListInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={v}
              onChange={(e) => {
                const next = [...values]
                next[i] = e.target.value
                onChange(next)
              }}
              placeholder={placeholder}
              className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...values, ""])}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar otro
        </button>
      </div>
    </div>
  )
}

export function BrandBrainModal({ brain, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>("Datos básicos")
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(brain?.logo_url ?? null)

  // Form state
  const [name, setName]               = useState(brain?.name ?? "")
  const [initials, setInitials]       = useState(brain?.initials ?? "")
  const [industry, setIndustry]       = useState(brain?.industry ?? "")
  const [language, setLanguage]       = useState(brain?.language ?? "es")
  const [colors, setColors]           = useState<BrandBrainColor[]>(
    brain?.brand_colors?.length ? brain.brand_colors : [{ hex: "#000000", label: "Primario" }]
  )
  const [usps, setUsps]               = useState<string[]>(brain?.usps?.length ? brain.usps : [""])
  const [keyBenefits, setKeyBenefits] = useState<string[]>(brain?.key_benefits?.length ? brain.key_benefits : [""])
  const [painPoints, setPainPoints]   = useState<string[]>(brain?.pain_points?.length ? brain.pain_points : [""])
  const [targetAudience, setTargetAudience] = useState(brain?.target_audience ?? "")
  const [keyFeatures, setKeyFeatures] = useState<string[]>(brain?.key_features?.length ? brain.key_features : [""])
  const [ctas, setCtas]               = useState<string[]>(brain?.ctas?.length ? brain.ctas : [""])
  const [toneOfVoice, setToneOfVoice] = useState(brain?.tone_of_voice ?? "")
  const [additionalContext, setAdditionalContext] = useState(brain?.additional_context ?? "")

  const tabIndex = TABS.indexOf(tab)
  const isLast   = tabIndex === TABS.length - 1

  function clean(arr: string[]) { return arr.filter((s) => s.trim()) }

  function handleSubmit() {
    if (!name.trim()) { setTab("Datos básicos"); return }
    startTransition(async () => {
      const fd = new FormData()
      fd.set("name", name)
      fd.set("initials", initials)
      fd.set("industry", industry)
      fd.set("language", language)
      fd.set("brand_colors", JSON.stringify(colors))
      fd.set("usps", JSON.stringify(clean(usps)))
      fd.set("key_benefits", JSON.stringify(clean(keyBenefits)))
      fd.set("pain_points", JSON.stringify(clean(painPoints)))
      fd.set("target_audience", targetAudience)
      fd.set("key_features", JSON.stringify(clean(keyFeatures)))
      fd.set("ctas", JSON.stringify(clean(ctas)))
      fd.set("tone_of_voice", toneOfVoice)
      fd.set("additional_context", additionalContext)
      if (fileRef.current?.files?.[0]) fd.set("logo", fileRef.current.files[0])

      const result = brain
        ? await updateBrandBrain(brain.id, fd).then(() => ({ ...brain, name, initials, industry, language, brand_colors: colors, usps: clean(usps), key_benefits: clean(keyBenefits), pain_points: clean(painPoints), target_audience: targetAudience, key_features: clean(keyFeatures), ctas: clean(ctas), tone_of_voice: toneOfVoice, additional_context: additionalContext }))
        : await createBrandBrain(fd)

      onSaved(result as BrandBrain)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-bold">{brain ? "Editar Brand Brain" : "Nuevo Brand Brain"}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left nav */}
          <div className="w-44 flex-shrink-0 border-r border-border py-4 px-3 space-y-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                  tab === t
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* ── Datos básicos ── */}
            {tab === "Datos básicos" && (
              <>
                {/* Logo */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Logo <span className="normal-case font-normal">(opcional)</span></p>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {logoPreview
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={logoPreview} alt="" className="w-full h-full object-cover" />
                        : <Upload className="w-5 h-5 text-muted-foreground" />
                      }
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="h-8 px-3 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
                      >
                        Subir imagen
                      </button>
                      <p className="text-[11px] text-muted-foreground mt-1">Cuadrada, mínimo 200×200px</p>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) setLogoPreview(URL.createObjectURL(f))
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Name + Initials */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Nombre <span className="text-destructive">*</span>
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ej. Fresafit"
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Iniciales</label>
                    <input
                      value={initials}
                      onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 3))}
                      placeholder="ej. FF"
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                {/* Industry + Language */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Industria</label>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
                    >
                      <option value="">Selecciona…</option>
                      {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Idioma</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
                    >
                      {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Brand colors */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Colores de marca</p>
                    <button
                      type="button"
                      onClick={() => setColors([...colors, { hex: "#ffffff", label: "Secundario" }])}
                      className="text-xs text-primary font-medium hover:text-primary/80 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Agregar color
                    </button>
                  </div>
                  <div className="space-y-2">
                    {colors.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={c.hex}
                          onChange={(e) => {
                            const next = [...colors]
                            next[i] = { ...next[i], hex: e.target.value }
                            setColors(next)
                          }}
                          className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5"
                        />
                        <input
                          value={c.hex}
                          onChange={(e) => {
                            const next = [...colors]
                            next[i] = { ...next[i], hex: e.target.value }
                            setColors(next)
                          }}
                          className="w-24 h-9 px-3 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <input
                          value={c.label}
                          onChange={(e) => {
                            const next = [...colors]
                            next[i] = { ...next[i], label: e.target.value }
                            setColors(next)
                          }}
                          placeholder="Nombre"
                          className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        {colors.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setColors(colors.filter((_, j) => j !== i))}
                            className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Copy de marketing ── */}
            {tab === "Copy de marketing" && (
              <>
                <TagListInput label="Unique Selling Points (USPs)" values={usps} onChange={setUsps} placeholder="ej. Piel real, no sintética" />
                <TagListInput label="Key Benefits" values={keyBenefits} onChange={setKeyBenefits} placeholder="ej. Ahorra tiempo en el gym" />
                <TagListInput label="Pain Points" values={painPoints} onChange={setPainPoints} placeholder="ej. Cinturones que se desbaratan" />
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Target Audience</label>
                  <textarea
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="ej. Hombres 18-35, aficionados al gym, intereados en anime"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>
                <TagListInput label="Key Features" values={keyFeatures} onChange={setKeyFeatures} placeholder="ej. Bordados que no se despegan" />
                <TagListInput label="CTAs y Ofertas" values={ctas} onChange={setCtas} placeholder="ej. Compra 2 y llévate 1 gratis" />
              </>
            )}

            {/* ── Info adicional ── */}
            {tab === "Info adicional" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Tono de voz</label>
                  <textarea
                    value={toneOfVoice}
                    onChange={(e) => setToneOfVoice(e.target.value)}
                    placeholder="ej. Directo, apasionado, orientado a resultados. Habla como alguien que vive el gym."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Contexto adicional</label>
                  <textarea
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    placeholder="Cualquier información relevante: historia de la marca, restricciones, temporadas clave…"
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>
              </>
            )}

            {/* ── Assets ── */}
            {tab === "Assets" && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center border-2 border-dashed border-border rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Los assets se agregan después</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Guarda el Brand Brain primero. Luego puedes subir imágenes y videos desde la vista de detalle.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-border px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">* Nombre es requerido</p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            {!isLast && (
              <button
                onClick={() => setTab(TABS[tabIndex + 1])}
                className="h-9 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={isPending || !name.trim()}
              className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {brain ? "Guardar cambios" : "Crear Brand Brain"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
