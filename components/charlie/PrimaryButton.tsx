import type { ButtonHTMLAttributes } from "react"

type Props = ButtonHTMLAttributes<HTMLButtonElement>

export function PrimaryButton({ className = "", children, ...rest }: Props) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        rounded-md bg-teal text-white
        px-5 min-h-[44px]
        text-sm font-semibold
        shadow-charlie-sm
        transition-colors duration-200
        hover:bg-teal-hover
        active:bg-teal-hover
        disabled:opacity-40 disabled:cursor-not-allowed
        focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2
        ${className}
      `}
      {...rest}
    >
      {children}
    </button>
  )
}