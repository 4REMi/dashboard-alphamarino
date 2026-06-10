"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { addProjectMember, removeProjectMember } from "@/lib/actions/projects"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { UserPlus, X } from "lucide-react"
import type { Profile } from "@/lib/types"

interface TeamManagerProps {
  projectId: string
  members: Profile[]
  allEmployees: Profile[]
  isAdmin: boolean
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

export function TeamManager({ projectId, members, allEmployees, isAdmin }: TeamManagerProps) {
  const t = useTranslations("projects.members")
  const [optimisticMembers, setOptimisticMembers] = useState<Profile[]>(members)
  const [isPending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState("none")

  const available = allEmployees.filter(
    (e) => !optimisticMembers.some((m) => m.id === e.id)
  )

  function handleAdd(profileId: string) {
    if (profileId === "none") return
    const employee = allEmployees.find((e) => e.id === profileId)
    if (!employee) return

    setOptimisticMembers((prev) => [...prev, employee])
    setSelectedId("none")

    startTransition(async () => {
      await addProjectMember(projectId, profileId)
    })
  }

  function handleRemove(profileId: string) {
    setOptimisticMembers((prev) => prev.filter((m) => m.id !== profileId))

    startTransition(async () => {
      await removeProjectMember(projectId, profileId)
    })
  }

  return (
    <div>
      <div className="space-y-1">
        {optimisticMembers.map((member) => (
          <div key={member.id} className="relative group">
            <Link
              href={`/employees/${member.id}`}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
            >
              <Avatar className="h-7 w-7 flex-shrink-0">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt={member.full_name} className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="text-xs">{initials(member.full_name)}</AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0 pr-5">
                <p className="text-xs font-medium truncate">{member.full_name}</p>
                {member.position && <p className="text-xs text-muted-foreground truncate">{member.position}</p>}
              </div>
            </Link>
            {isAdmin && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(member.id) }}
                disabled={isPending}
                title={t("remove")}
                className="absolute top-1/2 -translate-y-1/2 right-1.5 p-1 rounded-full text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {optimisticMembers.length === 0 && (
          <p className="text-xs text-muted-foreground py-1 px-2">{t("noMembers")}</p>
        )}
      </div>

      {isAdmin && available.length > 0 && (
        <div className={optimisticMembers.length > 0 ? "mt-3 pt-3 border-t border-border" : ""}>
          <Select value={selectedId} onValueChange={handleAdd}>
            <SelectTrigger className="w-full h-8 border-dashed text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <UserPlus className="w-3.5 h-3.5" />
                <span>{t("add")}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>{t("selectEmployee")}</SelectItem>
              {available.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5"><AvatarFallback className="text-xs">{initials(e.full_name)}</AvatarFallback></Avatar>
                    <span>{e.full_name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
