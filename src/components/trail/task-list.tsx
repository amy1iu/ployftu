"use client";

import { ArrowUpDown, CircleCheck, LoaderCircle, Lock, PanelRight, SlidersHorizontal, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { startMapLevel } from "@/app/actions";
import { getSpec } from "@/lib/catalog";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { regions, type RegionId } from "@/lib/catalog/regions";
import type { NodeState } from "@/lib/map/state";
import { useAnchor } from "../floating";
import { TaskDetails } from "../map/task-details";
import { regionTheme } from "../map/theme";
import { Tooltip } from "../tooltip";
import { useWorkspace } from "../workspace/workspace-provider";
import type { ListedTask } from "./layout";

// Every task on the trail as a list pinned beside the page, so tasks near the
// top stay reachable as the trail grows. Selecting a task (here or on the map)
// scrolls it into view and opens its details from the list.

type Filter = "all" | "ready" | "needs" | "done";
const groupOf = (s: NodeState["state"]): Exclude<Filter, "all"> =>
  s === "available" ? "ready" : s === "locked" ? "needs" : "done";
const groups: { id: Exclude<Filter, "all">; label: string }[] = [
  { id: "ready", label: "Ready to start" },
  { id: "needs", label: "Needs you" },
  { id: "done", label: "Underway and done" },
];

/** Opens after the list has scrolled the task into view. */
const OPEN_AFTER_SCROLL_MS = 320;
const DETAILS_WIDTH = 300;
/** Roughly the details' height: below this much room, they line up with the task's bottom instead of its top. */
const DETAILS_ROOM = 380;

/** The tools they told us they use, by capability. */
type Preferred = Partial<Record<IntegrationCategory, string>>;

function statusLine({ node, state, waitingHere }: ListedTask, preferred: Preferred) {
  const minutes = `${getSpec(node.spec_id)?.estMinutes ?? 3} min`;
  switch (state.state) {
    case "available":
      return `Ready · ${minutes}`;
    case "running":
      return "Running…";
    case "done":
      return "Done";
    case "live":
      return "Live · runs on its own";
    case "locked":
      if (waitingHere) return `Answer to unlock · ${minutes}`;
      if (state.missing.length)
        return state.missing.length === 1 && preferred[state.missing[0]]
          ? `Connect ${preferred[state.missing[0]]} to unlock`
          : `Needs ${state.missing.map((c) => integrationCategories[c].need).join(" and ")}`;
      return state.lockReason ?? "Locked";
  }
}

function Action({ task, onOpen, onJump }: { task: ListedTask; onOpen: () => void; onJump: () => void }) {
  const router = useRouter();
  const [starting, startTransition] = useTransition();
  const { node, state, waitingHere } = task;
  const button = "rounded-full border border-ink/15 bg-white px-2.5 py-0.5 text-[11.5px] text-ink hover:bg-canvas disabled:opacity-60";
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  if (state.state === "available")
    return (
      <button
        type="button"
        disabled={starting}
        onClick={stop(() =>
          startTransition(async () => {
            const ployId = await startMapLevel(node.id);
            router.push(`/ploys/${ployId}`);
          }),
        )}
        className={button}
      >
        {starting ? "Starting…" : "Start"}
      </button>
    );
  if (node.ploy_id && state.state !== "locked")
    return (
      <Link href={`/ploys/${node.ploy_id}`} onClick={(e) => e.stopPropagation()} className={button}>
        Open
      </Link>
    );
  if (waitingHere)
    return (
      <button type="button" onClick={stop(onJump)} className={button}>
        Answer ↓
      </button>
    );
  if (state.missing.length)
    return (
      <button type="button" onClick={stop(onOpen)} className={button}>
        Connect
      </button>
    );
  return null;
}

export function TaskList({
  tasks,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onConnect,
  onJump,
  onCollapse,
}: {
  tasks: ListedTask[];
  selectedId: string | null;
  /** Hovered on the map: tinted here too. */
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onConnect: (category: IntegrationCategory, tool: string) => void;
  /** Scroll the trail to the question on screen. */
  onJump: () => void;
  onCollapse: () => void;
}) {
  const preferred: Preferred = useWorkspace().workspace.entry.tools ?? {};
  const [filter, setFilter] = useState<Filter>("all");
  const items = useRef(new Map<string, HTMLDivElement>());
  const scroller = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const { anchor, capture, clear } = useAnchor();
  const selected = tasks.find((t) => t.node.id === selectedId);
  // A task selected on the map that the filter hides: show everything.
  const shownFilter = selected && filter !== "all" && groupOf(selected.state.state) !== filter ? "all" : filter;

  // Scroll the selected task into view, then open its details beside it.
  useEffect(() => {
    clear();
    if (!selectedId) return;
    const item = items.current.get(selectedId);
    if (!item) return;
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => capture(item), OPEN_AFTER_SCROLL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reopen only when the selection changes
  }, [selectedId]);

  // Keep the details beside their task as the list scrolls; close on Escape or a click elsewhere.
  useEffect(() => {
    if (!anchor || !selectedId) return;
    const follow = () => {
      const item = items.current.get(selectedId);
      if (item) capture(item);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && onSelect(null);
    const outside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (details.current?.contains(target) || target.closest("[data-task-id]")) return;
      onSelect(null);
    };
    const list = scroller.current;
    list?.addEventListener("scroll", follow);
    window.addEventListener("resize", follow);
    document.addEventListener("keydown", escape);
    document.addEventListener("mousedown", outside);
    return () => {
      list?.removeEventListener("scroll", follow);
      window.removeEventListener("resize", follow);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("mousedown", outside);
    };
  }, [anchor, selectedId, capture, onSelect]);

  const count = (f: Filter) => (f === "all" ? tasks.length : tasks.filter((t) => groupOf(t.state.state) === f).length);

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex h-10 items-center justify-between">
          <h2 className="text-[17px] text-muted">For you</h2>
          <div className="flex items-center gap-1 text-muted">
            {/* Show completed, filter, and sort are mocked for now. */}
            {[
              { label: "Show completed", icon: CircleCheck },
              { label: "Filter", icon: SlidersHorizontal },
              { label: "Sort", icon: ArrowUpDown },
            ].map(({ label, icon: Icon }) => (
              <Tooltip key={label} label={label} side="bottom">
                <button type="button" aria-label={label} className="flex size-8 items-center justify-center rounded-lg hover:bg-hover">
                  <Icon size={18} strokeWidth={1.5} />
                </button>
              </Tooltip>
            ))}
            <Tooltip label="Hide" side="bottom">
              <button
                type="button"
                aria-label="Hide tasks"
                onClick={onCollapse}
                className="flex size-8 items-center justify-center rounded-lg hover:bg-hover"
              >
                <PanelRight size={19} strokeWidth={1.5} className="fill-[#3a3a3a]/15" />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["all", "ready", "needs", "done"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-0.5 text-[12px] ${
                shownFilter === f ? "border-ink bg-ink text-white" : "border-border bg-white text-ink hover:bg-canvas"
              }`}
            >
              {{ all: "All", ready: "Ready", needs: "Needs you", done: "Done" }[f]}{" "}
              <span className={shownFilter === f ? "text-white/70" : "text-subtle"}>{count(f)}</span>
            </button>
          ))}
        </div>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {!tasks.length && (
          <p className="px-1 pt-4 text-[12.5px] text-subtle">Tasks show up here as you answer the questions on your map.</p>
        )}
        {groups
          .filter((g) => shownFilter === "all" || shownFilter === g.id)
          .map((group) => {
            const inGroup = tasks.filter((t) => groupOf(t.state.state) === group.id);
            if (!inGroup.length) return null;
            return (
              <section key={group.id}>
                <h3 className="px-1 pt-3 pb-1.5 text-[11.5px] text-subtle">{group.label}</h3>
                <div className="space-y-1.5">
                  {inGroup.map((task) => {
                    const { node, state } = task;
                    const theme = regionTheme[node.region as RegionId];
                    const isSelected = node.id === selectedId;
                    return (
                      <div
                        key={node.id}
                        ref={(el) => {
                          if (el) items.current.set(node.id, el);
                          else items.current.delete(node.id);
                        }}
                        data-task-id={node.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect(isSelected ? null : node.id)}
                        onKeyDown={(e) => e.key === "Enter" && onSelect(isSelected ? null : node.id)}
                        onMouseEnter={() => onHover(node.id)}
                        onMouseLeave={() => onHover(null)}
                        className={`cursor-pointer rounded-xl border bg-white px-3 py-2 transition ${
                          isSelected ? "border-ink/30 ring-2 ring-ink/10" : hoveredId === node.id ? "border-ink/25" : "border-border hover:border-ink/25"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] text-ink" style={{ background: theme.tint }}>
                          <span className="size-[6px] rounded-full" style={{ background: theme.dot }} />
                          {regions.find((r) => r.id === node.region)?.name}
                        </span>
                        <p className="mt-1.5 flex items-start gap-1 text-[13px] leading-snug font-medium text-ink">
                          {state.state === "locked" && <Lock size={12} className="mt-[3px] shrink-0 text-subtle" />}
                          {state.state === "running" && <LoaderCircle size={12} className="mt-[3px] shrink-0 animate-spin text-subtle" />}
                          {state.state === "live" && <Star size={12} fill="currentColor" className="mt-[3px] shrink-0" />}
                          {node.title}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-muted">
                          <span>{statusLine(task, preferred)}</span>
                          <Action task={task} onOpen={() => onSelect(node.id)} onJump={onJump} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>

      {selected &&
        anchor &&
        createPortal(
          // Opens from the task in the list, over the map to its left.
          <div
            ref={details}
            className="fixed z-40 origin-right animate-[level-pop_200ms_ease-out]"
            style={{
              left: Math.max(8, anchor.left - DETAILS_WIDTH - 10),
              ...(window.innerHeight - anchor.top >= DETAILS_ROOM
                ? { top: Math.max(8, anchor.top) }
                : { bottom: Math.max(8, window.innerHeight - anchor.bottom) }),
            }}
          >
            <TaskDetails node={selected.node} onConnect={onConnect} onPin={() => {}} />
          </div>,
          document.body,
        )}
    </aside>
  );
}
