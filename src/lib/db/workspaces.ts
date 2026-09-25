import type { UIMessage } from "ai";
import { patchSection } from "@/lib/docs/markdown";
import { emptyProfileDocs, getProfileSection, type ProfileDocSlug, type SectionMeta } from "@/lib/docs/profile";
import { greetingMessage } from "@/lib/onboarding/greeting";
import { db } from "@/lib/supabase/admin";
import { logEvent } from "./events";
import type { Doc, OnboardingStatus, Ploy, Workspace, WorkspaceSnapshot } from "./types";

/** Unwraps a query that returns rows. */
function must<T>({ data, error }: { data: T | null; error: unknown }, what: string): T {
  if (error || data === null) throw new Error(`Failed to ${what}: ${JSON.stringify(error)}`);
  return data;
}

/** Checks a write that doesn't return rows. */
function check({ error }: { error: unknown }, what: string) {
  if (error) throw new Error(`Failed to ${what}: ${JSON.stringify(error)}`);
}

/** Creates a workspace seeded with the Getting Started ploy and empty profile docs. */
export async function createWorkspace({ isEval = false }: { isEval?: boolean } = {}) {
  const workspace = must(
    await db().from("workspaces").insert({ is_eval: isEval }).select().single<Workspace>(),
    "create workspace",
  );
  const workspace_id = workspace.id;
  await Promise.all([
    db()
      .from("ploys")
      .insert({ workspace_id, kind: "onboarding", title: "Getting Started", messages: [greetingMessage()] })
      .then((r) => check(r, "seed onboarding ploy")),
    db()
      .from("docs")
      .insert(emptyProfileDocs().map((d) => ({ ...d, workspace_id })))
      .then((r) => check(r, "seed profile docs")),
  ]);
  if (!isEval) await logEvent(workspace_id, "workspace_created");
  return workspace;
}

/** The most recently opened workspace, creating the first one if needed. */
export async function getActiveWorkspaceId() {
  const { data } = await db()
    .from("workspaces")
    .select("id")
    .eq("is_eval", false)
    .order("last_opened_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? (await createWorkspace()).id;
}

export async function openWorkspace(id: string) {
  check(
    await db().from("workspaces").update({ last_opened_at: new Date().toISOString() }).eq("id", id),
    "open workspace",
  );
}

export async function loadSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
  const [workspace, workspaces, ploys, docs, mapNodes, integrations] = await Promise.all([
    db().from("workspaces").select().eq("id", workspaceId).single(),
    db()
      .from("workspaces")
      .select("id, name, created_at, onboarding_status")
      .eq("is_eval", false)
      .order("created_at", { ascending: false }),
    db().from("ploys").select().eq("workspace_id", workspaceId).order("created_at"),
    db().from("docs").select().eq("workspace_id", workspaceId).order("created_at"),
    db().from("map_nodes").select().eq("workspace_id", workspaceId),
    db().from("integrations").select().eq("workspace_id", workspaceId),
  ]);
  return {
    workspace: must(workspace, "load workspace"),
    workspaces: must(workspaces, "list workspaces"),
    ploys: must(ploys, "load ploys"),
    docs: must(docs, "load docs"),
    mapNodes: must(mapNodes, "load map nodes"),
    integrations: must(integrations, "load integrations"),
  };
}

export async function getWorkspace(id: string) {
  return must(await db().from("workspaces").select().eq("id", id).single<Workspace>(), "get workspace");
}

export async function updateWorkspace(id: string, fields: Partial<Omit<Workspace, "id">>) {
  check(await db().from("workspaces").update(fields).eq("id", id), "update workspace");
}

export async function setOnboardingStatus(id: string, status: OnboardingStatus) {
  await updateWorkspace(id, { onboarding_status: status });
  await logEvent(id, "onboarding_status_changed", { status });
}

export async function getDocs(workspaceId: string) {
  return must(
    await db().from("docs").select().eq("workspace_id", workspaceId).order("created_at").returns<Doc[]>(),
    "get docs",
  );
}

export async function getOnboardingPloy(workspaceId: string) {
  return must(
    await db().from("ploys").select().eq("workspace_id", workspaceId).eq("kind", "onboarding").single<Ploy>(),
    "get onboarding ploy",
  );
}

export async function saveOnboardingMessages(workspaceId: string, messages: UIMessage[]) {
  check(
    await db()
      .from("ploys")
      .update({ messages, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("kind", "onboarding"),
    "save onboarding messages",
  );
}

export type SectionPatch = {
  slug: ProfileDocSlug;
  key: string;
  body: string;
  status: SectionMeta["status"];
  source: SectionMeta["source"];
};

/** Rewrites individual `## ` sections of profile docs, leaving the rest untouched. */
export async function patchProfileSections(workspaceId: string, patches: SectionPatch[]) {
  if (!patches.length) return;
  const docs = await getDocs(workspaceId);
  const now = new Date().toISOString();
  const bySlug = Map.groupBy(patches, (p) => p.slug);
  await Promise.all(
    [...bySlug].map(async ([slug, docPatches]) => {
      const doc = docs.find((d) => d.slug === slug);
      if (!doc) throw new Error(`Missing profile doc ${slug}`);
      let content = doc.content_md;
      const sections = { ...doc.sections };
      for (const p of docPatches) {
        content = patchSection(content, getProfileSection(slug, p.key).heading, p.body);
        sections[p.key] = { status: p.status, source: p.source, updatedAt: now };
      }
      check(
        await db().from("docs").update({ content_md: content, sections, updated_at: now }).eq("id", doc.id),
        `patch doc ${slug}`,
      );
    }),
  );
}
