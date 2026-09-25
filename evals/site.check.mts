// Site reading check (phase 2): reads a real website into a throwaway workspace
// and checks progress, the drafted profile, branding, and timing.
//
//   npm run check:site                       default site
//   npm run check:site -- https://example.com

import { createWorkspace, getDocs, getWorkspace } from "@/lib/db/workspaces";
import { readAndProfileSite } from "@/lib/site/run";
import { db } from "@/lib/supabase/admin";

const url = process.argv[2] ?? "https://www.bluebottlecoffee.com";
const results: { name: string; pass: boolean; detail?: string }[] = [];
const check = (name: string, pass: boolean, detail?: string) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
};

const workspace = await createWorkspace({ isEval: true });
try {
  const started = Date.now();
  const seen = new Map<string, number>(); // first time each stage showed up, in ms
  const poll = setInterval(async () => {
    const crawl = (await getWorkspace(workspace.id)).crawl;
    if (!crawl) return;
    if (!seen.has(crawl.status)) seen.set(crawl.status, Date.now() - started);
    if (crawl.brand && !seen.has("brand")) seen.set("brand", Date.now() - started);
  }, 250);
  await readAndProfileSite({ workspaceId: workspace.id, url, afterMessageId: null });
  clearInterval(poll);

  const [final, docs] = await Promise.all([getWorkspace(workspace.id), getDocs(workspace.id)]);
  const crawl = final.crawl!;
  const overview = docs.find((d) => d.slug === "business-overview")!;
  const brandDoc = docs.find((d) => d.slug === "brand-guidelines")!;
  const secs = (ms?: number) => (ms === undefined ? "never" : `${(ms / 1000).toFixed(1)}s`);

  console.log(`Read ${url}: ${crawl.pages.map((p) => `${p.path} ${p.status}`).join(", ")}`);
  check("Read succeeded", crawl.status === "done", crawl.error ?? undefined);
  check("Showed progress before finishing", seen.has("reading") && seen.has("summarizing"));
  check("Read the homepage plus at least one key page", crawl.pages.filter((p) => p.status === "done").length >= 2);
  check("Drafted a summary and 3 opportunities", !!crawl.summary?.oneLiner && crawl.opportunities.length === 3);
  check(
    "Filled the Business Overview as inferred",
    ["what-we-do", "who-we-serve", "offering", "differentiators"].every((k) => overview.sections[k]?.status === "inferred"),
  );
  check("Found branding (colors or logo)", !!crawl.brand && (crawl.brand.colors.length > 0 || !!crawl.brand.logo));
  check("Filled Brand Guidelines voice and pillars", ["voice", "pillars"].every((k) => brandDoc.sections[k]?.status === "inferred"));
  check("Profile ready within 20s", (seen.get("done") ?? Infinity) <= 20_000, `done at ${secs(seen.get("done"))}, brand at ${secs(seen.get("brand"))}`);
} finally {
  await db().from("workspaces").delete().eq("id", workspace.id);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${failed ? `${failed} check(s) failed.` : "All site checks pass."}`);
process.exit(failed ? 1 : 0);
