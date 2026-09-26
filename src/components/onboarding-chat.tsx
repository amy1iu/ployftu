"use client";

import { useChat } from "@ai-sdk/react";
import { useTransition } from "react";
import { updateOnboardingStatus } from "@/app/actions";
import { ChatHeader, HeaderMenu } from "./chat/chat-header";
import { Trail } from "./trail/trail";
import { useOnboardingChat, useWorkspace } from "./workspace/workspace-provider";

export function OnboardingChat() {
  const chat = useOnboardingChat();
  const { workspace } = useWorkspace();
  const { messages, sendMessage, status, error } = useChat({ chat });
  const busy = status === "submitted" || status === "streaming";
  const [, startTransition] = useTransition();

  const setStatus = (s: "active" | "completed" | "skipped") =>
    startTransition(() => updateOnboardingStatus(workspace.id, s));
  const menu =
    workspace.onboarding_status === "active"
      ? [
          { label: "Mark as done", onSelect: () => setStatus("completed") },
          { label: "Skip onboarding", onSelect: () => setStatus("skipped") },
        ]
      : [{ label: "Resume onboarding", onSelect: () => setStatus("active") }];

  return (
    <div className="flex h-full flex-col">
      <ChatHeader title="Getting Started" actions={<HeaderMenu items={menu} />} />
      <Trail
        messages={messages}
        busy={busy}
        onAnswer={({ text, slot, value }) => sendMessage({ text, metadata: { slot, value } })}
        onRedo={({ text, slot, value }) => sendMessage({ text, metadata: { slot, value, redo: true } })}
        onAsk={(text) => sendMessage({ text })}
        footer={
          error && (
            <p className="pb-6 text-center text-[13px] text-red-600">
              Something went wrong.{" "}
              <button type="button" className="underline" onClick={() => chat.regenerate()}>
                Try again
              </button>
            </p>
          )
        }
      />
    </div>
  );
}
