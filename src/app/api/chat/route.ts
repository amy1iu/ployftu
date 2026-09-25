import { createUIMessageStreamResponse } from "ai";
import { onboardingTurn, type OnboardingUIMessage } from "@/lib/ai/onboarding";
import { saveOnboardingMessages } from "@/lib/db/workspaces";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, workspaceId }: { messages: OnboardingUIMessage[]; workspaceId: string } = await req.json();

  const stream = await onboardingTurn({
    workspaceId,
    messages,
    onSaved: (messages) => saveOnboardingMessages(workspaceId, messages),
  });
  return createUIMessageStreamResponse({ stream });
}
