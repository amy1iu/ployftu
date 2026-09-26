import type { UIMessage } from "ai";
import type { IntentId } from "@/lib/catalog/intents";
import type { QuickWinId } from "@/lib/catalog/quick-wins";
import { extractEntryUpdate, extractFreeText, type FreeText } from "@/lib/ai/onboarding/extract";
import { textOf } from "@/lib/ai/onboarding/text";
import { logEvent } from "@/lib/db/events";
import type { Workspace } from "@/lib/db/types";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { getDocs, getWorkspace, patchProfileSections, updateWorkspace } from "@/lib/db/workspaces";
import { EMPTY_SECTION, readSection } from "@/lib/docs/markdown";
import {
  ACT,
  CONFIRM,
  chipsOf,
  hasAside,
  readChip,
  readGoal,
  readStatus,
  readWebsite,
  saysGoal,
  type Answers,
  type Decision,
  type GoalRead,
} from "./decisions";
import { findUrl, normalizeUrl } from "./entry";
import { applyEntryUpdate, type EntryUpdate } from "./set-entry";
import { contextItems, type SectionRef } from "@/lib/catalog/context";
import { isFork, slotOf, soundsUnsure, type AnsweredSlot, type Chip, type QuestionData, type TrailMetadata } from "./trail";

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
  /** What we recorded from a reading we're only fairly sure of, for the reply to confirm back. */
  confirm?: string | null;
};

/** Jev's answers about the typed message (see ai/jev.ts), and which decisions it makes for real. */
export type Decided = { answers: Promise<Answers | null>; decisions: ReadonlySet<Decision> };

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

/** Records an answer in the registry item's profile section (who they serve, channels, constraints…), as theirs. */
const saveSection = (workspaceId: string, { doc, section }: SectionRef, body: string) =>
  patchProfileSections(workspaceId, [{ slug: doc, key: section, body, status: "confirmed", source: "user" }]);

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
    case "business_model":
      await applyEntryUpdate(workspace.id, { ...none, business: { whatTheyDo: chip.label, whoTheyServe: null } }, { userTurns });
      return answer;
    case "goal_detail":
      await applyEntryUpdate(workspace.id, goalUpdate(chip.value), { userTurns });
      return answer;
    case "quick_win_offer":
      return { ...answer, quickWin: chip.value as QuickWinId };
    case "target_customer":
    case "current_acquisition":
    case "constraints":
      if (chip.value !== "unsure") await saveSection(workspace.id, contextItems[slot].record!, chip.label);
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
  decided = null,
}: {
  workspace: Workspace;
  asked: QuestionData;
  message: UIMessage;
  messages: UIMessage[];
  userTurns: number;
  /** With `answer_status` on, a typed answer is read from these instead of the extractor. */
  decided?: Decided | null;
}): Promise<AppliedAnswer> {
  const meta = (message.metadata ?? {}) as TrailMetadata;
  const slot: AnsweredSlot = isFork(asked) && meta.slot && slotOf(meta.slot) === "quick_win_offer" ? "quick_win_offer" : asked.slot;
  const card = slot === "quick_win_offer" && asked.alt ? asked.alt : asked;

  const chip = meta.value !== undefined ? card.chips.find((c) => c.value === meta.value) : undefined;
  // A bare URL for the website needs no model to read.
  const url = slot === "website" && !chip ? normalizeUrl(textOf(message)) : null;
  let via = chip ? "chip" : url ? "url" : "typed";
  const typed = async () => {
    const answers = decided?.decisions.has("answer_status") ? await decided.answers : null;
    const read = answers && (await applyDecided({ workspace, slot, asked, text: textOf(message), answers, decisions: decided!.decisions, userTurns }));
    if (read) via = "jev";
    return read ?? (await applyTyped(workspace, slot, card, asked, message, messages, userTurns));
  };
  const result = chip ? await applyChip(workspace, slot, chip, userTurns) : url ? await applyUrl(workspace, url, userTurns) : await typed();
  if (result.slot) await logEvent(workspace.id, "question_answered", { slot: result.slot, via });
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
    case "business_model":
      return update.business?.whatTheyDo ? answeredWith(answer?.summary ?? update.business.whatTheyDo) : result;
    case "goal_detail":
      if (update.goals) return answeredWith(update.goals.status === "unsure" ? "Not sure yet" : summary);
      if (matched) {
        await applyEntryUpdate(workspace.id, goalUpdate(matched.value), { userTurns });
        return answeredWith();
      }
      return result;
    case "quick_win_offer":
      return matched ? { ...answeredWith(), quickWin: matched.value as QuickWinId } : result;
    case "target_customer": {
      // "All of the above" / "both" means every suggestion on the card.
      const all = /\b(all of (the|them|those|these)|all (the )?above|every(one|body) (above|listed)|both)\b/i.test(text)
        ? card.chips.filter((c) => c.value !== "unsure").map((c) => c.label).join(", ")
        : null;
      const who = update.business?.whoTheyServe ?? all ?? (gaveAnswer ? (answer?.summary ?? text) : null);
      if (!who) return soundsUnsure(text) ? answeredWith("Not sure yet") : result;
      if (!update.business?.whoTheyServe) await saveSection(workspace.id, contextItems.target_customer.record!, who);
      return all ? answeredWith(all) : answeredWith();
    }
    // The other open items: their words, summarized, into the item's section.
    case "current_acquisition":
    case "constraints": {
      if (!gaveAnswer) return soundsUnsure(text) ? answeredWith("Not sure yet") : result;
      await saveSection(workspace.id, contextItems[slot].record!, matched?.label ?? text);
      return answeredWith();
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

const noText: FreeText = { goalInWords: null, whatTheyDo: null, whoTheyServe: null, summary: null };

async function applyGoal(workspaceId: string, goal: Extract<GoalRead, { status: "has" }>, words: FreeText, userTurns: number) {
  await applyEntryUpdate(
    workspaceId,
    { ...none, goals: { status: "has", intents: goal.intents, inUserWords: words.goalInWords, unmatched: null } },
    { userTurns },
  );
}

/**
 * A typed answer read from Jev's decisions instead of the extractor: what the
 * message does (answer_status), which chip it means (chip_match), the website
 * status and goal it states. Only free text (their goal in their words, what
 * they sell, a pill summary) still needs a model, and only when there's an
 * answer to copy it from. Returns null to fall back to the extractor: a
 * reading under CONFIRM, a changed earlier answer (the extractor re-reads the
 * whole conversation), or a decision this slot needs that isn't switched on.
 * Between CONFIRM and ACT it records the answer and asks the reply to confirm it.
 */
async function applyDecided({
  workspace,
  slot,
  asked,
  text,
  answers,
  decisions,
  userTurns,
}: {
  workspace: Workspace;
  slot: AnsweredSlot;
  asked: QuestionData;
  text: string;
  answers: Answers;
  decisions: ReadonlySet<Decision>;
  userTurns: number;
}): Promise<AppliedAnswer | null> {
  const status = readStatus(answers);
  if (!status || status.confidence < CONFIRM || status.value === "changed_earlier_answer") return null;
  const chips = chipsOf(asked);
  const chipRead = decisions.has("chip_match") ? readChip(answers, chips) : null;
  const chip = chipRead && chipRead.confidence >= CONFIRM ? chipRead.value : null;
  const goalRead = decisions.has("goal_intent") ? readGoal(answers) : null;
  const goal = goalRead && goalRead.confidence >= CONFIRM ? goalRead.value : null;
  const card = { question: asked.question, chips: asked.chips };
  const words = () => extractFreeText(text, { slot, ...card }).catch(() => noText);

  const result: AppliedAnswer = { slot: null, summary: null, offScript: hasAside(answers) ? text : null, quickWin: null, problems: [], confirm: null };
  const sure = Math.min(status.confidence, chipRead?.confidence ?? 1) >= ACT && status.value !== "partial";
  const answeredWith = (summary: string, extra: Partial<AppliedAnswer> = {}): AppliedAnswer => ({
    ...result,
    slot,
    summary,
    confirm: sure ? null : summary,
    ...extra,
  });

  // A goal stated in passing (e.g. under the website question) is recorded, as the extractor would.
  if (slot !== "goal_detail" && workspace.entry.goals.status === "unknown" && goal?.status === "has" && saysGoal(answers))
    await applyGoal(workspace.id, goal, await words(), userTurns);

  const pickedChip = chip && chip !== "all" ? chip : null;
  const onAlt = !!pickedChip && !!asked.alt?.chips.includes(pickedChip);
  if (status.value === "off_script" || status.value === "asked_question") {
    // Asking for one of the chips ("can you check my homepage?") picks it.
    if (!pickedChip) return { ...result, offScript: text };
  }
  if (status.value === "unsure") {
    switch (slot) {
      case "website":
      case "quick_win_offer":
        return result;
      case "goal_detail":
        await applyEntryUpdate(workspace.id, goalUpdate("unsure"), { userTurns });
        return answeredWith("Not sure yet");
      case "tool":
        return answeredWith("Skipped for now");
      default:
        return answeredWith("Not sure yet");
    }
  }

  // Answered (or partly): record it where the slot's answers go.
  if (onAlt) return { ...answeredWith(pickedChip.label), slot: "quick_win_offer", quickWin: pickedChip.value as QuickWinId };
  switch (slot) {
    case "website": {
      const site = pickedChip ? { value: pickedChip.value as "none" | "not_live", confidence: 1 } : decisions.has("website_status") ? readWebsite(answers) : null;
      if (!site || site.confidence < CONFIRM) return null;
      if (site.value !== "has") {
        await applyEntryUpdate(workspace.id, { ...none, website: { status: site.value, url: null } }, { userTurns });
        return answeredWith(site.value === "none" ? "No site yet" : "Not live yet");
      }
      const url = findUrl(text);
      if (!url) return { ...result, problems: [`There's no link in what they wrote. Ask for their website's address; don't record anything.`] };
      const applied = await applyUrl(workspace, url, userTurns);
      return applied.slot ? { ...applied, offScript: result.offScript, confirm: sure ? null : applied.summary } : applied;
    }
    case "goal_detail": {
      if (pickedChip) {
        await applyEntryUpdate(workspace.id, goalUpdate(pickedChip.value), { userTurns });
        return answeredWith(pickedChip.label);
      }
      if (!goal) return null;
      if (goal.status === "unsure") {
        await applyEntryUpdate(workspace.id, goalUpdate("unsure"), { userTurns });
        return answeredWith("Not sure yet");
      }
      const said = await words();
      if (goal.status === "not_covered") {
        // Something Ploy doesn't do isn't a goal: note it, reply, and ask again.
        const unmatched = said.goalInWords ?? text.slice(0, 80);
        await updateWorkspace(workspace.id, { entry: { ...workspace.entry, goals: { ...workspace.entry.goals, unmatched } } });
        await logEvent(workspace.id, "unmatched_intent", { text: unmatched });
        return { ...result, offScript: text };
      }
      await applyGoal(workspace.id, goal, said, userTurns);
      return answeredWith(said.summary ?? said.goalInWords ?? text.slice(0, 40));
    }
    case "quick_win_offer":
      return pickedChip ? answeredWith(pickedChip.label, { quickWin: pickedChip.value as QuickWinId }) : result;
    case "tool": {
      if (pickedChip?.value === "skip") return answeredWith("Skipped for now");
      const name = pickedChip ? pickedChip.value.split(":")[1] : ((await words()).summary ?? text).slice(0, 40);
      await rememberTool(workspace.id, asked.category!, name);
      return answeredWith(`Uses ${name}`);
    }
    case "business_model": {
      const said = pickedChip ? { ...noText, whatTheyDo: pickedChip.label } : await words();
      const whatTheyDo = said.whatTheyDo ?? text;
      await applyEntryUpdate(workspace.id, { ...none, business: { whatTheyDo, whoTheyServe: null } }, { userTurns });
      return answeredWith(said.summary ?? whatTheyDo.slice(0, 40));
    }
    default: {
      // target_customer, current_acquisition, constraints: their words into the item's section.
      const record = contextItems[slot].record!;
      if (pickedChip?.value === "unsure") return answeredWith("Not sure yet");
      if (chip === "all") {
        const all = asked.chips.filter((c) => c.value !== "unsure").map((c) => c.label).join(", ");
        await saveSection(workspace.id, record, all);
        return answeredWith(all);
      }
      if (pickedChip) {
        await saveSection(workspace.id, record, pickedChip.label);
        return answeredWith(pickedChip.label);
      }
      const said = await words();
      await saveSection(workspace.id, record, (slot === "target_customer" && said.whoTheyServe) || text);
      return answeredWith(said.summary ?? text.slice(0, 40));
    }
  }
}
