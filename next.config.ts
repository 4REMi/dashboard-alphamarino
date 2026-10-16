import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const supabaseHost = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname } catch { return null }
})()

const nextConfig: NextConfig = {
  // Avatares (y otras imágenes de Storage) servidos en tamaño real vía
  // next/image en lugar de la foto original.
  images: supabaseHost ? { remotePatterns: [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }] } : undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: "150mb",
    },
  },
}

export default withNextIntl(nextConfig)
