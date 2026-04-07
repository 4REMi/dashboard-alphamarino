"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { updateEmployee, deleteEmployee, resendPasswordLink, uploadAvatar } from "@/lib/actions/employees"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Camera } from "lucide-react"
import type { Profile } from "@/lib/types"

interface Props {
  profile: Profile
  isAdmin: boolean
  isSelf: boolean
}

type LinkState = "idle" | "sending" | "sent" | "error"

export function EmployeeEditActions({ profile, isAdmin, isSelf }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkState, setLinkState] = useState<LinkState>("idle")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const initials = profile.full_name
    .split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?"

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
    setAvatarUploading(true)
    const fd = new FormData()
    fd.append("avatar", file)
    try {
      const url = await uploadAvatar(profile.id, fd)
      setAvatarPreview(url)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir foto")
      setAvatarPreview(profile.avatar_url)
    } finally {
      setAvatarUploading(false)
    }
  }

  function handleResendLink() {
    if (!profile.email) return
    setLinkState("sending")
    startTransition(async () => {
      try {
        await resendPasswordLink(profile.email!)
        setLinkState("sent")
        setTimeout(() => setLinkState("idle"), 3000)
      } catch {
        setLinkState("error")
        setTimeout(() => setLinkState("idle"), 3000)
      }
    })
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      try {
        await updateEmployee(profile.id, fd)
        setEditOpen(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar")
      }
    })
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar a ${profile.full_name} permanentemente? Esto revocará su acceso.`)) return
    startTransition(async () => {
      try {
        await deleteEmployee(profile.id)
        router.push("/employees")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al eliminar")
      }
    })
  }

  if (!isAdmin && !isSelf) return null

  return (
    <div className="flex gap-2">
      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); setError(null) }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">Editar</Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar empleado</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 mt-2">
            {/* Avatar */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="relative group"
                title="Cambiar foto"
              >
                <div className="w-20 h-20 rounded-full overflow-hidden bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground border-2 border-border">
                  {avatarPreview ? (
                    <Image src={avatarPreview} alt="Avatar" width={80} height={80} className="object-cover w-full h-full" unoptimized />
                  ) : initials}
                </div>
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {avatarUploading
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Camera className="w-5 h-5 text-white" />}
                </div>
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nombre completo *</label>
              <input
                name="full_name"
                required
                defaultValue={profile.full_name}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cargo</label>
              <input
                name="position"
                defaultValue={profile.position ?? ""}
                placeholder="Media Buyer, Diseñador..."
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Teléfono</label>
              <input
                name="phone"
                type="tel"
                defaultValue={profile.phone ?? ""}
                placeholder="+507 6000-0000"
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {isAdmin && !isSelf && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Rol</label>
                <select
                  name="role"
                  defaultValue={profile.role}
                  className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="employee">Empleado</option>
                  <option value="subadmin">Subadmin</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            )}
            {/* Resend password link */}
            {isAdmin && profile.email && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  ¿El empleado no recibió o perdió su link de acceso?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResendLink}
                  disabled={isPending || linkState === "sending" || linkState === "sent"}
                  className="w-full"
                >
                  {linkState === "sending" && "Enviando..."}
                  {linkState === "sent" && "✓ Link enviado"}
                  {linkState === "error" && "Error al enviar"}
                  {linkState === "idle" && "Reenviar link de contraseña"}
                </Button>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete — admin only, can't delete self */}
      {isAdmin && !isSelf && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
        >
          Eliminar
        </Button>
      )}
    </div>
  )
}
