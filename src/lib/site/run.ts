import { logEvent } from "@/lib/db/events";
import { getDocs, getWorkspace, patchProfileSections, updateWorkspace, type SectionPatch } from "@/lib/db/workspaces";
import { syncMap } from "@/lib/map/sync";
import { nameFromUrl } from "@/lib/onboarding/entry";
import { cacheSite, getCachedSite, readBrand, readPages } from "./read";
import { summarizeSite } from "./summarize";
import type { SiteBrand, SiteCrawl, SiteSummary } from "./types";

const inferred = { status: "inferred", source: "website" } as const;
const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

const summaryPatches = (summary: SiteSummary): SectionPatch[] => [
  { slug: "business-overview", key: "what-we-do", body: summary.whatYouDo, ...inferred },
  { slug: "business-overview", key: "who-we-serve", body: summary.whoYouServe, ...inferred },
  { slug: "business-overview", key: "offering", body: summary.offering, ...inferred },
  { slug: "business-overview", key: "differentiators", body: summary.differentiators, ...inferred },
  { slug: "brand-guidelines", key: "voice", body: `${summary.voice}\n\n${summary.toneWords.join(" · ")}`, ...inferred },
  { slug: "brand-guidelines", key: "pillars", body: list(summary.pillars), ...inferred },
];

const brandPatches = (brand: SiteBrand): SectionPatch[] =>
  [
    { key: "colors", body: brand.colors.length ? list(brand.colors.map((c) => `\`${c}\``)) : null },
    { key: "typography", body: brand.fonts.length ? list(brand.fonts) : null },
    { key: "logo", body: brand.logo ? `![Logo](${brand.logo})` : null },
  ]
    .filter((p): p is { key: string; body: string } => p.body !== null)
    .map((p) => ({ slug: "brand-guidelines", ...p, ...inferred }));

/**
 * Reads the user's website and drafts their profile from it: progress goes to
 * workspaces.crawl (the chat's site card follows it over Realtime), the draft
 * goes into the profile Docs as "inferred" until the user confirms it. Pages
 * and summary come first (~10s); branding is slower and lands when it's ready.
 * Safe to call more than once per URL.
 */
export async function readAndProfileSite({
  workspaceId,
  url,
  afterMessageId,
}: {
  workspaceId: string;
  url: string;
  afterMessageId: string | null;
}) {
  const workspace = await getWorkspace(workspaceId);
  if (workspace.crawl?.url === url && workspace.crawl.status !== "failed") return;

  const started = Date.now();
  let crawl: SiteCrawl = {
    status: "reading",
    url,
    afterMessageId,
    pages: [],
    summary: null,
    opportunities: [],
    brand: null,
    confirmedAt: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  // Writes go out in order, so a slow early write can't overwrite a later one.
  let writes = Promise.resolve();
  const save = (next: Partial<SiteCrawl>) => {
    crawl = { ...crawl, ...next };
    const snapshot = crawl;
    writes = writes.then(() => updateWorkspace(workspaceId, { crawl: snapshot }));
    return writes;
  };
  await save({});

  const cached = await getCachedSite(url);
  const branding = (cached ? Promise.resolve(cached.brand) : readBrand(url).catch(() => null)).then(async (brand) => {
    if (!brand) return null;
    const current = await getWorkspace(workspaceId);
    const renamable = current.name === "New workspace" || current.name === nameFromUrl(url);
    await Promise.all([
      save({ brand }),
      patchProfileSections(workspaceId, brandPatches(brand)),
      updateWorkspace(workspaceId, {
        logo_url: brand.logo,
        favicon_url: brand.favicon,
        brand_color: brand.colors[0] ?? null,
        ...(renamable && brand.name ? { name: brand.name } : {}),
      }),
    ]);
    return brand;
  });

  try {
    const pages = cached
      ? (void save({ pages: cached.pages.map((p) => ({ url: p.url, path: p.path, status: "done" as const })) }), cached.pages)
      : await readPages(url, (progress) => void save({ pages: progress }));
    await save({ status: "summarizing" });
    const { summary, opportunities } = cached?.summary ?? (await summarizeSite(url, pages));
    await patchProfileSections(workspaceId, summaryPatches(summary));
    await save({ status: "done", summary, opportunities, finishedAt: new Date().toISOString() });
    await logEvent(workspaceId, "site_read", { pages: pages.length, ms: Date.now() - started });
    await syncMap(workspaceId); // path B's levels follow what the site suggests
    if (!cached?.summary) await cacheSite(url, { pages, brand: await branding, summary: { summary, opportunities } });
  } catch (error) {
    console.error(`Failed to read ${url}`, error);
    const current = await getWorkspace(workspaceId);
    await Promise.all([
      save({ status: "failed", error: String(error).slice(0, 300), finishedAt: new Date().toISOString() }),
      updateWorkspace(workspaceId, { entry: { ...current.entry, website: { status: "unreadable", url } } }),
      patchProfileSections(workspaceId, [
        { slug: "business-overview", key: "website", body: `${url} (couldn't be read)`, status: "confirmed", source: "user" },
      ]),
      logEvent(workspaceId, "site_unreadable", { url }),
    ]);
  }
  await branding;
}

/** "Looks right": the website-drafted profile becomes confirmed. */
export async function confirmSiteProfile(workspaceId: string) {
  const [workspace, docs] = await Promise.all([getWorkspace(workspaceId), getDocs(workspaceId)]);
  if (!workspace.crawl || workspace.crawl.status !== "done") return;
  const patches: SectionPatch[] = docs.flatMap((doc) =>
    Object.entries(doc.sections)
      .filter(([, meta]) => meta.status === "inferred")
      .map(([key]) => ({ slug: doc.slug as SectionPatch["slug"], key, body: null, status: "confirmed" as const, source: "website" as const })),
  );
  await Promise.all([
    patchProfileSections(workspaceId, patches),
    updateWorkspace(workspaceId, { crawl: { ...workspace.crawl, confirmedAt: new Date().toISOString() } }),
    logEvent(workspaceId, "profile_confirmed"),
  ]);
}
