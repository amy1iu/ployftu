import { getIntent, type IntentId } from "@/lib/catalog";
import { logEvent } from "@/lib/db/events";
import { getWorkspace, patchProfileSections, updateWorkspace, type SectionPatch } from "@/lib/db/workspaces";
import { entryBranch, nameFromUrl, normalizeUrl, type Entry } from "./entry";

export type EntryUpdate = {
  website: { status: "has" | "none" | "not_live"; url: string | null } | null;
  goals: {
    status: "has" | "unsure";
    intents: { id: IntentId; weight: number }[];
    inUserWords: string | null;
    unmatched: string | null;
  } | null;
  business: { whatTheyDo: string | null; whoTheyServe: string | null } | null;
};

const websiteNotes = {
  none: "No website yet.",
  not_live: "A website is in progress but not live yet.",
};

/**
 * Applies what the user said about the entry questions: updates workspace.entry,
 * writes the answers into the profile docs, and logs funnel events.
 */
export async function applyEntryUpdate(workspaceId: string, update: EntryUpdate, ctx: { userTurns: number }) {
  const workspace = await getWorkspace(workspaceId);
  const before = workspace.entry;
  const entry: Entry = structuredClone(before);
  const patches: SectionPatch[] = [];
  const fields: Parameters<typeof updateWorkspace>[1] = {};
  const problems: string[] = [];

  if (update.website) {
    const { status } = update.website;
    if (status === "has") {
      const url = update.website.url && normalizeUrl(update.website.url);
      // A URL we already tried and couldn't read stays unreadable when it comes up again.
      const knownUnreadable = before.website.status === "unreadable" && before.website.url === url;
      if (url && !knownUnreadable) {
        entry.website = { status, url };
        fields.website_url = url;
        if (workspace.name === "New workspace") fields.name = nameFromUrl(url);
        patches.push({ slug: "business-overview", key: "website", body: url, status: "confirmed", source: "user" });
      } else if (!url) {
        problems.push(
          `"${update.website.url ?? ""}" doesn't look like a valid URL. Ask the user to double-check the link; don't record it.`,
        );
      }
    } else {
      entry.website = { status, url: null };
      fields.website_url = null;
      patches.push({ slug: "business-overview", key: "website", body: websiteNotes[status], status: "confirmed", source: "user" });
    }
  }

  if (update.goals) {
    const { status, inUserWords, unmatched } = update.goals;
    // Keep the top two as the focus; anything else lives in the user's own words.
    const intents = status === "has" ? [...update.goals.intents].sort((a, b) => b.weight - a.weight).slice(0, 2) : [];
    // An unsupported ask stays on record even after they name a goal Ploy does cover.
    entry.goals = {
      status,
      intents,
      inUserWords: inUserWords ?? entry.goals.inUserWords,
      unmatched: unmatched ?? entry.goals.unmatched,
    };
    patches.push(
      {
        slug: "goals-and-focus",
        key: "goals",
        body:
          status === "has"
            ? `> ${entry.goals.inUserWords ?? intents.map((i) => getIntent(i.id).label).join("; ")}`
            : "Not sure yet. Open to suggestions.",
        status: "confirmed",
        source: "user",
      },
      {
        slug: "goals-and-focus",
        key: "focus-areas",
        body: intents.map((i) => `- ${getIntent(i.id).label}`).join("\n"),
        status: intents.length ? "confirmed" : "empty",
        source: intents.length ? "user" : null,
      },
    );
  }

  // What they do fills in only while empty; corrections to existing content
  // (e.g. from their site) are merged in by recordProfileNotes instead. Who
  // they want to reach is theirs to say, so it replaces what the site suggested.
  if (update.business) {
    const { whatTheyDo, whoTheyServe } = update.business;
    const user = { status: "confirmed", source: "user" } as const;
    if (whatTheyDo) patches.push({ slug: "business-overview", key: "what-we-do", body: whatTheyDo, ...user, ifEmpty: true });
    if (whoTheyServe) patches.push({ slug: "business-overview", key: "who-we-serve", body: whoTheyServe, ...user });
  }

  const branch = entryBranch(entry);
  if (branch && !entryBranch(before)) entry.resolvedAtTurn = ctx.userTurns;

  await Promise.all([
    updateWorkspace(workspaceId, { ...fields, entry }),
    patchProfileSections(workspaceId, patches),
  ]);

  const events: Promise<void>[] = [];
  if (update.website && entry.website.status !== before.website.status)
    events.push(logEvent(workspaceId, "website_answered", { status: entry.website.status }));
  if (update.goals && entry.goals.status !== before.goals.status)
    events.push(
      logEvent(workspaceId, "goals_answered", { status: entry.goals.status, intents: entry.goals.intents.map((i) => i.id) }),
    );
  if (update.goals?.unmatched) events.push(logEvent(workspaceId, "unmatched_intent", { text: update.goals.unmatched }));
  if (branch && !entryBranch(before))
    events.push(logEvent(workspaceId, "branch_resolved", { branch, userTurns: ctx.userTurns }));
  await Promise.all(events);

  return { entry, branch, problems };
}
