"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Anchor } from "lucide-react"

interface Props {
  logoUrl: string | null
}

export function LoginForm({ logoUrl }: Props) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push("/")
    router.refresh()
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "#06060f" }}
    >
      {/* Glow blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          style={{
            position: "absolute",
            left: "-5%",
            top: "15%",
            width: "45%",
            height: "65%",
            background: "radial-gradient(ellipse, rgba(0,210,195,0.22) 0%, transparent 70%)",
            filter: "blur(50px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-5%",
            top: "15%",
            width: "45%",
            height: "65%",
            background: "radial-gradient(ellipse, rgba(30,90,255,0.22) 0%, transparent 70%)",
            filter: "blur(50px)",
          }}
        />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center mb-4"
            style={logoUrl ? {} : { background: "#1e5bff" }}>
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Logo"
                width={56}
                height={56}
                className="object-contain w-full h-full"
                unoptimized
              />
            ) : (
              <Anchor className="w-7 h-7 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Alpha Marino</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
            Dashboard de Gestión
          </p>
        </div>

        {/* Form card */}
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div>
            <h2 className="text-lg font-semibold text-white">Iniciar Sesión</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              Ingresa tus credenciales para acceder
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>
                Correo Electrónico
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500"
              />
            </div>

            {error && (
              <div className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}>
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full font-semibold"
              style={{ background: "#1e5bff" }}
              disabled={loading}
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
