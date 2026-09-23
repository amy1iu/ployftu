"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import type { OnboardingUIMessage } from "@/lib/ai/agent";

export function OnboardingChat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat<OnboardingUIMessage>();
  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col px-4">
      <header className="py-6">
        <h1 className="text-xl font-semibold">Welcome 👋</h1>
        <p className="text-sm text-zinc-500">
          Tell us what you&apos;re working on and we&apos;ll point you to the right place.
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                message.role === "user"
                  ? "max-w-[85%] rounded-2xl bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "max-w-[85%] space-y-3"
              }
            >
              {message.parts.map((part, i) => {
                const key = `${message.id}-${i}`;
                switch (part.type) {
                  case "text":
                    return (
                      <p key={key} className="whitespace-pre-wrap">
                        {part.text}
                      </p>
                    );
                  case "tool-recommendProducts":
                    if (part.state !== "output-available") {
                      return (
                        <p key={key} className="text-sm text-zinc-500">
                          Finding the best fit…
                        </p>
                      );
                    }
                    return (
                      <div key={key} className="grid gap-2">
                        {part.output.map((rec) => (
                          <div
                            key={rec.productId}
                            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                          >
                            <p className="font-medium">{rec.product.name}</p>
                            <p className="text-sm text-zinc-500">{rec.reason}</p>
                          </div>
                        ))}
                      </div>
                    );
                }
              })}
            </div>
          </div>
        ))}
      </div>

      <form
        className="pb-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          className="w-full rounded-xl border border-zinc-300 bg-transparent px-4 py-3 outline-none focus:border-zinc-500 dark:border-zinc-700"
          value={input}
          placeholder={messages.length ? "Reply…" : "What brings you here today?"}
          onChange={(e) => setInput(e.currentTarget.value)}
          disabled={busy}
        />
      </form>
    </div>
  );
}
