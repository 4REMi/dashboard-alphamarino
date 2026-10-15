"use client"

import { useRef, useEffect } from "react"

type AutoTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  // Acceso opcional al <textarea> (ej. para insertar formato en la selección).
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
}

/**
 * Textarea that grows automatically with its content.
 * Accepts `rows` to set the starting min-height (rows × 1.5rem).
 * Handles both uncontrolled (defaultValue) and controlled (value) usage,
 * including external updates like AI-generated content.
 */
export function AutoTextarea({ rows, style, onInput, value, textareaRef, ...props }: AutoTextareaProps) {
  const innerRef = useRef<HTMLTextAreaElement>(null)
  const ref = textareaRef ?? innerRef

  function resize() {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    // + bordes: con box-sizing border-box, scrollHeight no los incluye.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`
  }

  // Resize on mount — handles pre-filled defaultValue / edit modals. En un
  // modal recién abierto el ancho aún no es el final (animación, fuentes),
  // así que se mide de nuevo en el siguiente frame y cada vez que cambia el
  // ancho; si no, un texto largo quedaba cortado sin poder hacer scroll.
  useEffect(() => {
    resize()
    const raf = requestAnimationFrame(resize)
    const el = ref.current
    let lastWidth = el?.offsetWidth ?? 0
    const ro = typeof ResizeObserver !== "undefined" && el
      ? new ResizeObserver(() => { if (el.offsetWidth !== lastWidth) { lastWidth = el.offsetWidth; resize() } })
      : null
    if (el && ro) ro.observe(el)
    document.fonts?.ready.then(resize).catch(() => {})
    return () => { cancelAnimationFrame(raf); ro?.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resize when controlled value changes externally (e.g. AI generation)
  useEffect(() => { if (value !== undefined) resize() }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onInput={(e) => { resize(); onInput?.(e) }}
      style={{
        minHeight: rows ? `${rows * 1.5}rem` : "2.5rem",
        // Red de seguridad: si la medida falla, se puede desplazar dentro
        // en vez de quedar cortado (con la medida correcta no hay barra).
        overflowY: "auto",
        resize: "none",
        ...style,
      }}
      {...props}
    />
  )
}
