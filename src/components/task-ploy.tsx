"use client";

import type { UIMessage } from "ai";
import { useEffect, useOptimistic, useRef, useTransition } from "react";
import { markPloyRead, sendPloyMessage } from "@/app/actions";
import { textOf } from "@/lib/ai/onboarding/text";
import { ChatHeader } from "./chat/chat-header";
import { Composer } from "./chat/composer";
import { Message } from "./chat/message";
import { TaskActions } from "./chat/task-actions";
import { ThinkingIndicator } from "./chat/thinking-indicator";
import { useWorkspace } from "./workspace/workspace-provider";

const statusLabel = { idle: "Stopped", running: "Running", done: "Done", live: "Live" };

// A task ploy: reads like a chat. The kickoff, plan, and deliverable are posted
// by the task runner; the composer gets a short contextual reply.
export function TaskPloy({ id }: { id: string }) {
  const { ploys } = useWorkspace();
  const ploy = ploys.find((p) => p.id === id && p.kind === "task");
  const [replying, startReply] = useTransition();
  // Their message shows immediately, until Realtime delivers the real one.
  const [messages, addPending] = useOptimistic(ploy?.messages ?? [], (current: UIMessage[], text: string) =>
    current.slice(-2).some((m) => m.role === "user" && textOf(m) === text)
      ? current
      : [...current, { id: "pending", role: "user" as const, parts: [{ type: "text" as const, text }] }],
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  // Opening a finished task counts as seeing it (clears the pop-up and the bold).
  const unreadAndDone = ploy?.unread && ploy.status === "done";
  useEffect(() => {
    if (unreadAndDone) void markPloyRead(id);
  }, [id, unreadAndDone]);

  const messageCount = messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount, replying]);

  if (!ploy) {
    return (
      <div className="flex h-full items-center justify-center text-[14px] text-subtle">
        This ploy isn&apos;t in the current workspace.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        title={
          <span className="flex items-center gap-2.5">
            {ploy.title}
            <span className="rounded-full bg-active px-2 py-0.5 text-[11px] text-muted">{statusLabel[ploy.status]}</span>
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[702px] space-y-6 px-4 pt-5 pb-6 text-[14px] leading-[21px]">
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            {replying && messages.at(-1)?.role === "user" && <ThinkingIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[702px] px-4 pb-[26px]">
          <TaskActions ploy={ploy} />
          <Composer
            disabled={replying}
            placeholder={ploy.status === "running" ? "Ask about this while it runs..." : "Ask about this, or what to change..."}
            onSend={(text) =>
              startReply(async () => {
                addPending(text);
                await sendPloyMessage(ploy.id, text);
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
