import { connection } from "next/server";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { getActiveWorkspaceId, loadSnapshot } from "@/lib/db/workspaces";

// Persistent frame for every tab and chat: routes below swap only the main
// area. Keyed by workspace so "Start fresh" / switching resets all client state.
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await connection();
  const snapshot = await loadSnapshot(await getActiveWorkspaceId());

  return (
    <WorkspaceProvider key={snapshot.workspace.id} initial={snapshot}>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
