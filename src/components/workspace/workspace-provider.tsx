"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { createContext, useContext, useEffect, useReducer, useState, type ReactNode } from "react";
import type { OnboardingUIMessage } from "@/lib/ai/onboarding/messages";
import type { WorkspaceSnapshot } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/client";

type ListTable = "ploys" | "docs" | "map_nodes" | "integrations";
const listKey: Record<ListTable, keyof WorkspaceSnapshot> = {
  ploys: "ploys",
  docs: "docs",
  map_nodes: "mapNodes",
  integrations: "integrations",
};
type Row = Record<string, unknown>;
const rowId = (table: ListTable, row: Row) => (table === "integrations" ? row.provider : row.id);

type Action =
  | { type: "workspace"; row: Row }
  | { type: "change"; table: ListTable; event: "INSERT" | "UPDATE" | "DELETE"; row: Row; old: Row };

function reducer(state: WorkspaceSnapshot, action: Action): WorkspaceSnapshot {
  switch (action.type) {
    case "workspace": {
      const workspace = { ...state.workspace, ...action.row };
      return {
        ...state,
        workspace,
        workspaces: state.workspaces.map((w) =>
          w.id === workspace.id ? { ...w, name: workspace.name, onboarding_status: workspace.onboarding_status } : w,
        ),
      };
    }
    case "change": {
      const key = listKey[action.table];
      const list = state[key] as Row[];
      const id = rowId(action.table, action.event === "DELETE" ? action.old : action.row);
      const rest = list.filter((r) => rowId(action.table, r) !== id);
      if (action.event === "DELETE") return { ...state, [key]: rest };
      const exists = rest.length !== list.length;
      return {
        ...state,
        [key]: exists ? list.map((r) => (rowId(action.table, r) === id ? action.row : r)) : [...list, action.row],
      };
    }
  }
}

const WorkspaceContext = createContext<WorkspaceSnapshot | null>(null);
const OnboardingChatContext = createContext<Chat<OnboardingUIMessage> | null>(null);

/**
 * Holds one workspace's data for the whole app frame. It's seeded once per
 * workspace (the layout keys it by id) and Realtime keeps it fresh from there;
 * re-seeding from a later server render could roll it back to a stale snapshot. Also owns the Getting Started
 * chat, so a reply keeps streaming while the user is on another route.
 */
export function WorkspaceProvider({ initial, children }: { initial: WorkspaceSnapshot; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const workspaceId = initial.workspace.id;

  const [chat] = useState(() => {
    const ploy = initial.ploys.find((p) => p.kind === "onboarding")!;
    return new Chat<OnboardingUIMessage>({
      id: ploy.id,
      messages: ploy.messages as OnboardingUIMessage[],
      transport: new DefaultChatTransport({ api: "/api/chat", body: { workspaceId } }),
    });
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`workspace:${workspaceId}`);
    for (const table of Object.keys(listKey) as ListTable[]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
        (payload) =>
          dispatch({ type: "change", table, event: payload.eventType, row: payload.new as Row, old: payload.old as Row }),
      );
    }
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "workspaces", filter: `id=eq.${workspaceId}` },
      (payload) => dispatch({ type: "workspace", row: payload.new as Row }),
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  return (
    <WorkspaceContext value={state}>
      <OnboardingChatContext value={chat}>{children}</OnboardingChatContext>
    </WorkspaceContext>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export function useOnboardingChat() {
  const value = useContext(OnboardingChatContext);
  if (!value) throw new Error("useOnboardingChat must be used inside WorkspaceProvider");
  return value;
}
