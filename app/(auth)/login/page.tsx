export const dynamic = "force-dynamic"

import { getWorkspaceSettings } from "@/lib/actions/workspace"
import { LoginForm } from "./login-form"

export default async function LoginPage() {
  const settings = await getWorkspaceSettings().catch(() => ({ logo_url: null }))
  return <LoginForm logoUrl={settings.logo_url} />
}
