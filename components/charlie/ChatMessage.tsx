import ReactMarkdown from "react-markdown"
import { CharlieAvatar } from "./CharlieAvatar"

type Role = "user" | "assistant"

type Props = {
  role: Role
  text: string
}

export function ChatMessage({ role, text }: Props) {
  const isUser = role === "user"
  return (
    <div
      className={`flex items-end gap-2 charlie-message-in ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && <CharlieAvatar size={32} />}
      <div
        className={`
          max-w-[85%] md:max-w-[70%]
          px-4 py-3 md:px-5 md:py-4
          rounded-md
          text-[15px] leading-6
          shadow-charlie-sm
          ${
            isUser
              ? "bg-white text-charcoal border border-light-grey rounded-br-sm whitespace-pre-wrap"
              : "bg-soft-mint text-charcoal rounded-bl-sm"
          }
        `}
      >
        {isUser ? (
          text
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => (
                <strong className="font-semibold text-charcoal">{children}</strong>
              ),
              a: ({ children, href }) => (
                <a
                  href={href}
                  className="text-teal underline underline-offset-2 hover:text-teal-hover"
                >
                  {children}
                </a>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-outside ml-5 space-y-1.5 my-2">{children}</ol>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-outside ml-5 space-y-1 my-2">{children}</ul>
              ),
              li: ({ children }) => <li className="pl-1">{children}</li>,
              code: ({ children }) => (
                <code className="rounded-sm bg-white/70 px-1 py-0.5 text-[13px] font-mono">
                  {children}
                </code>
              ),
              h1: ({ children }) => (
                <h3 className="font-display text-lg font-semibold mt-2 mb-1">{children}</h3>
              ),
              h2: ({ children }) => (
                <h3 className="font-display text-base font-semibold mt-2 mb-1">{children}</h3>
              ),
              h3: ({ children }) => (
                <h4 className="font-display text-base font-semibold mt-2 mb-1">{children}</h4>
              ),
            }}
          >
            {text}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}