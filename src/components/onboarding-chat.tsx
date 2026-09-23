"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef } from "react";
import type { OnboardingUIMessage } from "@/lib/ai/agent";
import { currentUser } from "@/lib/mock-data";
import { ChatHeader } from "./chat/chat-header";
import { Composer } from "./chat/composer";
import { Message } from "./chat/message";

// Wording is a placeholder — tweak freely.
const greeting: OnboardingUIMessage = {
  id: "greeting",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: `Hey ${currentUser.firstName}, welcome to your new workspace! I can help you design and build on-brand web pages, campaigns, and marketing content — and an autonomous growth engine that proactively analyzes your site and optimizes your marketing without you having to do all the work yourself.

To get started: what's your goal? Tell me what you want to move for the business — more leads, a new audience, converting the pipeline you already have — and I'll take it from there.`,
    },
  ],
};

export function OnboardingChat() {
  const { messages, sendMessage, status } = useChat<OnboardingUIMessage>({
    messages: [greeting],
  });
  const busy = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <ChatHeader title="Getting Started" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[702px] space-y-6 px-4 pt-5 pb-6 text-[14px] leading-[21px]">
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[702px] px-4 pb-[26px]">
        <Composer disabled={busy} onSend={(text) => sendMessage({ text })} />
      </div>
    </div>
  );
}
