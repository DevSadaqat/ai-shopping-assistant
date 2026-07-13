"use client"

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react"
import { IconButton } from "./IconButton"
import { PlusIcon, SendIcon } from "./icons"

type Props = {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "What can I help you with?",
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const canSend = value.trim().length > 0 && !disabled

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSend) return
    onSubmit()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSubmit()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="
        flex items-end gap-2
        bg-white
        border border-light-grey
        rounded-lg
        shadow-charlie-sm
        px-2 py-2
        focus-within:border-teal
        focus-within:ring-2 focus-within:ring-teal/20
        transition-colors
      "
    >
      <IconButton label="Add attachment" disabled>
        <PlusIcon size={20} />
      </IconButton>

      <label htmlFor="charlie-composer" className="sr-only">
        Message Charlie
      </label>
      <textarea
        id="charlie-composer"
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Message Charlie"
        className="
          flex-1 resize-none bg-transparent
          text-charcoal placeholder:text-cool-grey
          text-[15px] leading-6
          py-2 px-1
          outline-none focus:outline-none focus-visible:outline-none
          disabled:opacity-60
        "
      />

      <IconButton
        label="Send message"
        variant="solid"
        type="submit"
        disabled={!canSend}
        onClick={handleSubmit}
      >
        <SendIcon size={18} />
      </IconButton>
    </form>
  )
}