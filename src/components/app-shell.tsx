"use client";

import { type ReactNode, useState } from "react";
import { MapPanel } from "./map/map-panel";
import { MapPanelProvider, useMapPanel } from "./map/map-panel-state";
import { AppSidebar } from "./sidebar/app-sidebar";
import { TaskToasts } from "./task-toasts";

/**
 * The growth map beside the chat: on wide screens a card taking the right
 * two-thirds under the page header (the chat narrows to the left third); on
 * narrow screens it opens over the page. Toggled from the page header.
 */
function MapArea() {
  const { open, close } = useMapPanel();
  if (!open) return null;
  return (
    <>
      <div className="absolute top-[72px] right-5 bottom-5 left-[calc(max(34%,420px)+8px)] hidden xl:block">
        <MapPanel />
      </div>
      <div className="fixed inset-0 z-40 flex justify-end bg-black/20 p-3 xl:hidden" onClick={close}>
        <div className="h-full w-[min(640px,100%)]" onClick={(e) => e.stopPropagation()}>
          <MapPanel onClose={close} />
        </div>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <MapPanelProvider>
      <div className="flex h-dvh overflow-hidden">
        {sidebarOpen && <AppSidebar onToggle={() => setSidebarOpen(false)} />}
        <main className="relative flex min-w-0 flex-1 flex-col">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="absolute top-4 left-4 z-10 text-sm text-muted"
            >
              Open sidebar
            </button>
          )}
          {children}
          <MapArea />
        </main>
        <TaskToasts />
      </div>
    </MapPanelProvider>
  );
}
