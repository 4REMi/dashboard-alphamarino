"use client"

import { useState, useTransition } from "react"
import type { AdBoard } from "@/lib/types"
import { createBoard, updateBoard, deleteBoard } from "@/lib/actions/ad-lab"
import { FolderOpen, Plus, MoreHorizontal, Pencil, Trash2, Loader2, X, Check, LayoutGrid } from "lucide-react"
import Link from "next/link"

interface Props {
  boards: AdBoard[]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}

export function BoardsGrid({ boards: initialBoards }: Props) {
  const [boards, setBoards] = useState(initialBoards)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = (fd.get("name") as string).trim()
    if (!name) return
    startTransition(async () => {
      const board = await createBoard(fd)
      setBoards((prev) => [board, ...prev])
      setShowCreate(false)
    })
  }

  function handleUpdate(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateBoard(id, fd)
      setBoards((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, name: (fd.get("name") as string).trim(), description: (fd.get("description") as string)?.trim() || null }
            : b
        )
      )
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este board? Se quitarán todos los anuncios guardados en él.")) return
    startTransition(async () => {
      await deleteBoard(id)
      setBoards((prev) => prev.filter((b) => b.id !== id))
    })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <FolderOpen className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Boards</h1>
              <p className="text-sm text-muted-foreground">
                Colecciones de anuncios guardados
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo board
          </button>
        </div>

        {/* Inline create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mt-4 flex gap-2 items-start">
            <div className="flex-1 space-y-2">
              <input
                name="name"
                autoFocus
                required
                placeholder="Nombre del board…"
                className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <input
                name="description"
                placeholder="Descripción (opcional)"
                className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Crear
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="h-9 px-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <FolderOpen className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Sin boards todavía</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Crea un board para guardar y organizar anuncios de la competencia.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Crear primer board
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {boards.map((board) =>
              editingId === board.id ? (
                <form
                  key={board.id}
                  onSubmit={(e) => handleUpdate(board.id, e)}
                  className="rounded-xl border border-primary/50 bg-card p-4 space-y-2"
                >
                  <input
                    name="name"
                    defaultValue={board.name}
                    autoFocus
                    required
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <input
                    name="description"
                    defaultValue={board.description ?? ""}
                    placeholder="Descripción (opcional)"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  key={board.id}
                  className="group relative rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all duration-150"
                >
                  {/* Cover / thumbnail area */}
                  <Link href={`/ad-lab/boards/${board.id}`} className="block">
                    <div className="aspect-[16/9] bg-muted relative overflow-hidden rounded-t-xl">
                      {((board as any).cover_ad?.cached_image_url ?? (board as any).cover_ad?.image_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(board as any).cover_ad.cached_image_url ?? (board as any).cover_ad.image_url}
                          alt={board.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <LayoutGrid className="w-8 h-8 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Ad count badge */}
                      <div className="absolute bottom-2 left-2">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
                          {board.ad_count ?? 0} anuncio{board.ad_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Body */}
                  <div className="p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/ad-lab/boards/${board.id}`}
                        className="text-sm font-semibold hover:text-primary transition-colors truncate block"
                      >
                        {board.name}
                      </Link>
                      {board.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{board.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                        {fmtDate(board.created_at)}
                      </p>
                    </div>

                    {/* Menu */}
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuId((v) => v === board.id ? null : board.id) }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuId === board.id && (
                        <div
                          className="absolute right-0 top-full mt-1 w-36 bg-popover border border-border rounded-xl shadow-lg z-20 overflow-hidden py-1"
                          onMouseLeave={() => setMenuId(null)}
                        >
                          <button
                            onClick={() => { setEditingId(board.id); setMenuId(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            Editar
                          </button>
                          <button
                            onClick={() => { handleDelete(board.id); setMenuId(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
