import type { UIMessage } from "ai";

// Getting Started messages carry reply chips as a data part, generated after
// the reply text (see replies.ts), so the text never waits on them.
export type RepliesData = { options: string[] };

export type OnboardingUIMessage = UIMessage<never, { replies: RepliesData }>;
