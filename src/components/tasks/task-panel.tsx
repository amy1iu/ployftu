"use client";

import { useChat } from "@ai-sdk/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { IntegrationCategory } from "@/lib/catalog/integrations";
import { ConnectModal } from "../map/connect-modal";
import { useTrailLayout } from "../trail/layout";
import { TaskList } from "../trail/task-list";
import { useMediaQuery } from "../use-media-query";
import { useOnboardingChat } from "../workspace/workspace-provider";

// The task list beside the page: open on Getting Started and on task ploys,
// collapsible, with one task selected across it and the map.

/** Wide enough for the list beside the page. */
const WIDE = "(min-width: 1280px)";
export const ACTIVE_QUESTION_ID = "trail-active-question";

type TaskPanelState = {
  /** This page shows the list (Getting Started or a task ploy, on a wide screen). */
  available: boolean;
  open: boolean;
  toggle: () => void;
  selected: string | null;
  /** Where the selection came from: picking in the list scrolls the map to it. */
  selectedFrom: "map" | "list";
  select: (id: string | null, from: "map" | "list") => void;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  /** Scroll to the question on screen (from another page, go there first). */
  jumpToQuestion: () => void;
  /** A jump requested from another page, for the trail to finish once it's shown. */
  jumpPending: boolean;
  finishJump: () => void;
};

const TaskPanelContext = createContext<TaskPanelState | null>(null);

const scrollToQuestion = () =>
  document.getElementById(ACTIVE_QUESTION_ID)?.scrollIntoView({ behavior: "smooth", block: "center" });

export function TaskPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const wide = useMediaQuery(WIDE);
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedFrom, setSelectedFrom] = useState<"map" | "list">("map");
  const [hovered, setHovered] = useState<string | null>(null);
  const [jumpPending, setJumpPending] = useState(false);
  const onGettingStarted = pathname === "/";

  return (
    <TaskPanelContext
      value={{
        available: wide && (onGettingStarted || pathname === "/overview" || pathname.startsWith("/ploys/")),
        open,
        toggle: () => setOpen((o) => !o),
        selected,
        selectedFrom,
        select: (id, from) => {
          setSelected(id);
          setSelectedFrom(from);
        },
        hovered,
        setHovered,
        jumpToQuestion: () => {
          if (onGettingStarted) return scrollToQuestion();
          setJumpPending(true);
          router.push("/");
        },
        jumpPending,
        finishJump: () => {
          setJumpPending(false);
          scrollToQuestion();
        },
      }}
    >
      {children}
    </TaskPanelContext>
  );
}

export function useTaskPanel() {
  const value = useContext(TaskPanelContext);
  if (!value) throw new Error("useTaskPanel must be used inside TaskPanelProvider");
  return value;
}

/** The list itself, fed by the Getting Started trail wherever it's shown. */
export function TaskPanel() {
  const panel = useTaskPanel();
  const chat = useOnboardingChat();
  const { messages, status } = useChat({ chat });
  const { listed } = useTrailLayout(messages, status === "submitted" || status === "streaming");
  const [connecting, setConnecting] = useState<{ category: IntegrationCategory; tool: string } | null>(null);
  if (!panel.available || !panel.open) return null;

  return (
    <>
      <TaskList
        tasks={listed}
        selectedId={panel.selected}
        hoveredId={panel.hovered}
        onSelect={(id) => panel.select(id, "list")}
        onHover={panel.setHovered}
        onConnect={(category, tool) => setConnecting({ category, tool })}
        onJump={panel.jumpToQuestion}
        onCollapse={panel.toggle}
      />
      {connecting && <ConnectModal {...connecting} onClose={() => setConnecting(null)} />}
    </>
  );
}
