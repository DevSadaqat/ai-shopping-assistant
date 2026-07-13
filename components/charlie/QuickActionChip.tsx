import type { ButtonHTMLAttributes, ReactNode } from "react"

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode
  label: string
}

export function QuickActionChip({ icon, label, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={`
        group inline-flex items-center gap-3
        min-h-[44px] px-5 py-3
        rounded-pill
        bg-soft-mint text-charcoal
        text-sm font-medium
        border border-transparent
        transition-all duration-200
        hover:bg-mint hover:border-mint
        active:scale-[0.99]
        ${className}
      `}
      {...rest}
    >
      <span className="text-teal shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}
