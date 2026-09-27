import { generateText } from "ai";
import { models } from "@/lib/ai/models";
import { recordProfileNotes } from "@/lib/ai/onboarding/profile-notes";
import { textOf } from "@/lib/ai/onboarding/text";
import { getDocs, getPloy, updatePloy } from "@/lib/db/workspaces";
import type { TaskUIMessage } from "@/lib/tasks/types";

/** Their business profile, for the reply to use. */
const profileOf = (docs: Awaited<ReturnType<typeof getDocs>>) =>
  docs
    .filter((d) => d.kind === "profile")
    .map((d) => d.content_md)
    .join("\n\n");

/**
 * Makes a ploy chattable. A task ploy's reply knows the task, its deliverable,
 * and the business; change requests are acknowledged for the next run rather
 * than applied. A chat ploy (started from a message, no Ploybook) replies as
 * their teammate. Either way, what they say about the business goes into
 * their profile (profile notes), so telling Ploy what changed works anywhere.
 */
export async function replyInPloy(ployId: string, text: string) {
  const ploy = await getPloy(ployId);
  const question: TaskUIMessage = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] };
  const withQuestion = [...(ploy.messages as TaskUIMessage[]), question];
  // Show their message right away (Realtime), then answer.
  await updatePloy(ployId, { messages: withQuestion, unread: false });
  const notes = recordProfileNotes(ploy.workspace_id, withQuestion);

  const docs = await getDocs(ploy.workspace_id);
  const deliverable = withQuestion
    .flatMap((m) => m.parts)
    .find((p) => p.type === "data-deliverable");
  const system = ploy.spec
    ? `You're Ploy, working on a task for a small business: "${ploy.title}" (${ploy.spec.goal}).
Status: ${ploy.status}.
${deliverable?.type === "data-deliverable" ? `What you delivered:\n${JSON.stringify(deliverable.data.output)}` : "Nothing delivered yet."}

Their business profile:
${profileOf(docs)}

Answer questions about this task and what you delivered, briefly (under 80 words) and specifically. If they ask for changes, say exactly what you'd change and that you'll apply it the next time this runs. Plain text or short Markdown.`
    : `You're Ploy, a marketing teammate for this small business: you know it well and help it grow.

Their business profile:
${profileOf(docs)}

What they tell you here is true and current, even where the profile is older: it's how the profile stays up to date. Do what they ask right away (write the draft, give the answer), using the profile and what they've said; don't invent other facts. Ask at most one question, and only if you truly can't do it without the answer. Keep it specific and plain (under 150 words unless it's a draft). If they told you something new about the business, say in a few words that you'll remember it. Plain text or short Markdown.`;
  const { text: answer } = await generateText({
    model: models.chat,
    system,
    messages: withQuestion.map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: textOf(m) || "(card)" })),
  });

  const reply: TaskUIMessage = { id: crypto.randomUUID(), role: "assistant", parts: [{ type: "text", text: answer }] };
  await updatePloy(ployId, { messages: [...withQuestion, reply] });
  await notes;
}
