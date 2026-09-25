"use client";

import { ArrowUp, Plus } from "lucide-react";
import { useImperativeHandle, useRef, useState, type Ref } from "react";

/** Lets a parent start a message for the user, e.g. "Actually, " after "Fix something". */
export type ComposerHandle = { setDraft: (text: string) => void };

export function Composer({
  onSend,
  disabled,
  placeholder = "Type your message...",
  ref,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ref?: Ref<ComposerHandle>;
}) {
  const [input, setInput] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    setDraft(text) {
      setInput(text);
      requestAnimationFrame(() => {
        textarea.current?.focus();
        textarea.current?.setSelectionRange(text.length, text.length);
      });
    },
  }));
  const canSend = input.trim().length > 0 && !disabled;

  function submit() {
    if (!canSend) return;
    onSend(input);
    setInput("");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex h-[109px] flex-col rounded-xl border border-border bg-surface px-3 pt-[15px] pb-2 shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
    >
      <textarea
        ref={textarea}
        autoFocus
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-transparent text-[14px] leading-[21px] outline-none placeholder:text-[#5c5c5c]"
      />
      <div className="flex items-center">
        {/* Attachments and agent picker are mocked for now. */}
        <button type="button" aria-label="Add" className="mx-1 text-[#3a3a3a]">
          <Plus size={18} strokeWidth={1.5} />
        </button>
        <span className="ml-4 text-[12px] text-[#3a3a3a]">Ploy Agent</span>
        <button
          type="submit"
          aria-label="Send"
          disabled={!canSend}
          className="ml-auto flex size-8 items-center justify-center rounded-full bg-[#0d0d0d] text-white disabled:bg-subtle"
        >
          <ArrowUp size={18} strokeWidth={1.5} />
        </button>
      </div>
    </form>
  );
}
