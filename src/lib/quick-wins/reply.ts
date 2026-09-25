import { generateText } from "ai";
import { models } from "@/lib/ai/models";
import { textOf } from "@/lib/ai/onboarding/text";
import { getDocs, getPloy, updatePloy } from "@/lib/db/workspaces";
import type { TaskUIMessage } from "./types";

/**
 * Makes a task ploy chattable: a single reply that knows the task, its
 * deliverable, and the business. No tools and no side effects; change requests
 * are acknowledged for the next run rather than applied.
 */
export async function replyInPloy(ployId: string, text: string) {
  const ploy = await getPloy(ployId);
  const question: TaskUIMessage = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] };
  const withQuestion = [...(ploy.messages as TaskUIMessage[]), question];
  // Show their message right away (Realtime), then answer.
  await updatePloy(ployId, { messages: withQuestion, unread: false });

  const docs = await getDocs(ploy.workspace_id);
  const deliverable = withQuestion
    .flatMap((m) => m.parts)
    .find((p) => p.type === "data-deliverable");
  const { text: answer } = await generateText({
    model: models.chat,
    system: `You're Ploy, working on a task for a small business: "${ploy.title}" (${ploy.spec?.goal ?? ""}).
Status: ${ploy.status}.
${deliverable?.type === "data-deliverable" ? `What you delivered:\n${JSON.stringify(deliverable.data.output)}` : "Nothing delivered yet."}

Their business profile:
${docs
  .filter((d) => d.kind === "profile")
  .map((d) => d.content_md)
  .join("\n\n")}

Answer questions about this task and what you delivered, briefly (under 80 words) and specifically. If they ask for changes, say exactly what you'd change and that you'll apply it the next time this runs. Plain text or short Markdown.`,
    messages: withQuestion.map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: textOf(m) || "(card)" })),
  });

  const reply: TaskUIMessage = { id: crypto.randomUUID(), role: "assistant", parts: [{ type: "text", text: answer }] };
  await updatePloy(ployId, { messages: [...withQuestion, reply] });
}
