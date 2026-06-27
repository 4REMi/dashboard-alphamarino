"use client"

import { useState } from "react"
import type { Profile, ProjectLogEntry } from "@/lib/types"
import { TeamManager } from "@/components/projects/team-manager"
import { ProjectLog } from "@/components/projects/hub/project-log"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Users, BookOpen, DollarSign } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

interface Props {
  projectId: string
  members: Profile[]
  allEmployees: Profile[]
  canManageTeam: boolean
  logEntries: ProjectLogEntry[]
  currentUserId: string
  isAdmin: boolean
  finances?: {
    projectValue: number
    totalIncome: number
    accountsReceivable: number
    monthlyFee?: number | null
    totalExpenses: number
  } | null
}

export function ProjectContextBar({
  projectId, members, allEmployees, canManageTeam,
  logEntries, currentUserId, isAdmin, finances,
}: Props) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-6 flex-wrap">

        {/* ── Team ── */}
        <Dialog>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 hover:bg-muted/50 rounded-lg px-2 py-1.5 transition-colors">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Equipo</span>
              <div className="flex -space-x-1.5">
                {members.slice(0, 5).map((m) => (
                  <Avatar key={m.id} className="h-6 w-6 border-2 border-card">
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt={m.full_name} className="h-full w-full object-cover" />
                    ) : (
                      <AvatarFallback className="text-[10px]">{initials(m.full_name)}</AvatarFallback>
                    )}
                  </Avatar>
                ))}
                {members.length > 5 && (
                  <Avatar className="h-6 w-6 border-2 border-card">
                    <AvatarFallback className="text-[10px]">+{members.length - 5}</AvatarFallback>
                  </Avatar>
                )}
              </div>
              {members.length === 0 && (
                <span className="text-xs text-muted-foreground/60">Sin miembros</span>
              )}
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Equipo ({members.length})</DialogTitle>
            </DialogHeader>
            <TeamManager
              projectId={projectId}
              members={members}
              allEmployees={allEmployees}
              isAdmin={canManageTeam}
            />
          </DialogContent>
        </Dialog>

        <div className="w-px h-6 bg-border" />

        {/* ── Bitácora ── */}
        <Dialog>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 hover:bg-muted/50 rounded-lg px-2 py-1.5 transition-colors">
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Bitácora</span>
              {logEntries.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {logEntries.length}
                </span>
              )}
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bitácora del proyecto</DialogTitle>
            </DialogHeader>
            <ProjectLog
              projectId={projectId}
              initialEntries={logEntries}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
            />
          </DialogContent>
        </Dialog>

        {/* ── Finances ── */}
        {finances && (
          <>
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-4">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Valor </span>
                  <span className="font-semibold">{formatCurrency(finances.projectValue)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Cobrado </span>
                  <span className="font-semibold text-success">{formatCurrency(finances.totalIncome)}</span>
                </div>
                {finances.accountsReceivable > 0 && (
                  <div>
                    <span className="text-muted-foreground">Por cobrar </span>
                    <span className="font-semibold text-warning">{formatCurrency(finances.accountsReceivable)}</span>
                  </div>
                )}
                {finances.monthlyFee && (
                  <div>
                    <span className="text-muted-foreground">Fee </span>
                    <span className="font-semibold">{formatCurrency(finances.monthlyFee)}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
