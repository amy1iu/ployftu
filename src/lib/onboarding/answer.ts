import type { UIMessage } from "ai";
import type { IntentId } from "@/lib/catalog/intents";
import type { QuickWinId } from "@/lib/catalog/quick-wins";
import { extractEntryUpdate } from "@/lib/ai/onboarding/extract";
import { textOf } from "@/lib/ai/onboarding/text";
import { logEvent } from "@/lib/db/events";
import type { Workspace } from "@/lib/db/types";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { getDocs, getWorkspace, patchProfileSections, updateWorkspace } from "@/lib/db/workspaces";
import { EMPTY_SECTION, readSection } from "@/lib/docs/markdown";
import { normalizeUrl } from "./entry";
import { applyEntryUpdate, type EntryUpdate } from "./set-entry";
import { soundsUnsure, type AnsweredSlot, type Chip, type QuestionData, type TrailMetadata } from "./trail";

export type AppliedAnswer = {
  /** The slot it answered, or null if it didn't answer the question. */
  slot: AnsweredSlot | null;
  /** What the answer means, for its pill on the trail. */
  summary: string | null;
  /** Something off-script they said or asked, to reply to. */
  offScript: string | null;
  /** The quick win they picked, to start now. */
  quickWin: QuickWinId | null;
  /** Why an answer couldn't be recorded (e.g. a URL that isn't one), for the reply. */
  problems: string[];
};

const none: EntryUpdate = { website: null, goals: null, business: null };

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function goalUpdate(value: string): EntryUpdate {
  return {
    ...none,
    goals:
      value === "unsure"
        ? { status: "unsure", intents: [], inUserWords: null, unmatched: null }
        : { status: "has", intents: [{ id: value as IntentId, weight: 1 }], inUserWords: null, unmatched: null },
  };
}

const saveAudience = (workspaceId: string, body: string) =>
  patchProfileSections(workspaceId, [
    { slug: "business-overview", key: "who-we-serve", body, status: "confirmed", source: "user" },
  ]);

/**
 * Records the tool they use for a capability: on the workspace (so Connect can
 * offer it first) and in their profile. It isn't connected: connecting a tool
 * always needs their approval, from the task that needs it.
 */
async function rememberTool(workspaceId: string, category: IntegrationCategory, tool: string) {
  const [workspace, docs] = await Promise.all([getWorkspace(workspaceId), getDocs(workspaceId)]);
  const line = `- ${integrationCategories[category].name}: ${tool}`;
  const doc = docs.find((d) => d.slug === "channels-and-tools");
  const current = (doc && readSection(doc.content_md, "Tools we use")) ?? "";
  const known = current === EMPTY_SECTION ? "" : current;
  await Promise.all([
    updateWorkspace(workspaceId, { entry: { ...workspace.entry, tools: { ...workspace.entry.tools, [category]: tool } } }),
    known.includes(line)
      ? null
      : patchProfileSections(workspaceId, [
          { slug: "channels-and-tools", key: "tools", body: [known, line].filter(Boolean).join("\n"), status: "confirmed", source: "user" },
        ]),
    logEvent(workspaceId, "tool_named", { category, tool }),
  ]);
}

/** A tapped chip: its value is the answer, recorded exactly. */
async function applyChip(
  workspace: Workspace,
  slot: AnsweredSlot,
  chip: Chip,
  userTurns: number,
): Promise<AppliedAnswer> {
  const answer = { slot, summary: chip.label, offScript: null, quickWin: null, problems: [] };
  switch (slot) {
    case "website":
      await applyEntryUpdate(workspace.id, { ...none, website: { status: chip.value as "none" | "not_live", url: null } }, { userTurns });
      return { ...answer, summary: chip.value === "none" ? "No site yet" : "Not live yet" };
    case "sell":
      await applyEntryUpdate(workspace.id, { ...none, business: { whatTheyDo: chip.label, whoTheyServe: null } }, { userTurns });
      return answer;
    case "goal":
      await applyEntryUpdate(workspace.id, goalUpdate(chip.value), { userTurns });
      return answer;
    case "quick_win":
      return { ...answer, quickWin: chip.value as QuickWinId };
    case "followup":
      if (chip.value !== "unsure") await saveAudience(workspace.id, chip.label);
      return answer;
    case "tool": {
      if (chip.value === "skip") return { ...answer, summary: "Skipped for now" };
      const [category, tool] = chip.value.split(":") as [IntegrationCategory, string];
      await rememberTool(workspace.id, category, tool);
      return { ...answer, summary: `Uses ${tool}` };
    }
  }
}

/**
 * Records the user's latest message as an answer to the question on screen:
 * a tapped chip directly, anything typed through the extractor (which also
 * catches answers to other questions, and anything off-script).
 */
export async function applyAnswer({
  workspace,
  asked,
  message,
  messages,
  userTurns,
}: {
  workspace: Workspace;
  asked: QuestionData;
  message: UIMessage;
  messages: UIMessage[];
  userTurns: number;
}): Promise<AppliedAnswer> {
  const meta = (message.metadata ?? {}) as TrailMetadata;
  const slot: AnsweredSlot = asked.slot === "fork" ? (meta.slot === "quick_win" ? "quick_win" : "goal") : asked.slot;
  const card = slot === "quick_win" && asked.alt ? asked.alt : asked;

  const chip = meta.value !== undefined ? card.chips.find((c) => c.value === meta.value) : undefined;
  // A bare URL for the website needs no model to read.
  const url = slot === "website" && !chip ? normalizeUrl(textOf(message)) : null;
  const result = chip
    ? await applyChip(workspace, slot, chip, userTurns)
    : url
      ? await applyUrl(workspace, url, userTurns)
      : await applyTyped(workspace, slot, card, asked, message, messages, userTurns);
  if (result.slot) await logEvent(workspace.id, "question_answered", { slot: result.slot, via: chip ? "chip" : "typed" });
  return result;
}

async function applyUrl(workspace: Workspace, url: string, userTurns: number): Promise<AppliedAnswer> {
  const { entry, problems } = await applyEntryUpdate(workspace.id, { ...none, website: { status: "has", url } }, { userTurns });
  const recorded = entry.website.status === "has" && entry.website.url;
  return { slot: recorded ? "website" : null, summary: recorded ? hostOf(url) : null, offScript: null, quickWin: null, problems };
}

async function applyTyped(
  workspace: Workspace,
  slot: AnsweredSlot,
  card: { question: string; chips: Chip[] },
  asked: QuestionData,
  message: UIMessage,
  messages: UIMessage[],
  userTurns: number,
): Promise<AppliedAnswer> {
  const text = textOf(message);
  const extracted = await extractEntryUpdate(workspace.entry, messages, { slot, question: card.question, chips: card.chips });
  const { answer } = extracted;
  // Asking for something Ploy doesn't do, off-script, isn't a goal: note it, reply, and ask again.
  const askedForOther = extracted.goals?.status === "has" && !extracted.goals.intents.length && !!answer?.offScript;
  if (askedForOther && extracted.goals?.unmatched) {
    const { unmatched } = extracted.goals;
    await updateWorkspace(workspace.id, { entry: { ...workspace.entry, goals: { ...workspace.entry.goals, unmatched } } });
    await logEvent(workspace.id, "unmatched_intent", { text: unmatched });
  }
  const update = askedForOther ? { ...extracted, goals: null } : extracted;
  const matched = answer?.matchedChip ? card.chips.find((c) => c.value === answer.matchedChip) : undefined;
  const applied =
    update.website || update.goals || update.business ? await applyEntryUpdate(workspace.id, update, { userTurns }) : null;
  const result: AppliedAnswer = {
    slot: null,
    summary: null,
    offScript: answer?.offScript ?? null,
    quickWin: null,
    problems: applied?.problems ?? [],
  };
  // Their own words, summarized, say more than the nearest chip.
  const summary = answer?.summary ?? matched?.label ?? update.goals?.inUserWords ?? text.slice(0, 40);
  // Off-script messages don't count as free-text answers; an answer given alongside
  // one still lands through the extracted fields (e.g. who they serve) or a matched chip.
  const gaveAnswer = !!answer?.answered && !answer.offScript;
  const answeredWith = (s: string = summary) => ({ ...result, slot, summary: s });

  switch (slot) {
    case "website": {
      const website = applied?.entry.website;
      if (!update.website || !website || website.status === "unknown") return result;
      if (website.status === "has" && website.url) return answeredWith(hostOf(website.url));
      return answeredWith(website.status === "none" ? "No site yet" : website.status === "not_live" ? "Not live yet" : summary);
    }
    case "sell":
      return update.business?.whatTheyDo ? answeredWith(answer?.summary ?? update.business.whatTheyDo) : result;
    case "goal":
      if (update.goals) return answeredWith(update.goals.status === "unsure" ? "Not sure yet" : summary);
      if (matched) {
        await applyEntryUpdate(workspace.id, goalUpdate(matched.value), { userTurns });
        return answeredWith();
      }
      return result;
    case "quick_win":
      return matched ? { ...answeredWith(), quickWin: matched.value as QuickWinId } : result;
    case "followup": {
      // "All of the above" / "both" means every suggestion on the card.
      const all = /\b(all of (the|them|those|these)|all (the )?above|every(one|body) (above|listed)|both)\b/i.test(text)
        ? card.chips.filter((c) => c.value !== "unsure").map((c) => c.label).join(", ")
        : null;
      const who = update.business?.whoTheyServe ?? all ?? (gaveAnswer ? (answer?.summary ?? text) : null);
      if (!who) return soundsUnsure(text) ? answeredWith("Not sure yet") : result;
      if (!update.business?.whoTheyServe) await saveAudience(workspace.id, who);
      return all ? answeredWith(all) : answeredWith();
    }
    case "tool": {
      if (!gaveAnswer && !matched && !soundsUnsure(text)) return result;
      if (matched?.value === "skip" || /\b(skip|none|nothing|later)\b/i.test(text) || soundsUnsure(text))
        return answeredWith("Skipped for now");
      const category = asked.category!;
      const tool = matched ? matched.value.split(":")[1] : (answer?.summary ?? text).slice(0, 40);
      await rememberTool(workspace.id, category, tool);
      return answeredWith(`Uses ${tool}`);
    }
  }
}
