import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion as Question } from "ai";
import { logEvents } from "@/lib/db/events";
import { decisionIds, withConfidence, type Answers, type Decision, type NextDesign, type RawAnswer } from "@/lib/onboarding/decisions";
import { models } from "./models";

// Jev (TypeSafe's "System One" decision model, on the AI Gateway) makes the
// trail's typed decisions: one shared JSON state, several typed questions,
// answered in parallel with probabilities in ~100-500ms, no text generated.
// Everything here is best-effort: on an error or a slow answer `ask` returns
// null and the caller falls back to today's path (the extractor, the fixed order).

/** Past this, the turn goes on without the decision. */
export const JEV_TIMEOUT_MS = 1500;

/**
 * Which decisions Jev makes for real: `JEV_DECISIONS=answer_status,chip_match,…`
 * (empty = none, today's behavior). `JEV_SHADOW=1` asks Jev alongside today's
 * path and logs both, changing nothing. `JEV_NEXT=choice|composite` picks the
 * next_info design. Read per call, so evals can switch them between runs.
 */
export function jevDecisions(): Set<Decision> {
  const on = (process.env.JEV_DECISIONS ?? "").split(",").map((s) => s.trim());
  return new Set(decisionIds.filter((d) => on.includes(d)));
}
export const jevShadow = () => process.env.JEV_SHADOW === "1";
export const nextDesign = (): NextDesign => (process.env.JEV_NEXT === "composite" ? "composite" : "choice");

export type Asked = { answers: Answers; ms: number; inputTokens: number };

/** A decision as logged: its answer in one value, and how sure. */
const logValue = (a: RawAnswer) => (a.type === "choice" ? a.choice : a.type === "score" ? a.score : Math.round(a.probability * 100) / 100);

/**
 * Asks Jev `questions` about `state`. Returns the answers with a computed
 * confidence, or null on any error or after JEV_TIMEOUT_MS. With a workspace,
 * logs one `decision` event per question (not awaited: `logged` settles when written).
 */
export async function ask(
  state: Parameters<typeof evaluate>[0]["state"],
  questions: Record<string, Question>,
  { workspaceId = null, timeoutMs = JEV_TIMEOUT_MS, label }: { workspaceId?: string | null; timeoutMs?: number; label?: string } = {},
): Promise<(Asked & { logged: Promise<void> }) | null> {
  if (!Object.keys(questions).length) return null;
  const started = performance.now();
  try {
    const result = await evaluate({
      model: models.decide,
      state,
      questions,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Math.round(performance.now() - started);
    const answers: Answers = Object.fromEntries(
      Object.entries(result.answers as Record<string, RawAnswer>).map(([id, a]) => [id, withConfidence(a)]),
    );
    const logged = workspaceId
      ? logEvents(
          workspaceId,
          Object.entries(answers).map(([id, a]) => ({
            name: "decision",
            props: { id, choice: logValue(a), confidence: Math.round(a.confidence * 100) / 100, ms, ...(label ? { call: label } : {}) },
          })),
        )
      : Promise.resolve();
    return { answers, ms, inputTokens: result.usage.inputTokens ?? 0, logged };
  } catch (error) {
    console.error(`Jev ${label ?? "call"} failed after ${Math.round(performance.now() - started)}ms:`, String(error).split("\n")[0]);
    return null;
  }
}
