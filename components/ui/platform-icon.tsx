import { SiMeta, SiTiktok, SiGoogleads, SiPinterest, SiYoutube, SiSnapchat, SiX, SiReddit, SiMetaHex, SiGoogleadsHex, SiPinterestHex, SiYoutubeHex, SiSnapchatHex, SiRedditHex } from "@icons-pack/react-simple-icons"

// Logos oficiales de plataformas (mismo paquete que ya usa Ad Lab,
// @icons-pack/react-simple-icons). Logos negros (TikTok, X) usan
// currentColor para verse en modo oscuro. LinkedIn no está en Simple Icons
// (retirado por marca): cae a la inicial.

type IconCmp = typeof SiMeta
const ICONS: Record<string, { Icon: IconCmp; color: string | null }> = {
  meta: { Icon: SiMeta, color: SiMetaHex },
  tiktok: { Icon: SiTiktok, color: null },
  googleads: { Icon: SiGoogleads, color: SiGoogleadsHex },
  pinterest: { Icon: SiPinterest, color: SiPinterestHex },
  youtube: { Icon: SiYoutube, color: SiYoutubeHex },
  snapchat: { Icon: SiSnapchat, color: SiSnapchatHex },
  x: { Icon: SiX, color: null },
  reddit: { Icon: SiReddit, color: SiRedditHex },
}

// Nombre libre del canal ("Meta Ads", "TikTok", "Google", "Instagram"…) → clave.
export function platformSlug(channel: string): string | null {
  const c = channel.toLowerCase()
  if (/meta|facebook|instagram|\bfb\b|\big\b/.test(c)) return "meta"
  if (c.includes("tiktok")) return "tiktok"
  if (c.includes("youtube")) return "youtube"
  if (c.includes("google")) return "googleads"
  if (c.includes("pinterest")) return "pinterest"
  if (c.includes("snap")) return "snapchat"
  if (c.includes("reddit")) return "reddit"
  if (c === "x" || c.includes("twitter")) return "x"
  return null
}

export function PlatformIcon({ channel, size = 14, className }: { channel: string; size?: number; className?: string }) {
  const slug = platformSlug(channel)
  const entry = slug ? ICONS[slug] : null
  if (!entry) {
    return (
      <span title={channel} className={className} style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.7, fontWeight: 700, borderRadius: 3, background: "var(--muted, #e5e7eb)" }}>
        {channel.trim().charAt(0).toUpperCase()}
      </span>
    )
  }
  const { Icon, color } = entry
  return <Icon size={size} color={color ?? "currentColor"} title={channel} className={className} />
}
