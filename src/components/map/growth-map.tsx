"use client";

import { Check, LoaderCircle, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getSpec } from "@/lib/catalog";
import { agentTools } from "@/lib/catalog/agent-tools";
import type { IntegrationCategory } from "@/lib/catalog/integrations";
import { primitives } from "@/lib/catalog/primitives";
import { regions, type RegionId } from "@/lib/catalog/regions";
import type { MapNode } from "@/lib/db/types";
import { mapFocus, nodeState, type NodeState } from "@/lib/map/state";
import { useClickOutside } from "../use-click-outside";
import { useWorkspace } from "../workspace/workspace-provider";
import { center, labelPosition, MIN_SIZE, nodePosition, type MapSize } from "./layout";
import { TaskDetails } from "./task-details";
import { regionColors } from "./theme";

/** Below this the map shows tasks as dots instead of cards. */
const CARD_MODE = { width: 640, height: 620 };

/** Tracks an element's size, so the map can fill its panel. */
function useSize(ref: React.RefObject<HTMLElement | null>): MapSize {
  const [size, setSize] = useState<MapSize>(MIN_SIZE);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(MIN_SIZE.width, entry.contentRect.width),
        height: Math.max(MIN_SIZE.height, entry.contentRect.height),
      }),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** A task's checkbox: empty (ready), lock, spinner, or ticked. */
function TaskCheck({ state, color }: { state: NodeState["state"]; color: string }) {
  if (state === "locked")
    return (
      <span className="flex size-[18px] shrink-0 items-center justify-center text-subtle">
        <Lock size={13} />
      </span>
    );
  if (state === "running") return <LoaderCircle size={18} className="shrink-0 animate-spin text-ink" />;
  if (state === "done" || state === "live")
    return (
      <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-white">
        <Check size={11} strokeWidth={3.5} />
      </span>
    );
  return <span className="size-[18px] shrink-0 rounded-full border-2 border-ink/25" style={{ background: color }} />;
}

const stepNames = (specId: string) =>
  [...new Set((getSpec(specId)?.steps ?? []).map((s) => (s.kind === "primitive" ? primitives[s.primitive].name : agentTools[s.tool].name)))];

/** A task on the map, as a card: checkbox, what it does, and how long / what it needs. */
function TaskCard({ node, state, lockReason, color, selected }: { node: MapNode; state: NodeState["state"]; lockReason: string | null; color: string; selected: boolean }) {
  const spec = getSpec(node.spec_id);
  const meta =
    state === "locked"
      ? lockReason
      : state === "running"
        ? "Running…"
        : state === "done" || state === "live"
          ? "Done"
          : `${spec?.estMinutes ?? 3} min · ${stepNames(node.spec_id).slice(0, 2).join(", ")}`;
  const done = state === "done" || state === "live";
  return (
    <span
      className={`flex w-[212px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition group-hover:-translate-y-0.5 group-hover:shadow-[0_6px_16px_rgba(0,0,0,0.1)] ${
        state === "locked" ? "border-ink/5 bg-canvas" : "border-ink/10 bg-white"
      } ${selected ? "ring-2 ring-ink" : ""}`}
      style={done ? { background: `color-mix(in srgb, ${color} 55%, white)` } : undefined}
    >
      <TaskCheck state={state} color={color} />
      <span className="min-w-0">
        <span className={`line-clamp-2 text-[12.5px] leading-tight font-medium ${state === "locked" ? "text-muted" : "text-ink"}`}>
          {node.title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-tight text-subtle">{meta}</span>
      </span>
    </span>
  );
}

/** Compact version for small panels: a dot in the region's color, titled underneath. */
function TaskDot({ node, state, color, selected }: { node: MapNode; state: NodeState["state"]; color: string; selected: boolean }) {
  return (
    <>
      <span
        className={`flex size-9 items-center justify-center rounded-full border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.15)] transition-transform group-hover:scale-110 ${
          state === "locked" ? "bg-canvas" : ""
        } ${selected ? "ring-2 ring-ink" : ""}`}
        style={state === "locked" ? undefined : { background: color }}
      >
        <TaskCheck state={state} color="transparent" />
      </span>
      <span className="pointer-events-none absolute top-full mt-1 w-28 truncate text-center text-[11px] leading-tight text-muted">
        {node.title}
      </span>
    </>
  );
}

// Hovering a task shows its card; moving onto the card keeps it open, and
// clicking a task (or typing in its card) pins it until you click elsewhere.
const CLOSE_DELAY_MS = 180;

/**
 * The growth map: the user's business in the middle, and tasks (Ploybooks
 * worth doing for them) spreading out by region as they answer questions.
 */
export function GrowthMap({ onConnect }: { onConnect: (category: IntegrationCategory, tool: string) => void }) {
  const { workspace, ploys, mapNodes, integrations } = useWorkspace();
  const container = useRef<HTMLDivElement>(null);
  const size = useSize(container);
  const cards = size.width >= CARD_MODE.width && size.height >= CARD_MODE.height;
  const mode = cards ? "cards" : "dots";
  // What the pointer is on, and what it was last on (kept briefly, so it can cross to the card).
  const [hovered, setHovered] = useState<string | null>(null);
  const [lingering, setLingering] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  useClickOutside(container, !!pinnedId, () => setPinnedId(null));
  useEffect(() => {
    if (hovered) return;
    const timer = setTimeout(() => setLingering(null), CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hovered]);

  const focus = mapFocus(workspace, ploys);
  // The first deliverable sits with home base; regions hold the tasks after it.
  const isFirstWin = (n: MapNode) => getSpec(n.spec_id)?.source === "quick_win";
  const firstWin = mapNodes.find(isFirstWin) ?? null;
  const tasks = mapNodes.filter((n) => !isFirstWin(n));
  const byRegion = (region: RegionId) => tasks.filter((n) => n.region === region).sort((a, b) => a.slot - b.slot);
  const home = center(size);

  const hover = (id: string | null) => {
    setHovered(id);
    if (id) setLingering(id);
  };
  const shownId = hovered ?? lingering ?? pinnedId;
  const shown = mapNodes.find((n) => n.id === shownId);
  const shownPos =
    shown && (isFirstWin(shown) ? { x: home.x, y: home.y + 62 } : nodePosition(size, mode, shown.region as RegionId, shown.slot));
  // Cards open above their task, or below it near the top edge; always inside the panel.
  const cardAbove = shownPos && shownPos.y > 330;
  const cardLeft = shownPos && Math.min(Math.max(shownPos.x, 162), size.width - 162);
  const gap = cards ? 34 : 28;

  const nodeProps = (node: MapNode) => ({
    onMouseEnter: () => hover(node.id),
    onMouseLeave: () => hover(null),
    onClick: () => setPinnedId((id) => (id === node.id ? null : node.id)),
    "aria-expanded": shownId === node.id,
  });

  return (
    <div
      ref={container}
      className="relative h-full w-full overflow-hidden"
      style={{ minWidth: MIN_SIZE.width, minHeight: MIN_SIZE.height }}
    >
      {/* Each region glows in its color once revealed; fog until then. */}
      {regions.map(({ id }) => {
        const revealed = focus.revealed.includes(id);
        const glow = nodePosition(size, mode, id, 1);
        const emphasized = focus.emphasized.includes(id);
        return (
          <div
            key={id}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition-opacity duration-700"
            style={{
              left: glow.x,
              top: glow.y,
              width: size.width * 0.55,
              height: size.height * 0.5,
              background: `radial-gradient(closest-side, ${revealed ? regionColors[id] : "rgba(180,180,180,0.55)"}, transparent)`,
              opacity: revealed ? (emphasized ? 0.95 : 0.6) : 0.7,
            }}
            aria-hidden
          />
        );
      })}

      {/* Paths from home base out through each region's tasks. */}
      <svg width={size.width} height={size.height} className="absolute inset-0" aria-hidden>
        {regions.map(({ id }) => {
          const nodes = byRegion(id);
          if (!nodes.length) return null;
          const points = [home, ...nodes.map((n) => nodePosition(size, mode, id, n.slot))];
          return (
            <polyline
              key={id}
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--color-ink)"
              strokeOpacity={0.18}
              strokeWidth={1.5}
              strokeDasharray="3 5"
            />
          );
        })}
      </svg>

      {/* Region tags, in Ploy's dark-pill style. */}
      {regions.map(({ id, name }) => {
        const revealed = focus.revealed.includes(id);
        const label = labelPosition(size, mode, id);
        return (
          <span
            key={id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase ${
              revealed ? "bg-ink" : "bg-ink/10 text-subtle"
            }`}
            style={{ left: label.x, top: label.y, color: revealed ? regionColors[id] : undefined }}
          >
            {revealed ? name : "???"}
          </span>
        );
      })}

      {/* Home base: their business, with the first deliverable pinned under it. */}
      <div
        className="absolute flex w-44 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
        style={{ left: home.x, top: home.y + 10 }}
      >
        <div className="flex size-[72px] items-center justify-center overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          {workspace.logo_url || workspace.favicon_url ? (
            // Their own logo, from their site; external, so a plain img.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={(workspace.logo_url ?? workspace.favicon_url)!} alt="" className="max-h-11 max-w-14 object-contain" />
          ) : (
            <span className="font-display text-[28px] text-ink">{workspace.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span className="max-w-44 truncate text-center font-display text-[15px] tracking-wide text-ink uppercase">
          {workspace.name}
        </span>
        {firstWin && <FirstWinBadge node={firstWin} {...nodeProps(firstWin)} />}
        {!mapNodes.length && (
          <span className="rounded-full bg-ink/5 px-3 py-1 text-[12px] whitespace-nowrap text-muted">← Answer in the chat to reveal tasks</span>
        )}
      </div>

      {tasks.map((node) => {
        const { state, lockReason } = nodeState(node, { ploys, integrations, mapNodes });
        const pos = nodePosition(size, mode, node.region as RegionId, node.slot);
        const color = regionColors[node.region as RegionId];
        return (
          <button
            key={node.id}
            type="button"
            {...nodeProps(node)}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 animate-[level-pop_400ms_ease-out] flex-col items-center"
            style={{ left: pos.x, top: pos.y }}
          >
            {cards ? (
              <TaskCard node={node} state={state} lockReason={lockReason} color={color} selected={shownId === node.id} />
            ) : (
              <TaskDot node={node} state={state} color={color} selected={shownId === node.id} />
            )}
          </button>
        );
      })}

      {shown && shownPos && (
        <div
          className={`absolute z-20 -translate-x-1/2 ${cardAbove ? "-translate-y-full" : ""}`}
          style={{ left: cardLeft, top: cardAbove ? shownPos.y - gap : shownPos.y + gap }}
          onMouseEnter={() => hover(shown.id)}
          onMouseLeave={() => hover(null)}
        >
          <TaskDetails node={shown} onConnect={onConnect} onPin={() => setPinnedId(shown.id)} />
        </div>
      )}
    </div>
  );
}

/** The first deliverable, pinned under home base. */
function FirstWinBadge({ node, ...props }: { node: MapNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { ploys, integrations, mapNodes } = useWorkspace();
  const { state } = nodeState(node, { ploys, integrations, mapNodes });
  return (
    <button
      type="button"
      {...props}
      className="flex max-w-44 animate-[level-pop_400ms_ease-out] items-center gap-1.5 rounded-full border border-ink/10 bg-white py-1 pr-3 pl-1 text-[11px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-canvas"
    >
      <TaskCheck state={state} color={regionColors[node.region as RegionId]} />
      <span className="truncate">{node.title}</span>
    </button>
  );
}
