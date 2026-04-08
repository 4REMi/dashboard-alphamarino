"use client"

import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Settings } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { updateOwnProfile, uploadOwnAvatar, setLanguagePreference } from "@/lib/actions/employees"
import { useTranslations } from "next-intl"
import type { Profile } from "@/lib/types"

interface Props {
  profile: Profile
}

export function ProfileEditModal({ profile }: Props) {
  const t = useTranslations("profile")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const initials = profile.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const fd = new FormData()
      fd.set("avatar", file)
      const url = await uploadOwnAvatar(fd)
      setAvatarUrl(url)
      router.refresh()
    } finally {
      setUploadingAvatar(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const newLang = fd.get("language") as string
    startTransition(async () => {
      await setLanguagePreference(newLang)
      await updateOwnProfile(fd)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title={t("editTrigger")}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="relative w-20 h-20 rounded-full overflow-hidden bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground hover:opacity-80 transition-opacity"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={profile.full_name} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-white text-xs font-medium">…</span>
                </div>
              )}
            </button>
            <p className="text-xs text-muted-foreground">{t("avatarHint")}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pem-name">{t("fullName")}</Label>
            <Input
              id="pem-name"
              name="full_name"
              defaultValue={profile.full_name}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pem-phone">{t("phone")}</Label>
            <Input
              id="pem-phone"
              name="phone"
              type="tel"
              defaultValue={profile.phone ?? ""}
              placeholder="+507 6000-0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pem-language">{t("language")}</Label>
            <select
              id="pem-language"
              name="language"
              defaultValue={profile.language ?? "es"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="es">{t("languageEs")}</option>
              <option value="en">{t("languageEn")}</option>
            </select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || uploadingAvatar}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
