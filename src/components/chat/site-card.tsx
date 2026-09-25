"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import type { SiteCrawl } from "@/lib/site/types";

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function Spinner() {
  return <LoaderCircle size={14} className="animate-spin text-subtle" />;
}

function PageList({ pages }: { pages: SiteCrawl["pages"] }) {
  return (
    <ul className="space-y-1">
      {pages.map((page) => (
        <li key={page.url} className="flex items-center gap-2 text-[13px] text-muted">
          {page.status === "reading" ? <Spinner /> : page.status === "done" ? <Check size={14} className="text-avatar" /> : <X size={14} />}
          <span className="font-mono">{page.path}</span>
        </li>
      ))}
    </ul>
  );
}

function Brand({ crawl }: { crawl: SiteCrawl }) {
  if (!crawl.brand) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-subtle">
        <Spinner /> Pulling your logo and brand colors…
      </p>
    );
  }
  const { logo, colors, fonts } = crawl.brand;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {logo && (
        // External logo from their site; next/image would need every domain allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-7 max-w-28 rounded object-contain" />
      )}
      {colors.map((color) => (
        <span key={color} title={color} className="size-5 rounded-full border border-border" style={{ background: color }} />
      ))}
      {fonts.length > 0 && <span className="text-[12px] text-subtle">{fonts.join(" · ")}</span>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 text-[13px]">
      <span className="text-subtle">{label}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * Reading the user's website, live: pages as they're read, then the profile we
 * drafted from it for them to confirm or fix. Follows workspaces.crawl over Realtime.
 */
export function SiteCard({
  crawl,
  onConfirm,
  onFix,
}: {
  crawl: SiteCrawl;
  onConfirm: () => void;
  onFix: () => void;
}) {
  const host = hostOf(crawl.url);

  if (crawl.status === "failed") {
    return (
      <div className="mx-2 rounded-xl border border-border bg-surface p-4 text-[13px] text-muted">
        I couldn&apos;t read {host}, so I&apos;ll learn about your business by asking a few questions instead.
      </div>
    );
  }

  if (crawl.status !== "done" || !crawl.summary) {
    return (
      <div className="mx-2 space-y-3 rounded-xl border border-border bg-surface p-4">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <Spinner /> {crawl.status === "reading" ? `Reading ${host}` : `Drafting your profile from ${host}`}
        </p>
        <PageList pages={crawl.pages} />
      </div>
    );
  }

  const { summary, opportunities } = crawl;
  const confirmed = !!crawl.confirmedAt;
  return (
    <div className="mx-2 space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-[13px] text-subtle">
          {confirmed ? <Check size={14} className="text-avatar" /> : null}
          {confirmed ? `Profile confirmed · from ${host}` : `Here's what I found on ${host}`}
        </p>
        <p className="font-medium">{summary.oneLiner}</p>
      </div>

      <div className="space-y-2">
        <Row label="Who you serve">{summary.whoYouServe}</Row>
        <Row label="Voice">{summary.toneWords.join(" · ")}</Row>
        <Row label="Brand">
          <Brand crawl={crawl} />
        </Row>
        {opportunities.length > 0 && (
          <Row label="Opportunities">
            <ul className="space-y-1">
              {opportunities.map((o) => (
                <li key={o.title}>{o.title}</li>
              ))}
            </ul>
          </Row>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!confirmed && (
          <>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-full bg-[#0d0d0d] px-3.5 py-1.5 text-[13px] text-white hover:opacity-90"
            >
              Looks right
            </button>
            <button
              type="button"
              onClick={onFix}
              className="rounded-full border border-border px-3.5 py-1.5 text-[13px] hover:bg-hover"
            >
              Fix something
            </button>
          </>
        )}
        <Link href="/docs/business-overview" className="ml-auto text-[12px] text-subtle underline-offset-2 hover:underline">
          Full profile in Docs
        </Link>
      </div>
    </div>
  );
}
