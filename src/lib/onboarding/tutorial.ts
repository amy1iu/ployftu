import { getSpec } from "@/lib/catalog";
import type { Doc, MapNode, Ploy, Workspace } from "@/lib/db/types";
import { entryBranch } from "./entry";

// What "finishing the tutorial" means. Edit this list to change the definition;
// the sidebar's x/3 and the wrap-up both read from it.
type TutorialState = { workspace: Workspace; docs: Doc[]; ploys: Ploy[]; mapNodes: MapNode[] };

const tutorialSteps: { id: string; label: string; done: (s: TutorialState) => boolean }[] = [
  {
    id: "profile",
    label: "Confirm your business profile",
    done: (s) =>
      entryBranch(s.workspace.entry) !== null &&
      s.docs.find((d) => d.slug === "business-overview")?.sections["what-we-do"]?.status === "confirmed",
  },
  {
    id: "quick_win",
    label: "Open your first deliverable",
    done: (s) =>
      s.ploys.some((p) => p.kind === "task" && p.spec?.source === "quick_win" && p.status === "done" && !p.unread),
  },
  {
    id: "level",
    label: "Start a level on your map",
    done: (s) => s.mapNodes.some((n) => n.ploy_id && getSpec(n.spec_id)?.source !== "quick_win"),
  },
];

export function tutorialProgress(state: TutorialState) {
  const steps = tutorialSteps.map((step) => ({ id: step.id, label: step.label, done: step.done(state) }));
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length };
}
