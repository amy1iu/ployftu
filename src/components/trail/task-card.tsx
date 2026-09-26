"use client";

import { Check, Clock, LoaderCircle, Lock, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getSpec } from "@/lib/catalog";
import type { IntegrationCategory } from "@/lib/catalog/integrations";
import { regions, type RegionId } from "@/lib/catalog/regions";
import type { MapNode } from "@/lib/db/types";
import type { NodeState } from "@/lib/map/state";
import { TaskDetails } from "../map/task-details";
import { regionTheme } from "../map/theme";
import { useClickOutside } from "../use-click-outside";

const OPEN_AFTER_MS = 250;
const CLOSE_AFTER_MS = 150;

const stateIcon: Partial<Record<NodeState["state"], React.ReactNode>> = {
  locked: <Lock size={12} className="mt-[3px] shrink-0" />,
  running: <LoaderCircle size={12} className="mt-[3px] shrink-0 animate-spin" />,
  done: <Check size={12} strokeWidth={3} className="mt-[3px] shrink-0" />,
  live: <Star size={12} fill="currentColor" className="mt-[3px] shrink-0" />,
};

/**
 * A task on the trail: its region, its full title, and how long it takes,
 * tinted by region (dashed while locked). Beside the task list, a click
 * selects it there, where its status and details live. Without the list
 * (narrow screens), hover or tap opens the details right here.
 */
export function TaskCard({
  node,
  state,
  highlighted,
  selected,
  onSelect,
  onHover,
  onConnect,
}: {
  node: MapNode;
  state: NodeState;
  /** Its answer, or its row in the list, is hovered. */
  highlighted: boolean;
  selected: boolean;
  /** Select it in the task list; without one, the details open here. */
  onSelect?: () => void;
  onHover?: (hovering: boolean) => void;
  onConnect: (category: IntegrationCategory, tool: string) => void;
}) {
  // Without the list: hover opens the details after a moment; a click pins them until a click elsewhere.
  const [mode, setMode] = useState<"closed" | "hover" | "pinned">("closed");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  const open = !onSelect && mode !== "closed";
  useClickOutside(ref, mode === "pinned", () => setMode("closed"));
  useEffect(() => () => clearTimeout(timer.current), []);
  const later = (fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  const enter = () => {
    onHover?.(true);
    if (!onSelect) later(() => setMode((m) => (m === "closed" ? "hover" : m)), OPEN_AFTER_MS);
  };
  const leave = () => {
    onHover?.(false);
    if (!onSelect) later(() => setMode((m) => (m === "hover" ? "closed" : m)), CLOSE_AFTER_MS);
  };

  const region = node.region as RegionId;
  const theme = regionTheme[region];
  const locked = state.state === "locked";
  const finished = state.state === "done" || state.state === "live";

  return (
    <div
      ref={ref}
      className="relative rounded-xl"
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <button
        type="button"
        data-task-id={node.id}
        onClick={() => {
          if (onSelect) return onSelect();
          clearTimeout(timer.current);
          setMode((m) => (m === "pinned" ? "closed" : "pinned"));
        }}
        aria-expanded={open || selected}
        aria-label={`${node.title}: details`}
        className={`w-[172px] animate-[level-pop_400ms_ease-out] cursor-pointer rounded-xl border px-2.5 py-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.1)] ${
          locked ? "border-dashed border-ink/20 bg-white/60 text-muted hover:border-ink/35" : "border-transparent text-ink hover:border-ink/15"
        } ${selected ? "ring-2 ring-ink/35" : highlighted || open ? "ring-2 ring-ink/15" : ""}`}
        style={locked ? undefined : { background: theme.tint }}
      >
        <span className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted">
          <span className="size-[7px] rounded-full" style={{ background: theme.dot }} />
          {regions.find((r) => r.id === region)?.name}
          {!finished && (
            <span className="ml-auto flex items-center gap-0.5 text-subtle">
              <Clock size={10} /> {getSpec(node.spec_id)?.estMinutes ?? 3} min
            </span>
          )}
        </span>
        <span className="flex items-start gap-1 text-[13px] leading-snug font-medium">
          {stateIcon[state.state]}
          <span>{node.title}</span>
        </span>
      </button>
      {open && (
        <div className="absolute top-full left-1/2 z-30 mt-2 -translate-x-1/2">
          <TaskDetails node={node} onConnect={onConnect} onPin={() => setMode("pinned")} />
        </div>
      )}
    </div>
  );
}
