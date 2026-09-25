import { createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { onboardingTurn, type OnboardingUIMessage } from "@/lib/ai/onboarding";
import { saveOnboardingMessages } from "@/lib/db/workspaces";

// Covers reading the user's site in the background (~15-20s), not just the reply.
export const maxDuration = 120;

export async function POST(req: Request) {
  const { messages, workspaceId }: { messages: OnboardingUIMessage[]; workspaceId: string } = await req.json();

  const { stream, background } = await onboardingTurn({
    workspaceId,
    messages,
    onSaved: (messages) => saveOnboardingMessages(workspaceId, messages),
  });
  after(() => background);
  return createUIMessageStreamResponse({ stream });
}
