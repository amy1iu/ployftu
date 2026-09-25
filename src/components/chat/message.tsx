import type { UIMessage } from "ai";
import type { RepliesData } from "@/lib/ai/onboarding/messages";
import { Markdown } from "../markdown";

type Props = {
  message: UIMessage;
  /** Reply chips are only interactive on the latest assistant message. */
  onReply?: (text: string) => void;
};

export function Message({ message, onReply }: Props) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl bg-active px-4 py-2.5 whitespace-pre-wrap">{text}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-2">
      {message.parts.map((part, i) => {
        const key = `${message.id}-${i}`;
        if (part.type === "text") return <Markdown key={key}>{part.text}</Markdown>;
        if (part.type === "data-replies" && onReply) {
          const { options } = part.data as RepliesData;
          return (
            <div key={key} className="flex flex-wrap gap-2 pt-1">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onReply(option)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] hover:bg-hover"
                >
                  {option}
                </button>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
