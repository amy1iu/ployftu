"use client";

import Link from "next/link";
import type { Deliverable } from "@/lib/quick-wins/generate";
import type { DeliverableData } from "@/lib/tasks/types";
import { useWorkspace } from "../workspace/workspace-provider";

const card = "rounded-xl border border-border bg-surface p-4";
const label = "text-[11px] uppercase tracking-wide text-subtle";

function HomepageAudit({ o }: { o: Deliverable<"homepage_audit"> }) {
  return (
    <div className="space-y-3">
      <p>{o.summary}</p>
      {o.issues.map((issue, i) => (
        <div key={issue.title} className={`${card} space-y-2`}>
          <p className="font-medium">
            {i + 1}. {issue.title}
          </p>
          <p className="text-[13px] text-muted">
            <span className={label}>What we saw</span>
            <br />
            {issue.whatWeSaw}
          </p>
          <p className="text-[13px] text-muted">{issue.why}</p>
          <div className="rounded-lg bg-accent-soft p-3 text-[13px]">
            <span className={label}>Rewrite</span>
            <p className="mt-1 text-foreground">{issue.rewrite}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OutreachSequence({ o }: { o: Deliverable<"outreach_sequence"> }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">For: {o.audience}</p>
      {o.emails.map((email) => (
        <div key={email.sendDay} className={`${card} space-y-2`}>
          <p className={label}>Day {email.sendDay}</p>
          <p className="font-medium">{email.subject}</p>
          <p className="text-[13px] whitespace-pre-wrap">{email.body}</p>
        </div>
      ))}
    </div>
  );
}

function LookalikeAccounts({ o }: { o: Deliverable<"lookalike_accounts"> }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">{o.criteria}</p>
      <div className={`${card} p-0`}>
        {o.accounts.map((a) => (
          <div key={a.name} className="border-b border-border px-4 py-2.5 text-[13px] last:border-0">
            <p className="font-medium">
              {a.name}
              {a.website && <span className="ml-2 font-normal text-subtle">{a.website}</span>}
            </p>
            <p className="text-muted">{a.why}</p>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-subtle">Suggested accounts to research; verify fit before reaching out.</p>
    </div>
  );
}

function SocialPosts({ o }: { o: Deliverable<"social_posts"> }) {
  return (
    <div className="space-y-3">
      {o.posts.map((post) => (
        <div key={post.hook} className={`${card} space-y-2`}>
          <p className="font-medium">{post.hook}</p>
          <p className="text-[13px] whitespace-pre-wrap">{post.body}</p>
        </div>
      ))}
    </div>
  );
}

/** A small preview of the page, in their brand color. */
function LandingPageDraft({ o }: { o: Deliverable<"landing_page_draft"> }) {
  const { workspace } = useWorkspace();
  const brand = workspace.brand_color ?? "#0d0d0d";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="space-y-3 px-6 py-8 text-center" style={{ background: `color-mix(in srgb, ${brand} 8%, white)` }}>
        <p className="text-[22px] leading-tight font-semibold">{o.hero.headline}</p>
        <p className="text-muted">{o.hero.subheadline}</p>
        <span className="inline-block rounded-full px-4 py-2 text-[13px] text-white" style={{ background: brand }}>
          {o.hero.cta}
        </span>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        {o.sections.map((s) => (
          <div key={s.title} className="space-y-1">
            <p className="font-medium">{s.title}</p>
            <p className="text-[13px] text-muted">{s.body}</p>
          </div>
        ))}
      </div>
      <p className="border-t border-border px-6 py-4 text-center font-medium">{o.closingCta}</p>
    </div>
  );
}

function Body({ recipeId, output }: Pick<DeliverableData, "recipeId" | "output">) {
  switch (recipeId) {
    case "homepage_audit":
      return <HomepageAudit o={output as Deliverable<"homepage_audit">} />;
    case "outreach_sequence":
      return <OutreachSequence o={output as Deliverable<"outreach_sequence">} />;
    case "lookalike_accounts":
      return <LookalikeAccounts o={output as Deliverable<"lookalike_accounts">} />;
    case "social_posts":
      return <SocialPosts o={output as Deliverable<"social_posts">} />;
    case "landing_page_draft":
      return <LandingPageDraft o={output as Deliverable<"landing_page_draft">} />;
  }
}

/** A quick win's deliverable, rendered for its recipe, with a link to its Doc. */
export function DeliverableView({ recipeId, output, docSlug }: DeliverableData) {
  return (
    <div className="space-y-2">
      <Body recipeId={recipeId} output={output} />
      <Link href={`/docs/${docSlug}`} className="inline-block text-[12px] text-subtle underline-offset-2 hover:underline">
        Open in Docs
      </Link>
    </div>
  );
}
