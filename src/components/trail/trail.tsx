"use client";

import { Home } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { confirmProfile, fixProfile } from "@/app/actions";
import type { OnboardingUIMessage } from "@/lib/ai/onboarding/messages";
import type { IntegrationCategory } from "@/lib/catalog/integrations";
import { readSection } from "@/lib/docs/markdown";
import { ConnectModal } from "../map/connect-modal";
import { ACTIVE_QUESTION_ID, useTaskPanel } from "../tasks/task-panel";
import { useWorkspace } from "../workspace/workspace-provider";
import { EndNode } from "./end-node";
import { useTrailLayout } from "./layout";
import { AnsweredNode, BuildNode, ForkCards, NextCardPlaceholder, QuestionCard, ReplyNode, SiteReadNode, type Answer } from "./nodes";
import { TaskCard } from "./task-card";

// Getting Started as one experience: a map that reads top-down like a chat.
// The spine is questions (answered ones collapse to pills showing what the
// answer meant) and background work; tasks branch off the question that
// revealed them, or the one whose answer they're waiting on.

/** One row: a node on the spine, with its tasks branching left and right (below it on phones). */
function TrailRow({
  left,
  right,
  children,
  spine = "through",
}: {
  left: ReactNode[];
  right: ReactNode[];
  children: ReactNode;
  /** The spine starts at home base and ends at the last node. */
  spine?: "from" | "through" | "to";
}) {
  const spineLine = { from: "before:top-1/2 before:bottom-0", through: "before:inset-y-0", to: "before:top-0 before:bottom-1/2" }[spine];
  const line = <span className="w-4 shrink-0 border-t border-dashed border-ink/20" aria-hidden />;
  return (
    <div className="grid grid-cols-1 items-center md:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)]">
      <div className="hidden flex-col items-end gap-2 py-1.5 md:flex">
        {left.map((card, i) => (
          <div key={i} className="flex items-center">
            {card}
            {line}
          </div>
        ))}
      </div>
      <div
        className={`relative flex justify-center py-2.5 before:absolute before:left-1/2 before:border-l before:border-dashed before:border-ink/20 ${spineLine}`}
      >
        <div className="relative flex justify-center">{children}</div>
      </div>
      <div className="hidden flex-col items-start gap-2 py-1.5 md:flex">
        {right.map((card, i) => (
          <div key={i} className="flex items-center">
            {line}
            {card}
          </div>
        ))}
      </div>
      {left.length + right.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 pb-2 md:hidden">{[...left, ...right]}</div>
      )}
    </div>
  );
}

function FogCard() {
  return (
    <div className="w-[172px] rounded-xl border border-dashed border-ink/15 px-2.5 py-3 text-center text-[11px] text-subtle">
      <p className="text-[13px]">?</p>
      Answer to reveal a task
    </div>
  );
}

export function Trail({
  messages,
  busy,
  onAnswer,
  onRedo,
  onAsk,
  footer,
}: {
  messages: OnboardingUIMessage[];
  busy: boolean;
  onAnswer: (answer: Answer) => void;
  /** Change an earlier answer. */
  onRedo: (answer: Answer) => void;
  onAsk: (text: string) => void;
  /** Shown at the end of the trail (e.g. an error with a retry). */
  footer?: ReactNode;
}) {
  const { workspace, mapNodes, docs } = useWorkspace();
  const [, startTransition] = useTransition();
  const [hovered, setHovered] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ category: IntegrationCategory; tool: string } | null>(null);
  // One task selected across the map and the list beside it; hovering either tints the other.
  const panel = useTaskPanel();
  const withList = panel.available && panel.open;
  const scroller = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const { rows, active, states, byRow } = useTrailLayout(messages, busy);

  // Picked in the list: bring its card into view on the map too.
  const { selected, selectedFrom, jumpPending, finishJump } = panel;
  useEffect(() => {
    if (selected && selectedFrom === "list")
      scroller.current?.querySelector(`[data-task-id="${selected}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected, selectedFrom]);
  // "Answer ↓" from a task ploy: finish the jump once the trail is back on screen.
  useEffect(() => {
    if (jumpPending) finishJump();
  }, [jumpPending, finishJump]);

  const cardsFor = (key: string | null) => {
    const nodes = (key && byRow.get(key)) || [];
    const cards = nodes.map((node) => (
      <TaskCard
        key={node.id}
        node={node}
        state={states.get(node.id)!}
        highlighted={hovered === key || panel.hovered === node.id}
        selected={withList && selected === node.id}
        onSelect={withList ? () => panel.select(selected === node.id ? null : node.id, "map") : undefined}
        onHover={(on) => panel.setHovered(on ? node.id : null)}
        onConnect={(category, tool) => setConnecting({ category, tool })}
      />
    ));
    if (key === "goal_detail" && active?.key === "goal_detail" && !cards.length) cards.push(<FogCard key="fog-1" />, <FogCard key="fog-2" />);
    return { left: cards.filter((_, i) => i % 2 === 1), right: cards.filter((_, i) => i % 2 === 0) };
  };

  const scrollKey = `${rows.length}:${workspace.crawl?.status}:${workspace.crawl?.pages.length}:${mapNodes.length}`;
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [scrollKey]);

  const logo = workspace.logo_url ?? workspace.favicon_url;
  // Once they've corrected what they do, show their words instead of the site's one-liner.
  const overview = docs.find((d) => d.slug === "business-overview");
  const profile =
    overview?.sections["what-we-do"]?.source === "user" ? readSection(overview.content_md, "What we do") : null;

  return (
    <div className="flex min-h-0 flex-1">
      <div ref={scroller} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[980px] px-4 pb-10">
          <div className="sticky top-0 z-20 -mx-4 mb-1 flex items-start justify-between gap-4 bg-background px-4 pt-4 pb-3">
            <div>
              <h2 className="text-[17px] font-medium text-ink">Your growth map</h2>
              <p className="mt-0.5 max-w-[420px] text-[13px] leading-snug text-muted">
                Answer a few quick questions. Each answer unlocks tasks Ploy can do for you.
              </p>
            </div>
          </div>

          {rows.map((row) => {
            const { left, right } = cardsFor(row.key);
            switch (row.kind) {
              case "home":
                return (
                  <TrailRow key="home" left={[]} right={[]} spine="from">
                    <div className="flex flex-col items-center gap-1">
                      <span className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-ink/20 bg-white text-ink">
                        {logo ? (
                          // Their own logo, from their site; external, so a plain img.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt="" className="size-6 object-contain" />
                        ) : (
                          <Home size={17} />
                        )}
                      </span>
                      <span className="bg-background px-1.5 text-[13px] font-medium text-ink">
                        {workspace.name === "New workspace" ? "Your business" : workspace.name}
                      </span>
                    </div>
                  </TrailRow>
                );
              case "answered":
                return (
                  <TrailRow key={row.key} left={left} right={right}>
                    <AnsweredNode
                      slot={row.slot}
                      summary={row.summary}
                      asked={row.asked}
                      said={row.said}
                      tasks={left.length + right.length}
                      pending={row.pending}
                      disabled={busy}
                      onHover={(on) => setHovered(on ? row.key : null)}
                      onRedo={onRedo}
                    />
                  </TrailRow>
                );
              case "read":
                return (
                  <TrailRow key="read" left={left} right={right}>
                    <SiteReadNode
                      crawl={workspace.crawl!}
                      logo={logo}
                      profile={profile}
                      onConfirm={() => startTransition(() => confirmProfile(workspace.id))}
                      onFix={(correction) => fixProfile(workspace.id, correction)}
                    />
                  </TrailRow>
                );
              case "build":
                return (
                  <TrailRow key="build" left={left} right={right}>
                    <BuildNode ploy={row.ploy} />
                  </TrailRow>
                );
              case "reply":
                return (
                  <TrailRow key={`reply-${row.id}`} left={[]} right={[]}>
                    {row.text ? <ReplyNode said={row.said} text={row.text} /> : <ReplyNode said={row.said} text="…" />}
                  </TrailRow>
                );
              case "thinking":
                return (
                  <TrailRow key="thinking" left={[]} right={[]}>
                    <NextCardPlaceholder />
                  </TrailRow>
                );
              case "question":
                if (row.question.alt)
                  return (
                    <div key="fork" id={ACTIVE_QUESTION_ID} className="relative flex justify-center pb-2">
                      <span className="absolute top-0 left-1/2 h-3 border-l border-dashed border-ink/20" aria-hidden />
                      <ForkCards question={row.question} disabled={busy} onAnswer={onAnswer} />
                    </div>
                  );
                return (
                  <TrailRow key={`q-${row.key}`} left={left} right={right}>
                    <div id={ACTIVE_QUESTION_ID}>
                      <QuestionCard
                        card={row.question}
                        slot={row.question.slot}
                        lead={row.lead}
                        unlocks={row.question.unlocks}
                        disabled={busy}
                        onAnswer={onAnswer}
                      />
                    </div>
                  </TrailRow>
                );
              case "end":
                return (
                  <TrailRow key="end" left={left} right={right} spine="to">
                    <EndNode disabled={busy} onAsk={onAsk} />
                  </TrailRow>
                );
            }
          })}
          <div ref={bottom} />
        </div>
        {footer}
      </div>
      {connecting && <ConnectModal {...connecting} onClose={() => setConnecting(null)} />}
    </div>
  );
}
