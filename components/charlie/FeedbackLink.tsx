type Props = {
  href?: string
}

export function FeedbackLink({ href = "#feedback" }: Props) {
  return (
    <p className="text-center text-xs text-slate mt-3">
      Your experience with Charlie is important to us.{" "}
      <a
        href={href}
        className="text-teal font-medium underline underline-offset-2 hover:text-teal-hover"
      >
        Share your feedback
      </a>
      .
    </p>
  )
}
