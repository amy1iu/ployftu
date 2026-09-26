import type { OnboardingUIMessage } from "@/lib/ai/onboarding/messages";
import { currentUser } from "@/lib/mock-data";
import { websiteQuestion } from "./trail";

// The trail's first card: their website, with a path for people without one.
export function greetingMessage(): OnboardingUIMessage {
  return {
    id: "greeting",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `Hey ${currentUser.firstName}, I'm your Ploy guide. A few quick questions, and I'll map out what Ploy can do for your business, starting with something useful in the next few minutes.`,
      },
      { type: "data-question", data: websiteQuestion() },
    ],
  };
}
