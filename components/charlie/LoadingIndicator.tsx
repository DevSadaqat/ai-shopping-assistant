import { CharlieAvatar } from "./CharlieAvatar"

type Props = {
  /** Human-readable label of what the agent is currently doing. */
  label?: string
}

export function LoadingIndicator({ label = "Thinking" }: Props) {
  return (
    <div
      className="flex items-end gap-2 charlie-fade-in"
      aria-live="polite"
      aria-label={`Charlie is ${label.toLowerCase()}`}
    >
      <CharlieAvatar size={32} />
      <div
        className="
          bg-soft-mint text-charcoal
          rounded-md rounded-bl-sm
          px-4 py-3
          shadow-charlie-sm
          flex items-center gap-3
          min-h-11
        "
      >
        <span
          key={label}
          className="text-[14px] text-slate charlie-status-swap"
        >
          {label}
        </span>
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="w-1.5 h-1.5 bg-teal/70 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-teal/70 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-teal/70 rounded-full animate-bounce [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  )
}