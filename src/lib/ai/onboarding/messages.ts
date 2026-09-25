import type { UIMessage } from "ai";

// Getting Started messages carry reply chips as a data part, written after the
// reply text (see reply.ts).
export type RepliesData = { options: string[] };

/** Marks the turn where the first deliverable started; links to its task ploy. */
export type TaskStartedData = { ployId: string; title: string };

export type OnboardingUIMessage = UIMessage<never, { replies: RepliesData; taskStarted: TaskStartedData }>;
