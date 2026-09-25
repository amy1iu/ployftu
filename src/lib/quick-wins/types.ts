import type { UIMessage } from "ai";
import type { QuickWinId } from "@/lib/catalog/quick-wins";

/** One step of a Ploybook, shown in the task ploy's plan card as it runs. */
export type PlanStep = {
  label: string;
  kind: "primitive" | "agent_tool";
  /** Display name of the Ploy primitive (e.g. "Docs") or agent tool (e.g. "Scrape site"). */
  name: string;
  status: "pending" | "running" | "done";
};

export type PlanData = { steps: PlanStep[] };

export type DeliverableData = {
  recipeId: QuickWinId;
  output: unknown;
  /** The Doc it was saved to. */
  docSlug: string;
  /** True if generation failed and a template was used instead. */
  fallback: boolean;
};

export type TaskUIMessage = UIMessage<never, { plan: PlanData; deliverable: DeliverableData }>;
