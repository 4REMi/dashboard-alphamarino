const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export async function sendMessage(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  })
}

export type TelegramImageMediaType = "image/jpeg" | "image/png" | "image/webp"

// Descarga una foto enviada al bot (por file_id) y la regresa en base64 para mandarla a Claude.
export async function getTelegramFileBase64(fileId: string): Promise<{ base64: string; mediaType: TelegramImageMediaType }> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`)
  const fileData = await fileRes.json()
  const filePath = fileData?.result?.file_path as string | undefined
  if (!filePath) throw new Error("No se pudo obtener la foto de Telegram")

  const bytesRes = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`)
  const arrayBuffer = await bytesRes.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString("base64")

  const ext = filePath.split(".").pop()?.toLowerCase()
  const mediaType: TelegramImageMediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"

  return { base64, mediaType }
}
