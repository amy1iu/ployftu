"use client";

import type { OnboardingUIMessage, TaskStartedData } from "@/lib/ai/onboarding/messages";
import { getSpec } from "@/lib/catalog";
import type { MapNode, Ploy } from "@/lib/db/types";
import { legacyAnchors } from "@/lib/map/plan";
import { nodeState, type NodeState } from "@/lib/map/state";
import {
  openQuestion,
  questionFor,
  type AnsweredData,
  type AnsweredSlot,
  type QuestionData,
  type TrailMetadata,
} from "@/lib/onboarding/trail";
import { useWorkspace } from "../workspace/workspace-provider";

// The Getting Started trail's layout, shared by the trail itself and the task
// list beside it (which also shows on task ploys): its rows, in order, and
// which tasks sit beside each.

export type Card = Pick<QuestionData, "question" | "hint" | "chips">;

export type Row =
  | { kind: "home"; key: null }
  | {
      kind: "answered";
      key: string;
      slot: AnsweredSlot;
      summary: string;
      pending?: boolean;
      /** The card that asked for it, and what they typed (null for a tapped chip). */
      asked: Card | null;
      said: string | null;
    }
  | { kind: "read"; key: "site" }
  | { kind: "build"; key: "build"; ploy: Ploy }
  | { kind: "reply"; key: null; id: string; said: string | null; text: string | null }
  | { kind: "question"; key: string; question: QuestionData; lead: string | null }
  | { kind: "thinking"; key: null }
  | { kind: "end"; key: "end" };

const textOf = (message: OnboardingUIMessage) =>
  message.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
const partOf = <T,>(message: OnboardingUIMessage | undefined, type: string) =>
  (message?.parts.find((p) => p.type === type) as { data: T } | undefined)?.data;

/** Where a question's tasks sit: the fork's are its main card's. */
const questionKey = (q: QuestionData) => q.slot;
/** The card an answer was given on: the fork has two. */
const cardFor = (q: QuestionData | null, slot: AnsweredSlot): Card | null => (q?.alt?.slot === slot ? q.alt : q);
const metaOf = (m: OnboardingUIMessage | undefined) => (m?.metadata ?? {}) as TrailMetadata;

/** The trail's rows, in order, from the Getting Started messages. */
export function buildRows(
  messages: OnboardingUIMessage[],
  { hasRead, quickWin, busy }: { hasRead: boolean; quickWin: Ploy | undefined; busy: boolean },
): Row[] {
  const rows: Row[] = [{ kind: "home", key: null }];
  // Each slot's row, so a changed answer updates in place.
  const answeredAt = new Map<AnsweredSlot, number>();
  const open = openQuestion(messages);
  const last = messages.at(-1);
  // Changing an earlier answer leaves the card on screen where it is.
  const redoing = last?.role === "user" && !!metaOf(last).redo;
  let asked: QuestionData | null = null;

  messages.forEach((message, i) => {
    if (message.role === "user") {
      const reply = messages[i + 1];
      if (partOf<AnsweredData>(reply, "data-answered")) return; // its row comes with the reply
      if (reply && textOf(reply)) return; // shown in the reply node
      // Waiting on the reply: show the answer as pending.
      const meta = metaOf(message);
      const slot = meta.slot ?? asked?.slot;
      const existing = meta.redo && slot ? answeredAt.get(slot) : undefined;
      if (existing !== undefined) rows[existing] = { ...(rows[existing] as Extract<Row, { kind: "answered" }>), summary: textOf(message), pending: true };
      else if (asked && slot)
        rows.push({ kind: "answered", key: `pending-${message.id}`, slot, summary: textOf(message), pending: true, asked: cardFor(asked, slot), said: null });
      else rows.push({ kind: "reply", key: null, id: message.id, said: textOf(message), text: null });
      return;
    }

    const answered = partOf<AnsweredData>(message, "data-answered");
    if (answered) {
      const from = messages[i - 1];
      const meta = metaOf(from);
      const question = meta.redo ? questionFor(messages.slice(0, i), answered.slot) : asked;
      const existing = answeredAt.get(answered.slot);
      const row: Row = {
        kind: "answered",
        key: answered.slot === "website" ? (hasRead ? "website" : "site") : answered.slot,
        slot: answered.slot,
        summary: answered.summary,
        asked: cardFor(question, answered.slot),
        said: from?.role === "user" && meta.value === undefined ? textOf(from) : null,
      };
      if (existing !== undefined) rows[existing] = row;
      else {
        answeredAt.set(answered.slot, rows.length);
        rows.push(row);
        if (answered.slot === "website" && hasRead) rows.push({ kind: "read", key: "site" });
      }
    }
    const started = partOf<TaskStartedData>(message, "data-taskStarted");
    if (started && quickWin) rows.push({ kind: "build", key: "build", ploy: quickWin });

    const question = partOf<QuestionData>(message, "data-question");
    const text = textOf(message);
    const isOpen = !!question && question === open && (i === messages.length - 1 || redoing);
    // A greeting, or a note about their answer, leads into the question; a reply to something off-script stands alone.
    const lead = text && isOpen && (i === 0 || !question.offScript) ? text : null;
    // The greeting only introduces the first question.
    if (text && !lead && i > 0) {
      const said = messages[i - 1]?.role === "user" && !answered ? textOf(messages[i - 1]) : null;
      rows.push({ kind: "reply", key: null, id: message.id, said, text });
    }
    if (question) asked = question;
    if (isOpen) rows.push({ kind: "question", key: questionKey(question), question, lead });
  });

  // From the moment they answer until the next card (or the wrap-up) arrives:
  // whenever a turn is in flight and no card is on screen.
  if (busy && !redoing && !rows.some((r) => r.kind === "question")) rows.push({ kind: "thinking", key: null });
  if ((!busy || redoing) && !open) rows.push({ kind: "end", key: "end" });
  return rows;
}

/** A task as the list shows it. */
export type ListedTask = {
  node: MapNode;
  state: NodeState;
  /** The question on screen would unlock it. */
  waitingHere: boolean;
};

export function useTrailLayout(messages: OnboardingUIMessage[], busy: boolean) {
  const { workspace, ploys, mapNodes, integrations, docs } = useWorkspace();
  const quickWin = ploys.find((p) => p.spec?.source === "quick_win");
  const rows = buildRows(messages, { hasRead: !!workspace.crawl, quickWin, busy });
  const active = rows.find((r): r is Extract<Row, { kind: "question" }> => r.kind === "question");

  // Place each task beside its anchor's row; ones waiting on a question that hasn't come up yet stay hidden.
  const keys = new Set(rows.map((r) => r.key).filter(Boolean));
  const done = rows.some((r) => r.kind === "end");
  const states = new Map(mapNodes.map((n) => [n.id, nodeState(n, { ploys, integrations, mapNodes, docs })]));
  const byRow = new Map<string, MapNode[]>();
  for (const node of mapNodes) {
    if (getSpec(node.spec_id)?.source === "quick_win") continue; // shown as the build node
    const anchor = node.anchor ? (legacyAnchors[node.anchor] ?? node.anchor) : node.region === "site_brand" ? "site" : "goal_detail";
    const key = keys.has(anchor) ? anchor : done ? "end" : null;
    if (key) byRow.set(key, [...(byRow.get(key) ?? []), node]);
  }

  // Waiting on the question on screen: the answer alone would unlock it.
  const category = active?.question.category ?? null;
  const waitingHere = (node: MapNode, key: string | null) => {
    const state = states.get(node.id)!;
    return (
      key === active?.key &&
      state.state === "locked" &&
      (state.missingContext.length > 0 || (state.missing.length === 1 && state.missing[0] === category))
    );
  };

  // The list, in trail order: each row's tasks, and the first deliverable where it's building.
  const listed: ListedTask[] = rows.flatMap((row) => {
    const beside = (row.key && byRow.get(row.key)) || [];
    const nodes = row.kind === "build" ? [...mapNodes.filter((n) => n.ploy_id === row.ploy.id), ...beside] : beside;
    return nodes.map((node) => ({ node, state: states.get(node.id)!, waitingHere: waitingHere(node, row.key) }));
  });

  return { rows, active, states, byRow, listed };
}
