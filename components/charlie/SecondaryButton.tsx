import type { ButtonHTMLAttributes } from "react"

type Props = ButtonHTMLAttributes<HTMLButtonElement>

export function SecondaryButton({ className = "", children, ...rest }: Props) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        rounded-md bg-white text-teal
        border border-light-grey
        px-5 min-h-[44px]
        text-sm font-semibold
        transition-colors duration-200
        hover:bg-soft-mint hover:border-mint
        disabled:opacity-40 disabled:cursor-not-allowed
        ${className}
      `}
      {...rest}
    >
      {children}
    </button>
  )
}
