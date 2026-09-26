import type { UIMessage } from "ai";
import type { AnsweredData, QuestionData, TrailMetadata } from "@/lib/onboarding/trail";

// Getting Started messages. Assistant messages carry the trail as data parts:
// `answered` (what the user's last answer meant), `taskStarted` (the first
// deliverable began), and `question` (the next card). Their text, if any,
// replies to something off-script. User messages say which card they answer.
export type RepliesData = { options: string[] };

/** Marks the turn where the first deliverable started; links to its task ploy. */
export type TaskStartedData = { ployId: string; title: string };

export type OnboardingUIMessage = UIMessage<
  TrailMetadata,
  { replies: RepliesData; taskStarted: TaskStartedData; question: QuestionData; answered: AnsweredData }
>;
