"use client";

import { useState, type ReactNode } from "react";
import { AppSidebar } from "./sidebar/app-sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
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
      </main>
    </div>
  );
}
