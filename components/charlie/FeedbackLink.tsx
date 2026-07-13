type Props = {
  href?: string
}

const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfWonb_JIzfA9Dz2Uj5GFWGnkVBsiYPoUtuUiAPpgJPpa83SA/viewform?usp=publish-editor"

export function FeedbackLink({ href = FEEDBACK_FORM_URL }: Props) {
  return (
    <p className="text-center text-xs text-slate mt-3">
      Your experience with Charlie is important to us.{" "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-teal font-medium underline underline-offset-2 hover:text-teal-hover"
      >
        Share your feedback
      </a>
      .
    </p>
  )
}
