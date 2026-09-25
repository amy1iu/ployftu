"use client";

import { X } from "lucide-react";
import { useState } from "react";
import type { IntegrationCategory } from "@/lib/catalog/integrations";
import { nodeState } from "@/lib/map/state";
import { useWorkspace } from "../workspace/workspace-provider";
import { ConnectModal } from "./connect-modal";
import { GrowthMap } from "./growth-map";

/** The growth map as a card (in ploy.ai's style): docked beside the chat on wide screens, over the page on narrow ones. */
export function MapPanel({ onClose }: { onClose?: () => void }) {
  const { ploys, integrations, mapNodes } = useWorkspace();
  const [connecting, setConnecting] = useState<{ category: IntegrationCategory; tool: string } | null>(null);
  const done = mapNodes.filter((n) => ["done", "live"].includes(nodeState(n, { ploys, integrations, mapNodes }).state)).length;

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <header className="relative z-10 flex shrink-0 items-start justify-between gap-6 px-6 pt-5">
        <div className="space-y-1.5">
          <h2 className="font-display text-[28px] leading-none tracking-wide text-ink uppercase">Your growth map</h2>
          <p className="max-w-[440px] text-[13px] leading-snug text-muted">
            Every card is a task Ploy can do for you. Keep chatting to unlock more, and hover or tap a task to start it.
          </p>
        </div>
        <div className="flex items-start gap-4">
          {mapNodes.length > 0 && (
            <div className="text-right">
              <p className="font-display text-[34px] leading-none text-ink">
                {done}/{mapNodes.length}
              </p>
              <p className="text-[12px] text-muted">tasks done</p>
            </div>
          )}
          {onClose && (
            <button type="button" aria-label="Close map" onClick={onClose} className="text-subtle">
              <X size={16} />
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <GrowthMap onConnect={(category, tool) => setConnecting({ category, tool })} />
      </div>
      {connecting && <ConnectModal {...connecting} onClose={() => setConnecting(null)} />}
    </section>
  );
}
