"use client";

import { useChat } from "@ai-sdk/react";
import { useTransition } from "react";
import { updateOnboardingStatus } from "@/app/actions";
import { ChatHeader, HeaderMenu } from "./chat/chat-header";
import { withoutFailedTurn } from "@/lib/onboarding/trail";
import { Trail } from "./trail/trail";
import { useOnboardingChat, useWorkspace } from "./workspace/workspace-provider";

export function OnboardingChat() {
  const chat = useOnboardingChat();
  const { workspace } = useWorkspace();
  const { messages, sendMessage, setMessages, clearError, status } = useChat({ chat });
  const busy = status === "submitted" || status === "streaming";
  // A failed turn is set aside: the card they answered comes back, to try again or answer differently.
  const failed = status === "error";
  const shown = failed ? withoutFailedTurn(messages) : messages;
  const send = (message: Parameters<typeof sendMessage>[0]) => {
    if (failed) {
      setMessages(withoutFailedTurn(messages));
      clearError();
    }
    return sendMessage(message);
  };
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
        messages={shown}
        busy={busy}
        onAnswer={({ text, slot, value }) => send({ text, metadata: { slot, value } })}
        footer={
          failed && (
            <p role="alert" className="pb-6 text-center text-[13px] text-red-600">
              That didn&apos;t go through.{" "}
              {/* Sends the same answer again; answering the card anew works too. */}
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
