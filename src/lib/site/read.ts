import Firecrawl, { type Document } from "@mendable/firecrawl-js";
import { db } from "@/lib/supabase/admin";
import { pathOf, pickPages } from "./pages";
import type { CrawlPage, ReadPage, SiteBrand } from "./types";

// Timing (Firecrawl, typical): a page's markdown ~1s, branding ~17s, map ~6s.
// So key pages come from the homepage's own links, and branding is read in
// parallel and applied whenever it arrives.

let client: Firecrawl | undefined;
const firecrawl = () => (client ??= new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! }));

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAGE_CHARS = 6_000;
const scrapeOptions = { onlyMainContent: true, timeout: 25_000, maxAge: CACHE_TTL_MS };

const toPage = (url: string, doc: Document): ReadPage => ({
  url,
  path: pathOf(url),
  title: doc.metadata?.title ?? null,
  markdown: (doc.markdown ?? "").slice(0, MAX_PAGE_CHARS),
});

export async function getCachedSite(url: string) {
  const { data } = await db()
    .from("crawl_cache")
    .select()
    .eq("url", url)
    .maybeSingle<{ pages: ReadPage[]; branding: SiteBrand | null; fetched_at: string }>();
  if (!data || Date.now() - new Date(data.fetched_at).getTime() > CACHE_TTL_MS) return null;
  return { pages: data.pages, brand: data.branding };
}

export async function cacheSite(url: string, pages: ReadPage[], brand: SiteBrand | null) {
  await db().from("crawl_cache").upsert({ url, pages, branding: brand, fetched_at: new Date().toISOString() });
}

/**
 * Reads the homepage and up to four key pages it links to, reporting progress
 * page by page. Throws if the homepage can't be read; other pages are best-effort.
 */
export async function readPages(url: string, onProgress: (pages: CrawlPage[]) => void): Promise<ReadPage[]> {
  const progress: CrawlPage[] = [{ url, path: "/", status: "reading" }];
  const report = () => onProgress(progress.map((p) => ({ ...p })));
  const mark = (target: string, status: CrawlPage["status"]) => {
    for (const p of progress) if (p.url === target) p.status = status;
    report();
  };
  report();

  const home = await firecrawl()
    .scrape(url, { ...scrapeOptions, formats: ["markdown", "links"] })
    .catch((error) => {
      mark(url, "failed");
      throw error;
    });
  mark(url, "done");

  const links = pickPages(url, home.links ?? []);
  progress.push(...links.map((u) => ({ url: u, path: pathOf(u), status: "reading" as const })));
  report();
  const others = await Promise.all(
    links.map((link) =>
      firecrawl()
        .scrape(link, { ...scrapeOptions, formats: ["markdown"] })
        .then(
          (doc) => (mark(link, "done"), toPage(link, doc)),
          () => (mark(link, "failed"), null),
        ),
    ),
  );
  return [toPage(url, home), ...others.filter((p): p is ReadPage => !!p && !!p.markdown)];
}

/** Logo, favicon, colors, and fonts from the homepage. Null if Firecrawl can't tell. */
export async function readBrand(url: string): Promise<SiteBrand | null> {
  const doc = await firecrawl().scrape(url, { formats: ["branding"], timeout: 45_000, maxAge: CACHE_TTL_MS });
  const b = doc.branding;
  if (!b) return null;
  const colors = [b.colors?.primary, b.colors?.secondary, b.colors?.accent].filter((c): c is string => !!c);
  const fonts = [b.typography?.fontFamilies?.heading, b.typography?.fontFamilies?.primary, ...(b.fonts ?? []).map((f) => f.family)]
    .filter((f): f is string => !!f)
    .map((f) => f.split(",")[0].replace(/["']/g, "").trim());
  return {
    name: b.brandName ?? doc.metadata?.ogSiteName ?? null,
    logo: b.images?.logo ?? b.logo ?? null,
    favicon: b.images?.favicon ?? doc.metadata?.favicon ?? null,
    colors: [...new Set(colors)],
    fonts: [...new Set(fonts)].slice(0, 3),
  };
}
