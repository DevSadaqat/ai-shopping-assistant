import Image from "next/image"

type Variant = "primary" | "icon" | "wordmark"

const SRC: Record<Variant, { src: string; ratio: number }> = {
  primary: { src: "/charlie/primary-logo.png", ratio: 3.2 },
  icon: { src: "/charlie/icon.png", ratio: 1 },
  wordmark: { src: "/charlie/wordmark.png", ratio: 4.5 },
}

type Props = {
  variant?: Variant
  height?: number
  className?: string
  priority?: boolean
}

export function CharlieLogo({
  variant = "primary",
  height = 48,
  className,
  priority,
}: Props) {
  const { src, ratio } = SRC[variant]
  return (
    <Image
      src={src}
      alt="Charlie"
      width={Math.round(height * ratio)}
      height={height}
      priority={priority}
      className={className}
    />
  )
}
