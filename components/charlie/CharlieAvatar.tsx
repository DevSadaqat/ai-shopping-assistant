import Image from "next/image"

type Props = {
  size?: number
  className?: string
}

export function CharlieAvatar({ size = 32, className }: Props) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-soft-mint shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/charlie/icon.png"
        alt=""
        width={size - 4}
        height={size - 4}
        aria-hidden="true"
      />
    </span>
  )
}
