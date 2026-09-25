"use client";

import { useChat } from "@ai-sdk/react";
import { Fragment, useEffect, useRef, useTransition } from "react";
import { confirmProfile, updateOnboardingStatus } from "@/app/actions";
import { ChatHeader, HeaderMenu } from "./chat/chat-header";
import { Composer, type ComposerHandle } from "./chat/composer";
import { Message } from "./chat/message";
import { SiteCard } from "./chat/site-card";
import { ThinkingIndicator } from "./chat/thinking-indicator";
import { useOnboardingChat, useWorkspace } from "./workspace/workspace-provider";

export function OnboardingChat() {
  const chat = useOnboardingChat();
  const { workspace } = useWorkspace();
  const { messages, sendMessage, status, error } = useChat({ chat });
  const busy = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const [, startTransition] = useTransition();

  const { crawl } = workspace;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, crawl?.status, crawl?.pages.length]);

  // The site card sits right after the message that gave the URL.
  const siteCard = crawl && (
    <SiteCard
      crawl={crawl}
      onConfirm={() => startTransition(() => confirmProfile(workspace.id))}
      onFix={() => composer.current?.setDraft("Actually, ")}
    />
  );
  const siteCardAfter = messages.some((m) => m.id === crawl?.afterMessageId) ? crawl?.afterMessageId : null;

  const send = (text: string) => sendMessage({ text });
  const lastAssistant = messages.findLast((m) => m.role === "assistant");
  const last = messages.at(-1);
  // From send until the first words of the reply stream in.
  const thinking =
    status === "submitted" ||
    (status === "streaming" && !(last?.role === "assistant" && last.parts.some((p) => p.type === "text" && p.text)));
  const setStatus = (s: "active" | "completed" | "skipped") =>
    startTransition(() => updateOnboardingStatus(workspace.id, s));

  const menu =
    workspace.onboarding_status === "active"
      ? [
          { label: "Mark as done", onSelect: () => setStatus("completed") },
          { label: "Skip tutorial", onSelect: () => setStatus("skipped") },
        ]
      : [{ label: "Resume tutorial", onSelect: () => setStatus("active") }];

  return (
    <div className="flex h-full flex-col">
      <ChatHeader title="Getting Started" actions={<HeaderMenu items={menu} />} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[702px] space-y-6 px-4 pt-5 pb-6 text-[14px] leading-[21px]">
          {messages.map((message) => (
            <Fragment key={message.id}>
              <Message
                message={message}
                onReply={!busy && message.id === lastAssistant?.id && lastAssistant === messages.at(-1) ? send : undefined}
              />
              {message.id === siteCardAfter && siteCard}
            </Fragment>
          ))}
          {!siteCardAfter && siteCard}
          {thinking && <ThinkingIndicator />}
          {error && (
            <p className="px-2 text-[13px] text-red-600">
              Something went wrong.{" "}
              <button type="button" className="underline" onClick={() => chat.regenerate()}>
                Try again
              </button>
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[702px] px-4 pb-[26px]">
        <Composer
          ref={composer}
          disabled={busy}
          onSend={send}
          placeholder={
            workspace.entry.website.status === "unknown"
              ? "Paste your URL or describe your business"
              : "Type your message..."
          }
        />
      </div>
    </div>
  );
}
