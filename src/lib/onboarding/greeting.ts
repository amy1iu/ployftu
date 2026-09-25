import type { OnboardingUIMessage } from "@/lib/ai/onboarding/messages";
import { currentUser } from "@/lib/mock-data";

// Q1 of the entry flow: website, with a useful path for people without one.
export function greetingMessage(): OnboardingUIMessage {
  return {
    id: "greeting",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `Hey ${currentUser.firstName}, I'm your Ploy guide. In the next few minutes I'll learn how your business works, make you a first deliverable, and map out what Ploy can take off your plate.

First: **do you have a website?** Paste the link and I'll read it. That's the fastest way for me to get up to speed.

No site yet? No problem. Tell me in a sentence what you do, and I can draft a landing page as one of your first wins.`,
      },
      { type: "data-replies", data: { options: ["I don't have a website yet", "It's not live yet"] } },
    ],
  };
}
