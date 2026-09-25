import type { IntentId } from "@/lib/catalog/intents";

export type CrawlPage = { url: string; path: string; status: "reading" | "done" | "failed" };

/** What we learned from the site, drafted for the user to confirm. */
export type SiteSummary = {
  oneLiner: string;
  whatYouDo: string;
  whoYouServe: string;
  offering: string;
  differentiators: string;
  voice: string;
  toneWords: string[];
  pillars: string[];
};

/** Growth opportunities spotted on the site (used on path B, "not sure yet"). */
export type SiteOpportunity = { intent: IntentId; title: string; why: string };

export type SiteBrand = {
  name: string | null;
  logo: string | null;
  favicon: string | null;
  colors: string[];
  fonts: string[];
};

/** workspaces.crawl: progress and results of reading the user's website. */
export type SiteCrawl = {
  status: "reading" | "summarizing" | "done" | "failed";
  url: string;
  /** The user message that gave the URL; the chat shows the site card after it. */
  afterMessageId: string | null;
  pages: CrawlPage[];
  summary: SiteSummary | null;
  opportunities: SiteOpportunity[];
  brand: SiteBrand | null;
  confirmedAt: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

/** One page's content, as read by Firecrawl (or from the cache). */
export type ReadPage = { url: string; path: string; title: string | null; markdown: string };
