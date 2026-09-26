// Pre-reads (and summarizes) demo websites into the site cache and pins them, so a live demo
// that pastes one of these URLs gets its profile instantly and can't be
// derailed by a slow or blocked crawl.
//
//   npm run seed:demo                          the default demo sites
//   npm run seed:demo -- acme.com example.org  your own

import { normalizeUrl } from "@/lib/onboarding/entry";
import { cacheSite, getCachedSite, readBrand, readPages } from "@/lib/site/read";
import { summarizeSite } from "@/lib/site/summarize";

const defaults = ["intelligentsia.com", "linear.app", "glossier.com"];
const inputs = process.argv.slice(2).length ? process.argv.slice(2) : defaults;

let failed = 0;
for (const input of inputs) {
  const url = normalizeUrl(input);
  if (!url) {
    console.log(`  ✗ ${input}: not a URL`);
    failed++;
    continue;
  }
  const started = Date.now();
  try {
    // Reuse what's already cached (Firecrawl's free plan allows ~12 requests a minute).
    const cached = await getCachedSite(url);
    const [pages, brand] = cached
      ? [cached.pages, cached.brand]
      : await Promise.all([readPages(url, () => {}), readBrand(url).catch(() => null)]);
    // Re-summarize summaries cached before they had a short label.
    const summary = cached?.summary?.summary.label ? cached.summary : await summarizeSite(url, pages);
    await cacheSite(url, { pages, brand, summary, pinned: true });
    console.log(`  ✓ ${url}: ${pages.length} pages${brand ? ", branding" : ""} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (error) {
    console.log(`  ✗ ${url}: ${String(error).slice(0, 120)}`);
    failed++;
  }
}
console.log(`\n${failed ? `${failed} site(s) failed.` : "Demo sites pinned. Paste any of them into Getting Started."}`);
process.exit(failed ? 1 : 0);
