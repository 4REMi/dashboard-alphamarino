"use client"

import { useRef, useEffect } from "react"

type AutoTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * Textarea that grows automatically with its content.
 * Accepts `rows` to set the starting min-height (rows × 1.5rem).
 * Handles both uncontrolled (defaultValue) and controlled (value) usage,
 * including external updates like AI-generated content.
 */
export function AutoTextarea({ rows, style, onInput, value, ...props }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function resize() {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }

  // Resize on mount — handles pre-filled defaultValue / edit modals
  useEffect(() => { resize() }, [])

  // Resize when controlled value changes externally (e.g. AI generation)
  useEffect(() => { if (value !== undefined) resize() }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onInput={(e) => { resize(); onInput?.(e) }}
      style={{
        minHeight: rows ? `${rows * 1.5}rem` : "2.5rem",
        overflow: "hidden",
        resize: "none",
        ...style,
      }}
      {...props}
    />
  )
}
