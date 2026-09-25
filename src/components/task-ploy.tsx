"use client";

import { ChatHeader } from "./chat/chat-header";
import { Composer } from "./chat/composer";
import { Message } from "./chat/message";
import { useWorkspace } from "./workspace/workspace-provider";

const statusLabel = { idle: "Not started", running: "Running", done: "Done", live: "Live" };

// A task ploy: looks and reads like a chat. Its content is scripted (phase 3);
// replies from the composer land in phase 3 too.
export function TaskPloy({ id }: { id: string }) {
  const { ploys } = useWorkspace();
  const ploy = ploys.find((p) => p.id === id && p.kind === "task");

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
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[702px] space-y-6 px-4 pt-5 pb-6 text-[14px] leading-[21px]">
          {ploy.messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[702px] px-4 pb-[26px]">
        <Composer disabled onSend={() => {}} />
      </div>
    </div>
  );
}
