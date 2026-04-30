import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"
import { getBoards, getBoardAds } from "@/lib/actions/ad-lab"
import { BoardDetail } from "@/components/ad-lab/board-detail"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BoardDetailPage({ params }: PageProps) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, permissions")
    .eq("id", user.id)
    .single()

  const profile = profileData as Pick<Profile, "id" | "full_name" | "email" | "role" | "permissions"> | null
  if (!can(profile, "access_ad_lab")) redirect("/")

  const [boards, ads] = await Promise.all([
    getBoards(),
    getBoardAds(id),
  ])

  const board = boards.find((b) => b.id === id)
  if (!board) notFound()

  return (
    <div className="flex flex-col h-full">
      <BoardDetail board={board} initialAds={ads} boards={boards} />
    </div>
  )
}
