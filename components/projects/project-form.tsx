"use client"

import { useState, useTransition } from "react"
import { createProject, updateProject } from "@/lib/actions/projects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Check, Loader2, FolderKanban } from "lucide-react"
import type { Project, Customer, ProjectType, PhaseSetPhase, BrandBrain, Profile } from "@/lib/types"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { CustomerCombobox } from "@/components/projects/customer-combobox"
import { BrandBrainPicker } from "@/components/projects/brand-brain-picker"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { cn } from "@/lib/utils"
import { ScopePicker, scopeReady, type ScopeOffer, type ScopeValue } from "@/components/projects/scope-picker"

// Nuevo / editar proyecto. Arriba el nombre; luego el tipo como tarjetas
// (con su ícono y color) que define las fases; cliente y marca; el equipo
// como chips con avatar (al crear: así las tareas se asignan por puesto);
// las fases a incluir; y al final fechas, dinero y descripción. Pie fijo
// con el resumen de lo que se va a crear.

interface ProjectFormProps {
  project?: Project
  customers: Customer[]
  projectTypes: ProjectType[]
  brandBrains?: BrandBrain[]
  employees?: Profile[]
  trigger?: React.ReactNode
  canViewFinancials?: boolean
  // Alcance al crear (solo admin/subadmin). Ofertas sin precios.
  offers?: ScopeOffer[]
  canDefineScope?: boolean
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 min-w-0">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")

export function ProjectForm({ project, customers, projectTypes, brandBrains = [], employees = [], trigger, canViewFinancials = true, offers = [], canDefineScope = false }: ProjectFormProps) {
  const [open, setOpen] = useState(false)
  const [customerId, setCustomerId] = useState(project?.customer_id ?? "none")
  const [projectTypeId, setProjectTypeId] = useState(project?.project_type_id ?? "none")
  const [brandBrainId, setBrandBrainId] = useState(project?.brand_brain_id ?? "none")
  const [selectedPhaseIds, setSelectedPhaseIds] = useState<string[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [scope, setScope] = useState<ScopeValue>({ offerIds: [], customs: [], internal: false })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEdit = !!project
  const askScope = !isEdit && canDefineScope
  const scopeOk = !askScope || scopeReady(scope)

  const selectedType = projectTypes.find((pt) => pt.id === projectTypeId)
  const availablePhases: PhaseSetPhase[] = (selectedType?.default_phase_set as { phases?: PhaseSetPhase[] } | undefined)?.phases ?? []

  function pickType(typeId: string) {
    setProjectTypeId(typeId)
    const type = projectTypes.find((pt) => pt.id === typeId)
    const phases = (type?.default_phase_set as { phases?: PhaseSetPhase[] } | undefined)?.phases ?? []
    setSelectedPhaseIds(phases.map((p) => p.id))
  }
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("customer_id", customerId === "none" ? "" : customerId)
    formData.set("project_type_id", projectTypeId === "none" ? "" : projectTypeId)
    formData.set("brand_brain_id", brandBrainId === "none" ? "" : brandBrainId)
    if (!isEdit && askScope) {
      formData.set("offer_ids_json", JSON.stringify(scope.internal ? [] : scope.offerIds))
      formData.set("custom_deliverables_json", JSON.stringify(scope.internal ? [] : scope.customs))
      formData.set("is_internal", String(scope.internal))
    }
    startTransition(async () => {
      try {
        if (project) await updateProject(project.id, formData)
        else await createProject(formData, selectedPhaseIds.length ? selectedPhaseIds : undefined, selectedMemberIds.length ? selectedMemberIds : undefined)
        setOpen(false)
      } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    })
  }

  const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
  const summary = !isEdit ? [
    selectedType ? selectedType.name : null,
    selectedPhaseIds.length ? `${selectedPhaseIds.length} fase${selectedPhaseIds.length === 1 ? "" : "s"}` : null,
    selectedMemberIds.length ? `${selectedMemberIds.length} persona${selectedMemberIds.length === 1 ? "" : "s"}` : null,
    askScope ? (scope.internal ? "Interno" : scopeReady(scope) ? `${scope.offerIds.length + scope.customs.length} de alcance` : "Falta definir el alcance") : null,
  ].filter(Boolean).join(" · ") : ""

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm"><Plus className="w-4 h-4" />Nuevo Proyecto</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[min(760px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden p-0 gap-0 grid-cols-1">
        <form onSubmit={handleSubmit} className="min-w-0">
          {/* Nombre */}
          <div className="px-6 pt-5 pb-4 border-b border-border space-y-1 pr-12">
            <DialogTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isEdit ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle>
            <input name="name" defaultValue={project?.name} required autoFocus placeholder="Nombre del proyecto"
              className="w-full bg-transparent text-2xl font-semibold placeholder:text-muted-foreground/50 focus:outline-none" />
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* Tipo */}
            <Section title="Tipo de proyecto" hint={!isEdit ? "Define las fases y tareas que se crean." : undefined}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 [&>*]:min-w-0">
                {[...projectTypes, { id: "none", name: "Sin tipo", color: null, icon: null } as Pick<ProjectType, "id" | "name" | "color" | "icon">].map((t) => {
                  const Icon = getProjectTypeIcon(t.icon) ?? FolderKanban
                  const on = projectTypeId === t.id
                  return (
                    <button key={t.id} type="button" onClick={() => pickType(t.id)}
                      className={cn("rounded-lg border px-3 py-2.5 text-left flex items-center gap-2.5 transition-colors", on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/30")}>
                      <span className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: t.color ? `${t.color}22` : "var(--muted)", color: t.color ?? undefined }}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-medium leading-tight truncate">{t.name}</span>
                    </button>
                  )
                })}
              </div>
            </Section>

            {/* Cliente y marca */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 [&>*]:min-w-0">
              <Section title="Cliente"><CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} /></Section>
              {brandBrains.length > 0 && (
                <Section title="Brand Brain"><BrandBrainPicker brandBrains={brandBrains} value={brandBrainId} onChange={setBrandBrainId} /></Section>
              )}
            </div>

            {/* Alcance */}
            {askScope && (
              <Section title="Alcance" hint="Lo que se entrega. De aquí sale la barra de avance del proyecto.">
                <ScopePicker offers={offers} value={scope} onChange={setScope} />
              </Section>
            )}

            {/* Equipo */}
            {!isEdit && employees.length > 0 && (
              <Section title={`Equipo · ${selectedMemberIds.length}`} hint="Agrégalos ya para que las tareas de las fases se asignen solas por puesto.">
                <div className="flex flex-wrap gap-1.5">
                  {employees.map((e) => {
                    const on = selectedMemberIds.includes(e.id)
                    return (
                      <button key={e.id} type="button" onClick={() => toggle(selectedMemberIds, setSelectedMemberIds, e.id)}
                        className={cn("h-9 pl-1 pr-3 rounded-full border inline-flex items-center gap-2 text-sm transition-colors", on ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30")}>
                        <span className="relative w-7 h-7 rounded-full overflow-hidden bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {e.avatar_url ? <img src={e.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(e.full_name ?? e.email ?? "?")}
                          {on && <span className="absolute inset-0 bg-primary/80 flex items-center justify-center text-primary-foreground"><Check className="w-3.5 h-3.5" /></span>}
                        </span>
                        <span className="leading-tight text-left">
                          <span className="block">{e.full_name ?? e.email}</span>
                          {e.position && <span className="block text-[10px] text-muted-foreground">{e.position}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Fases */}
            {!isEdit && availablePhases.length > 0 && (
              <Section title={`Fases · ${selectedPhaseIds.length} de ${availablePhases.length}`} hint="Quita las que no apliquen a este proyecto.">
                <div className="flex flex-wrap gap-1.5">
                  {availablePhases.map((ph, i) => {
                    const on = selectedPhaseIds.includes(ph.id)
                    return (
                      <button key={ph.id} type="button" onClick={() => toggle(selectedPhaseIds, setSelectedPhaseIds, ph.id)} title={ph.description ?? undefined}
                        className={cn("h-8 pl-1.5 pr-3 rounded-full border inline-flex items-center gap-1.5 text-sm transition-colors", on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground line-through decoration-muted-foreground/50 hover:border-foreground/30")}>
                        <span className={cn("w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center", on ? "bg-background/20" : "bg-muted")}>{i + 1}</span>
                        {ph.name}
                      </button>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Fechas y dinero */}
            <div className={cn("grid grid-cols-2 gap-4 [&>*]:min-w-0", canViewFinancials ? "sm:grid-cols-4" : "")}>
              <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Inicio</span>
                <input name="start_date" type="date" defaultValue={project?.start_date ?? ""} className={input} /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Fin estimado</span>
                <input name="end_date" type="date" defaultValue={project?.end_date ?? ""} className={input} /></label>
              {canViewFinancials && <>
                <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Valor del proyecto</span>
                  <input name="project_value" type="number" min="0" step="0.01" placeholder="$" defaultValue={project?.project_value ?? ""} className={cn(input, "tabular-nums")} /></label>
                <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Fee mensual</span>
                  <input name="monthly_fee" type="number" min="0" step="0.01" placeholder="$" defaultValue={project?.monthly_fee ?? ""} className={cn(input, "tabular-nums")} /></label>
              </>}
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Descripción</span>
              <AutoTextarea name="description" rows={2} defaultValue={project?.description ?? ""} placeholder="Qué incluye, objetivo, notas…" className={cn(input, "resize-none")} />
            </label>
          </div>

          {/* Pie */}
          <div className="px-6 py-3 border-t border-border bg-background flex items-center gap-3 sticky bottom-0 z-10">
            <span className={cn("text-xs flex-1 truncate", error ? "text-red-600" : "text-muted-foreground")}>{error ?? summary}</span>
            <button type="button" onClick={() => setOpen(false)} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
            <button type="submit" disabled={isPending || !scopeOk} title={scopeOk ? undefined : "Define el alcance o marca el proyecto como interno"} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{isEdit ? "Guardar" : "Crear proyecto"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
