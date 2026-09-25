"use client";

import { Plug, X } from "lucide-react";
import { useTransition } from "react";
import { createPortal } from "react-dom";
import { connectIntegration } from "@/app/actions";
import { integrationCategories, type IntegrationCategory } from "@/lib/catalog/integrations";
import { useWorkspace } from "../workspace/workspace-provider";

/** A stand-in for OAuth: approving it records that `tool` provides `category`, so locked levels unlock. */
export function ConnectModal({
  category,
  tool,
  onClose,
}: {
  category: IntegrationCategory;
  tool: string;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const [pending, startTransition] = useTransition();
  const { need, scopes } = integrationCategories[category];

  // Portaled so the backdrop covers the whole app, not just the map panel it's opened from.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Connect ${tool}`}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-surface p-6 shadow-[0_16px_48px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Plug size={18} />
          </span>
          <button type="button" aria-label="Close" onClick={onClose} className="text-subtle">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-1">
          <p className="text-[16px] font-medium">Connect {tool}</p>
          <p className="text-[13px] text-muted">Connected as {need}, it lets Ploy:</p>
        </div>
        <ul className="space-y-1.5 text-[13px]">
          {scopes.map((scope) => (
            <li key={scope} className="flex gap-2">
              <span className="text-avatar">✓</span>
              {scope}
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-subtle">Demo: no real {tool} account is connected.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-3.5 py-1.5 text-[13px] hover:bg-hover">
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await connectIntegration(workspace.id, category, tool);
                onClose();
              })
            }
            className="rounded-full bg-[#0d0d0d] px-3.5 py-1.5 text-[13px] text-white disabled:opacity-60"
          >
            {pending ? "Connecting…" : "Allow"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
