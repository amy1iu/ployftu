"use client";

import { PanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { AppSidebar } from "./sidebar/app-sidebar";
import { TaskPanel, TaskPanelProvider } from "./tasks/task-panel";
import { TaskToasts } from "./task-toasts";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Wide screens: the sidebar is docked unless collapsed. Narrow screens: it
  // slides over the page, and closes when you navigate (it's tied to the page
  // it was opened on).
  const [docked, setDocked] = useState(true);
  const [overlayOn, setOverlayOn] = useState<string | null>(null);
  const overlayOpen = overlayOn === pathname;

  return (
    <TaskPanelProvider>
      <div className="flex h-dvh overflow-hidden">
        {docked && (
          <div className="hidden lg:flex">
            <AppSidebar onToggle={() => setDocked(false)} />
          </div>
        )}
        {overlayOpen && (
          <div className="fixed inset-0 z-50 flex bg-black/20 lg:hidden" onClick={() => setOverlayOn(null)}>
            <div onClick={(e) => e.stopPropagation()} className="shadow-[8px_0_24px_rgba(0,0,0,0.12)]">
              <AppSidebar onToggle={() => setOverlayOn(null)} />
            </div>
          </div>
        )}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? setDocked(true) : setOverlayOn(pathname))}
            className={`absolute top-[26px] left-3 z-10 text-[#3a3a3a] ${docked ? "lg:hidden" : ""}`}
          >
            <PanelLeft size={20} strokeWidth={1.5} />
          </button>
          {children}
        </main>
        {/* The task list: beside Getting Started, Overview, and task ploys, and kept open between them. */}
        <TaskPanel />
        <TaskToasts />
      </div>
    </TaskPanelProvider>
  );
}
