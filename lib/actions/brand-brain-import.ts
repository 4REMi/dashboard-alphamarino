"use server"

import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"
import type { BrandBrain } from "@/lib/types"

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
}

function apifyToken() {
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error("APIFY_API_TOKEN no configurado")
  return token
}

async function runApifyActor(actorId: string, input: Record<string, unknown>): Promise<unknown[]> {
  const token = apifyToken()
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(input),
      cache:   "no-store",
    }
  )
  if (!res.ok) throw new Error(`Apify error ${res.status}: ${await res.text().catch(() => "")}`)
  return res.json()
}

async function analyzeWithClaude(content: string): Promise<Partial<BrandBrain>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
  const client = new Anthropic({ apiKey })

  const prompt = `Analyze the following brand content and extract a Brand Brain profile.
Return ONLY a valid JSON object (no markdown, no extra text) with these exact fields:
{
  "name": "string",
  "industry": "string",
  "tone_of_voice": "string (describe the brand voice in 5-10 words)",
  "description": "string (brief brand description, 1-2 sentences)",
  "usps": ["string"],
  "key_benefits": ["string"],
  "pain_points": ["string"],
  "target_audience": "string",
  "ctas": ["string"],
  "key_features": ["string"]
}

Rules:
- usps, key_benefits, pain_points, ctas, key_features: 3-5 items each, no more
- If a field cannot be inferred, use [] or ""
- Match the language of the brand content

CONTENT:
${content}`

  const msg = await client.messages.create({
    model:      "claude-opus-4-7",
    max_tokens: 1024,
    messages:   [{ role: "user", content: prompt }],
  })

  const raw = (msg.content[0] as { type: string; text: string }).text.trim()
  return JSON.parse(raw) as Partial<BrandBrain>
}

export async function importBrainFromInstagram(username: string): Promise<Partial<BrandBrain>> {
  await assertAuth()

  const handle     = username.replace(/^@/, "").trim()
  const profileUrl = `https://www.instagram.com/${handle}/`

  const [profileData, postsData] = await Promise.all([
    runApifyActor("apify~instagram-profile-scraper", { directUrls: [profileUrl] }),
    runApifyActor("apify~instagram-scraper", {
      directUrls:  [profileUrl],
      resultsType: "posts",
      resultsLimit: 15,
    }),
  ])

  const profile = profileData[0] as Record<string, unknown> | undefined
  const posts   = postsData as Record<string, unknown>[]

  const bioSection = [
    `INSTAGRAM PROFILE:`,
    `Name: ${profile?.fullName ?? handle}`,
    `Bio: ${profile?.biography ?? ""}`,
    `Business account: ${profile?.isBusinessAccount ? "Yes" : "No"}`,
    `Followers: ${profile?.followersCount ?? 0}`,
  ].join("\n")

  const captionsSection = posts
    .filter((p) => typeof p.caption === "string" && p.caption.trim())
    .slice(0, 15)
    .map((p, i) => `Post ${i + 1}: ${(p.caption as string).trim()}`)
    .join("\n\n")

  const hashtags = [...new Set(
    posts.flatMap((p) => (Array.isArray(p.hashtags) ? p.hashtags : []) as string[])
  )].slice(0, 30).join(", ")

  const content = [
    bioSection,
    captionsSection ? `\nRECENT POST CAPTIONS:\n${captionsSection}` : "",
    hashtags        ? `\nFREQUENT HASHTAGS: ${hashtags}` : "",
  ].filter(Boolean).join("\n\n")

  const draft = await analyzeWithClaude(content)

  if (profile?.profilePicUrl) draft.logo_url = profile.profilePicUrl as string
  if (!draft.name && profile?.fullName) draft.name = profile.fullName as string

  return draft
}

export async function importBrainFromWebsite(url: string): Promise<Partial<BrandBrain>> {
  await assertAuth()

  const res = await fetch(url, {
    signal:  AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AlphaMarino/1.0)" },
  })
  if (!res.ok) throw new Error(`No se pudo acceder al sitio (${res.status})`)

  const html = await res.text()
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000)

  return analyzeWithClaude(`WEBSITE URL: ${url}\n\nWEBSITE CONTENT:\n${text}`)
}
