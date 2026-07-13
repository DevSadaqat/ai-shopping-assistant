"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai"
import { useEffect, useRef, useState } from "react"
import { AssistantHeader } from "@/components/charlie/AssistantHeader"
import { ChatComposer } from "@/components/charlie/ChatComposer"
import { ChatMessage } from "@/components/charlie/ChatMessage"
import { FeedbackLink } from "@/components/charlie/FeedbackLink"
import { LoadingIndicator } from "@/components/charlie/LoadingIndicator"
import { WelcomeState } from "@/components/charlie/WelcomeState"

const transport = new DefaultChatTransport({ api: "/api/chat" })

type StatusData = { label: string; stage: string }

type CharlieUIMessage = UIMessage<unknown, { status: StatusData }>

function getMessageText(m: UIMessage): string {
  return m.parts.filter(isTextUIPart).map((p) => p.text).join("")
}

function assistantHasText(messages: UIMessage[]): boolean {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "assistant") return false
  return getMessageText(last).length > 0
}

export default function CharliePage() {
  const [agentStatus, setAgentStatus] = useState<StatusData | null>(null)

  const { messages, sendMessage, status, setMessages } = useChat<CharlieUIMessage>({
    transport,
    onData: (part) => {
      if (part.type === "data-status") {
        setAgentStatus(part.data)
      }
    },
    onFinish: () => {
      setAgentStatus(null)
    },
    onError: () => {
      setAgentStatus(null)
    },
  })

  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const isLoading = status === "submitted" || status === "streaming"
  const isEmpty = messages.length === 0

  // Show the status bubble only while we're waiting; once the assistant has
  // actually started writing text, the message bubble takes over.
  const showLoadingIndicator = isLoading && !assistantHasText(messages)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, showLoadingIndicator, agentStatus])

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    setAgentStatus({ label: "Thinking", stage: "start" })
    sendMessage({ text: trimmed })
    setInput("")
  }

  function handleQuickAction(prompt: string) {
    if (isLoading) return
    setAgentStatus({ label: "Thinking", stage: "start" })
    sendMessage({ text: prompt })
  }

  function handleRefresh() {
    if (isLoading) return
    setMessages([])
    setAgentStatus(null)
    setInput("")
  }

  return (
    <div className="flex flex-col h-dvh bg-off-white">
      <AssistantHeader onRefresh={handleRefresh} />

      <main
        className="
          flex-1 overflow-y-auto
          w-full max-w-240 mx-auto
          px-4 md:px-6
        "
      >
        {isEmpty ? (
          <WelcomeState onQuickAction={handleQuickAction} />
        ) : (
          <div className="py-6 space-y-4">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                role={m.role === "user" ? "user" : "assistant"}
                text={getMessageText(m)}
              />
            ))}
            {showLoadingIndicator && (
              <LoadingIndicator label={agentStatus?.label ?? "Thinking"} />
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <footer
        className="
          shrink-0 bg-off-white border-t border-light-grey
          pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]
        "
      >
        <div className="w-full max-w-240 mx-auto px-4 md:px-6">
          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            disabled={isLoading}
          />
          <FeedbackLink />
        </div>
      </footer>
    </div>
  )
}