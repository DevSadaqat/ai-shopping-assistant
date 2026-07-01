"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai"
import { useState, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"

const transport = new DefaultChatTransport({ api: "/api/chat" })

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat({ transport })
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const isLoading = status === "submitted" || status === "streaming"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input.trim() })
    setInput("")
  }

  function getMessageText(m: UIMessage): string {
    return m.parts.filter(isTextUIPart).map((p) => p.text).join("")
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-orange-600 text-white px-6 py-4 shadow-md shrink-0">
        <h1 className="text-xl font-bold tracking-tight">Shopping Assistant</h1>
        <p className="text-orange-200 text-sm mt-0.5">
          Hardware &amp; home-improvement
        </p>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-16 space-y-2">
            <p className="text-lg font-medium text-gray-500">
              How can I help with your project?
            </p>
            <p className="text-sm">
              Try: &quot;Find me an 18V brushless drill under $200&quot; &middot; &quot;How do I tile a bathroom floor?&quot; &middot; &quot;Is the Makita drill in stock?&quot;
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`rounded-2xl px-4 py-3 max-w-[80%] text-sm leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "bg-orange-600 text-white rounded-br-sm whitespace-pre-wrap"
                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"
              }`}
            >
              {m.role === "user" ? (
                getMessageText(m)
              ) : (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    ol: ({ children }) => <ol className="list-decimal list-outside ml-4 space-y-2">{children}</ol>,
                    ul: ({ children }) => <ul className="list-disc list-outside ml-4 space-y-1">{children}</ul>,
                    li: ({ children }) => <li>{children}</li>,
                  }}
                >
                  {getMessageText(m)}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="border-t border-gray-200 bg-white px-4 py-4 shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-3xl mx-auto">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about products, how-tos, or stock availability…"
            disabled={isLoading}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  )
}
