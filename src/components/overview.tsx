"use client";

import { Globe, LayoutGrid, Megaphone, MessagesSquare, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { startMapLevel, startPloy } from "@/app/actions";
import { getSpec, templates } from "@/lib/catalog";
import { regions, type RegionId } from "@/lib/catalog/regions";
import { nodeState } from "@/lib/map/state";
import { currentUser } from "@/lib/mock-data";
import { Composer } from "./chat/composer";
import { PloyAvatar } from "./ploy-avatar";
import { useWorkspace } from "./workspace/workspace-provider";

// Overview: where they land after onboarding, and come back to. Ask Ploy for
// anything (starts a new ploy), pick up a ready task, or browse Ploybooks. The
// task list sits on the right, as beside Getting Started.

const noSubscribe = () => () => {};
const greetingFor = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

const regionIcon: Record<RegionId, typeof Globe> = {
  site_brand: Globe,
  leads_data: LayoutGrid,
  campaigns: Megaphone,
  measure: Sparkles,
};

export function Overview() {
  const router = useRouter();
  const { workspace, ploys, mapNodes, integrations, docs } = useWorkspace();
  const [starting, startTransition] = useTransition();
  // Their local hour: unknown on the server, so the greeting fills in on the client.
  const hour = useSyncExternalStore(noSubscribe, () => new Date().getHours(), () => null);
  const greeting = hour === null ? null : greetingFor(hour);

  const ready = mapNodes
    .filter((node) => nodeState(node, { ploys, integrations, mapNodes, docs }).state === "available")
    .slice(0, 3);

  const go = (start: () => Promise<string>) =>
    startTransition(async () => {
      router.push(`/ploys/${await start()}`);
    });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[860px] px-6 pt-[14vh] pb-12">
        <p className="flex items-center justify-center gap-2 text-[17px] text-muted">
          <PloyAvatar size={20} />
          {greeting ? `${greeting}, ${currentUser.firstName}` : `Hi, ${currentUser.firstName}`}
        </p>
        <h1 className="mt-3 text-center text-[34px] font-medium tracking-[-0.01em] text-ink">What should we work on?</h1>

        <div className="mx-auto mt-8 max-w-[760px]">
          <Composer disabled={starting} onSend={(text) => go(() => startPloy(workspace.id, text))} />
          {ready.length > 0 && (
            <ul className="mt-5 space-y-1">
              {ready.map((node) => {
                const Icon = regionIcon[node.region as RegionId] ?? MessagesSquare;
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      disabled={starting}
                      onClick={() => go(() => startMapLevel(node.id))}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] text-ink hover:bg-hover disabled:opacity-60"
                    >
                      <Icon size={17} strokeWidth={1.5} className="shrink-0 text-muted" />
                      {node.title}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Ploybooks suggested={mapNodes.map((n) => n.spec_id)} />
      </div>
    </div>
  );
}

/** The Ploybook library, mocked: suggested for them (on their map) and every template by region. */
function Ploybooks({ suggested }: { suggested: string[] }) {
  const [tab, setTab] = useState<"suggested" | RegionId>("suggested");
  const mine = [...new Set(suggested)].map((id) => getSpec(id)).filter((s) => s?.source === "template");
  const tabs = [
    { id: "suggested" as const, label: "Suggested", specs: mine },
    ...regions.map((r) => ({ id: r.id, label: r.name, specs: templates.filter((t) => t.region === r.id) })),
  ];
  const shown = tabs.find((t) => t.id === tab)!.specs;

  return (
    <section className="mt-16">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] text-muted">Ploybooks</h2>
        {/* The full library is mocked for now. */}
        <span className="flex items-center gap-1.5 text-[14px] text-muted">
          <LayoutGrid size={15} strokeWidth={1.5} /> Explore library
        </span>
      </div>
      <div className="mt-3 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[14px] ${tab === t.id ? "bg-active text-ink" : "text-muted hover:text-ink"}`}
          >
            {t.label} <span className="text-subtle">{t.specs.length}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(
          (spec) =>
            spec && (
              <div key={spec.id} className="rounded-xl border border-border bg-surface p-4">
                <span className="flex size-10 items-center justify-center rounded-full border border-border bg-white">
                  <PloyAvatar size={22} />
                </span>
                <p className="mt-3 text-[16px] leading-snug font-medium text-ink">{spec.name}</p>
                <p className="mt-0.5 text-[13px] text-muted">by Ploy</p>
                <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-muted">{spec.goal}</p>
              </div>
            ),
        )}
      </div>
    </section>
  );
}
