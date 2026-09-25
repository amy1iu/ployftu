"use client";

import { Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startMapLevel } from "@/app/actions";
import { getSpec } from "@/lib/catalog";
import { agentTools } from "@/lib/catalog/agent-tools";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { primitives } from "@/lib/catalog/primitives";
import { regions, type RegionId } from "@/lib/catalog/regions";
import type { MapNode } from "@/lib/db/types";
import { nodeState } from "@/lib/map/state";
import { useWorkspace } from "../workspace/workspace-provider";
import { regionColors } from "./theme";

const stateLabel = { locked: "Locked", available: "Ready", running: "Running", done: "Done", live: "Live" };

/** Pick which tool provides a capability: the common ones, or type any other. */
function ToolPicker({
  category,
  onPick,
  onTyping,
}: {
  category: IntegrationCategory;
  onPick: (tool: string) => void;
  onTyping: () => void;
}) {
  const [other, setOther] = useState<string | null>(null);
  const { need, tools } = integrationCategories[category];
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted">Needs {need}. Which do you use?</p>
      <div className="flex flex-wrap gap-1.5">
        {tools.map((tool) => (
          <button
            key={tool}
            type="button"
            onClick={() => onPick(tool)}
            className="rounded-full border border-ink/15 px-2.5 py-1 text-[12px] hover:bg-canvas"
          >
            {tool}
          </button>
        ))}
        {other === null && (
          <button
            type="button"
            onClick={() => {
              setOther("");
              onTyping();
            }}
            className="rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] text-muted hover:bg-hover"
          >
            Something else
          </button>
        )}
      </div>
      {other !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (other.trim()) onPick(other.trim());
          }}
          className="flex gap-1.5"
        >
          <input
            autoFocus
            value={other}
            onChange={(e) => setOther(e.currentTarget.value)}
            placeholder={`e.g. ${category === "crm" ? "Close, Copper" : "the tool's name"}`}
            className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-[12px] outline-none focus:border-accent"
          />
          <button type="submit" disabled={!other.trim()} className="rounded-full bg-ink px-3 text-[12px] text-white disabled:opacity-40">
            Connect
          </button>
        </form>
      )}
    </div>
  );
}

/** A task up close: why it's worth doing, what it does (as Ploy primitives), and what it needs. */
export function TaskDetails({
  node,
  onConnect,
  onPin,
}: {
  node: MapNode;
  onConnect: (category: IntegrationCategory, tool: string) => void;
  /** Keeps the card open while the user types (it would otherwise close when the pointer leaves). */
  onPin: () => void;
}) {
  const { ploys, integrations, mapNodes } = useWorkspace();
  const router = useRouter();
  const [starting, startTransition] = useTransition();
  const spec = getSpec(node.spec_id);
  const { state, lockReason, missing } = nodeState(node, { ploys, integrations, mapNodes });
  const region = regions.find((r) => r.id === node.region);

  const start = () =>
    startTransition(async () => {
      const ployId = await startMapLevel(node.id);
      router.push(`/ploys/${ployId}`);
    });

  return (
    <div className="w-[308px] space-y-3 rounded-2xl border border-ink/10 bg-white p-4 text-left shadow-[0_16px_40px_rgba(0,0,0,0.16)]">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className="rounded-full bg-ink px-2 py-0.5 font-semibold tracking-wide uppercase"
            style={{ color: regionColors[node.region as RegionId] }}
          >
            {region?.name}
          </span>
          <span className="text-subtle">Task · {stateLabel[state]}</span>
        </div>
        <p className="text-[15px] leading-snug font-semibold text-ink">{node.title}</p>
      </div>

      {node.reason && <p className="text-[12.5px]">{node.reason}</p>}
      {node.blurb && node.blurb !== node.reason && <p className="text-[12.5px] text-muted">{node.blurb}</p>}

      {spec && (
        <div className="flex flex-wrap items-center gap-1.5">
          {spec.steps.map((step) => (
            <span
              key={step.label}
              title={step.label}
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                step.kind === "primitive" ? "bg-canvas text-ink" : "border border-ink/15 text-muted"
              }`}
            >
              {step.kind === "primitive" ? primitives[step.primitive].name : agentTools[step.tool].name}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1 text-[11px] text-subtle">
            <Clock size={11} /> {spec.estMinutes} min
          </span>
        </div>
      )}

      {state === "available" && (
        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="w-full rounded-full bg-ink py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {starting ? "Starting…" : "Start task"}
        </button>
      )}
      {(state === "running" || state === "done" || state === "live") && node.ploy_id && (
        <button
          type="button"
          onClick={() => router.push(`/ploys/${node.ploy_id}`)}
          className="w-full rounded-full border border-ink/15 py-2 text-[13px] font-medium hover:bg-canvas"
        >
          Open task
        </button>
      )}
      {state === "locked" &&
        (missing.length ? (
          <div className="space-y-3 border-t border-border pt-3">
            {missing.map((category) => (
              <ToolPicker key={category} category={category} onPick={(tool) => onConnect(category, tool)} onTyping={onPin} />
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-subtle">{lockReason}</p>
        ))}
    </div>
  );
}
