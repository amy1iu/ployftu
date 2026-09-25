"use client";

import Link from "next/link";
import { profileDocs, type SectionStatus } from "@/lib/docs/profile";
import { Markdown } from "../markdown";
import { useWorkspace } from "../workspace/workspace-provider";

// Profile docs in their defined order; deliverables after, oldest first.
const docOrder = (slug: string) => {
  const i = profileDocs.findIndex((d) => d.slug === slug);
  return i === -1 ? profileDocs.length : i;
};

// Read-only Docs tab. Placeholder layout until the real Docs UI is shared.
export function DocsView({ slug }: { slug?: string }) {
  const docs = useWorkspace().docs.toSorted((a, b) => docOrder(a.slug) - docOrder(b.slug));
  const current = docs.find((d) => d.slug === slug) ?? docs[0];

  const filled = (statuses: SectionStatus[]) => statuses.filter((s) => s !== "empty").length;

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 border-r border-border px-3 pt-5">
        <h1 className="mb-3 px-2 text-[17px]">Docs</h1>
        {(["profile", "deliverable"] as const).map((kind) => {
          const group = docs.filter((d) => d.kind === kind);
          if (!group.length) return null;
          return (
            <section key={kind} className="mb-4">
              <h2 className="mb-1 px-2 text-[12px] text-subtle">{kind === "profile" ? "Business profile" : "Deliverables"}</h2>
              {group.map((doc) => {
                const statuses = Object.values(doc.sections).map((s) => s.status);
                return (
                  <Link
                    key={doc.id}
                    href={`/docs/${doc.slug}`}
                    className={`flex h-[34px] items-center justify-between rounded-lg px-2 text-[14px] ${
                      doc.id === current?.id ? "bg-active" : "hover:bg-hover"
                    }`}
                  >
                    <span className="truncate">{doc.title}</span>
                    {kind === "profile" && (
                      <span className="text-[11px] text-subtle tabular-nums">
                        {filled(statuses)}/{statuses.length}
                      </span>
                    )}
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {current ? (
          <article className="mx-auto max-w-[702px] px-8 pt-8 pb-16 text-[14px] leading-[22px]">
            <Markdown>{current.content_md}</Markdown>
            <p className="mt-8 text-[12px] text-subtle">Updated {new Date(current.updated_at).toLocaleString()}</p>
          </article>
        ) : (
          <p className="p-8 text-subtle">No docs yet.</p>
        )}
      </div>
    </div>
  );
}
