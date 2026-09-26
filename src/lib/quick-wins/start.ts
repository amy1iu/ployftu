import { getIntent } from "@/lib/catalog/intents";
import { quickWins, type QuickWinId } from "@/lib/catalog/quick-wins";
import { logEvent } from "@/lib/db/events";
import type { Doc, Ploy, Workspace } from "@/lib/db/types";
import { hasContext } from "@/lib/docs/profile";
import { defaultQuickWin, entryBranch, topIntent, type Entry } from "@/lib/onboarding/entry";
import type { AnsweredSlot } from "@/lib/onboarding/trail";
import { createTaskPloy } from "@/lib/tasks/ploy";

/**
 * On the goal path, the first deliverable starts once the goal is set and we
 * know what it needs (e.g. who they sell to), or they've answered the
 * follow-up either way. (On the quick-win path they pick it themselves.)
 * Returns the recipe to start this turn, or null.
 */
export function quickWinToStart({
  workspace,
  docs,
  ploys,
  answered,
}: {
  workspace: Workspace;
  docs: Pick<Doc, "slug" | "sections">[];
  ploys: Ploy[];
  answered: ReadonlySet<AnsweredSlot>;
}): QuickWinId | null {
  if (ploys.some((p) => p.spec?.source === "quick_win")) return null;
  const recipe = defaultQuickWin(workspace.entry);
  if (!recipe) return null;
  // Who it's for has to come from them: their site only says who buys today.
  const waiting = quickWins[recipe].spec.needsContext.some(
    (key) => !hasContext(docs, key, { confirmed: key === "audience" }),
  );
  return !waiting || answered.has("followup") ? recipe : null;
}

function whyThisFirst(entry: Entry, recipeId: QuickWinId, picked: boolean) {
  if (picked) return "You picked this as your quick win, so it's first.";
  const branch = entryBranch(entry);
  if (branch === "B")
    return "You weren't sure where to start, and your homepage is the first thing every visitor sees, so it's the quickest place to find wins.";
  if (recipeId === "landing_page_draft" && entry.website.status !== "has")
    return "You don't have a live site yet, so a landing page is the foundation everything else builds on.";
  const intent = topIntent(entry);
  if (entry.goals.inUserWords) return `You told me: "${entry.goals.inUserWords.replace(/[.!]+$/, "")}." This is the fastest first step toward that.`;
  return intent ? `Your focus is to ${getIntent(intent).label.toLowerCase()}, and this is the fastest first step toward it.` : "";
}

/** Creates the task ploy for a quick win with its kickoff message; runQuickWin does the work. */
export async function startQuickWin(workspace: Workspace, recipeId: QuickWinId, { picked = false } = {}) {
  const ploy = await createTaskPloy(workspace.id, quickWins[recipeId].spec, whyThisFirst(workspace.entry, recipeId, picked));
  await logEvent(workspace.id, "quick_win_started", { recipeId, ployId: ploy.id, picked });
  return ploy;
}
