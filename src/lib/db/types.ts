import type { UIMessage } from "ai";
import type { PloybookSpec } from "@/lib/catalog";
import type { SectionMeta } from "@/lib/docs/profile";
import type { Entry } from "@/lib/onboarding/entry";

// Row shapes for the tables in supabase/migrations/20260924000000_workspaces.sql.

export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

export type OnboardingStatus = "active" | "completed" | "skipped";

export type Workspace = {
  id: string;
  user_id: string;
  name: string;
  website_url: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  brand_color: string | null;
  entry: Entry;
  onboarding_status: OnboardingStatus;
  is_eval: boolean;
  created_at: string;
  last_opened_at: string;
};

export type Doc = {
  id: string;
  workspace_id: string;
  slug: string;
  title: string;
  kind: "profile" | "deliverable";
  content_md: string;
  sections: Record<string, SectionMeta>;
  created_at: string;
  updated_at: string;
};

export type Ploy = {
  id: string;
  workspace_id: string;
  kind: "onboarding" | "task";
  title: string;
  spec: PloybookSpec | null;
  status: "idle" | "running" | "done" | "live";
  messages: UIMessage[];
  unread: boolean;
  created_at: string;
  updated_at: string;
};

export type MapNode = {
  id: string;
  workspace_id: string;
  spec_id: string;
  region: string;
  slot: number;
  title: string;
  blurb: string;
  reason: string | null;
  emphasized: boolean;
  ploy_id: string | null;
  revealed_at: string;
};

export type Integration = { workspace_id: string; provider: string; connected_at: string };

export type WorkspaceSummary = Pick<Workspace, "id" | "name" | "created_at" | "onboarding_status">;

/** Everything the client needs for one workspace; kept fresh by Realtime. */
export type WorkspaceSnapshot = {
  workspace: Workspace;
  workspaces: WorkspaceSummary[];
  ploys: Ploy[];
  docs: Doc[];
  mapNodes: MapNode[];
  integrations: Integration[];
};
