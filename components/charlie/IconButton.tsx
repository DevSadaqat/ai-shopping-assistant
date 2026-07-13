import type { ButtonHTMLAttributes, ReactNode } from "react"

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  variant?: "ghost" | "solid"
  children: ReactNode
}

export function IconButton({
  label,
  variant = "ghost",
  className = "",
  children,
  ...rest
}: Props) {
  const styles =
    variant === "solid"
      ? "bg-teal text-white hover:bg-teal-hover disabled:bg-cool-grey"
      : "bg-transparent text-slate hover:bg-soft-mint hover:text-charcoal"
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`
        inline-flex items-center justify-center
        w-11 h-11 rounded-full
        transition-colors duration-200
        disabled:opacity-40 disabled:cursor-not-allowed
        ${styles}
        ${className}
      `}
      {...rest}
    >
      {children}
    </button>
  )
}
