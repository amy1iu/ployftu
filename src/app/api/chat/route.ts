import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { model, systemPrompt, tools, type OnboardingUIMessage } from "@/lib/ai/agent";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { id, messages }: { id: string; messages: OnboardingUIMessage[] } =
    await req.json();

  const result = streamText({
    model, // plain string → routed through Vercel AI Gateway
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: isStepCount(5),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onEnd: async ({ messages }) => {
        await saveConversation(id, messages);
      },
    }),
  });
}

// Persists the conversation for signed-in users. Anonymous chats aren't saved
// (enable Supabase anonymous sign-ins if you want to keep those too).
async function saveConversation(id: string, messages: OnboardingUIMessage[]) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return;

  const { error } = await supabase
    .from("onboarding_conversations")
    .upsert({ id, user_id: userId, messages, updated_at: new Date().toISOString() });
  if (error) console.error("Failed to save conversation", error);
}
