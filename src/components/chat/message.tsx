import type { UIMessage } from "ai";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import type { RepliesData, TaskStartedData } from "@/lib/ai/onboarding/messages";
import type { DeliverableData, PlanData } from "@/lib/quick-wins/types";
import { DeliverableView } from "../deliverables/deliverable-view";
import { Markdown } from "../markdown";
import { PlanCard } from "./plan-card";

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
        if (part.type === "data-plan") return <PlanCard key={key} {...(part.data as PlanData)} />;
        if (part.type === "data-deliverable") return <DeliverableView key={key} {...(part.data as DeliverableData)} />;
        if (part.type === "data-taskStarted") {
          const { ployId, title } = part.data as TaskStartedData;
          return (
            <Link
              key={key}
              href={`/ploys/${ployId}`}
              className="flex w-fit items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] hover:bg-hover"
            >
              <Sparkles size={13} className="text-accent" />
              Started: {title}
              <ArrowRight size={13} className="text-subtle" />
            </Link>
          );
        }
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
