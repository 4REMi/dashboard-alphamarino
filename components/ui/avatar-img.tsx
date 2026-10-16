import Image from "next/image"

// Foto de perfil optimizada: next/image la sirve al tamaño en que se ve (no
// la original de megas) y con caché. Solo para URLs de Supabase Storage;
// cualquier otra cae a <img> normal.
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""

export function AvatarImg({ src, alt, size = 32, className }: { src: string; alt: string; size?: number; className?: string }) {
  if (!SUPA || !src.startsWith(SUPA)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />
  }
  return <Image src={src} alt={alt} width={size} height={size} sizes={`${size}px`} className={className} />
}
