"use client";

import { Bell, Gift, CircleHelp, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { currentUser, recentSites } from "@/lib/mock-data";
import { tutorialProgress } from "@/lib/onboarding/tutorial";
import { Tooltip } from "../tooltip";
import { useWorkspace } from "../workspace/workspace-provider";
import { libraryNav, primaryNav } from "./nav-config";
import { PloyRow, PloyStatus } from "./ploy-row";
import { SidebarNavItem, SidebarRow, SidebarSection } from "./sidebar-primitives";
import { WorkspaceSwitcher } from "./workspace-switcher";

function PanelToggleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 3.5h4.25v13H3.5z" fill="currentColor" />
    </svg>
  );
}

export function AppSidebar({ onToggle }: { onToggle: () => void }) {
  const pathname = usePathname();
  const state = useWorkspace();
  const { workspace, ploys } = state;
  const onboarding = ploys.find((p) => p.kind === "onboarding");
  const tasks = ploys.filter((p) => p.kind === "task").toReversed();
  const tutorialActive = workspace.onboarding_status === "active";
  const progress = tutorialProgress(state);

  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col border-r border-sidebar-edge bg-sidebar pr-[9px] pl-[7px]">
      <div className="flex h-[51px] items-center justify-between pr-2.5 pl-2">
        <button type="button" onClick={onToggle} aria-label="Toggle sidebar" className="text-[#3a3a3a]">
          <PanelToggleIcon />
        </button>
        <button type="button" aria-label="Search" className="text-[#3a3a3a]">
          <Search size={20} strokeWidth={1.5} />
        </button>
      </div>

      <WorkspaceSwitcher />

      <nav className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <div className="mt-2 flex flex-col gap-1.5">
          {primaryNav.map((item) => (
            <SidebarNavItem key={item.id} item={item} tall />
          ))}
        </div>

        <SidebarSection label="Library" className="mt-[23px]">
          <div className="flex flex-col gap-1.5 pt-[3px]">
            {libraryNav.map((item) => (
              <SidebarNavItem
                key={item.id}
                item={item}
                active={!!item.href && pathname.startsWith(item.href)}
              />
            ))}
          </div>
        </SidebarSection>

        <SidebarSection label="Recent Sites" className="mt-[23px]">
          {recentSites.map((site) => (
            <SidebarRow
              key={site.id}
              trailing={<span className="text-[11px] text-muted">{site.updatedAgo}</span>}
            >
              {site.name}
            </SidebarRow>
          ))}
        </SidebarSection>

        <SidebarSection label="Your Ploys">
          {/* Getting Started is always pinned first, and styled as special while the tutorial is active. */}
          {onboarding && (
            <PloyRow
              href="/"
              active={pathname === "/"}
              className={tutorialActive ? "font-accent text-[17px] text-accent" : ""}
              status={
                tutorialActive ? (
                  <Tooltip label="Tutorial progress">
                    <span className="rounded-full bg-accent-soft px-1.5 text-[11px] text-accent tabular-nums">
                      {progress.done}/{progress.total}
                    </span>
                  </Tooltip>
                ) : (
                  <PloyStatus ploy={onboarding} />
                )
              }
            >
              {onboarding.title}
            </PloyRow>
          )}
          {tasks.map((ploy) => (
            <PloyRow
              key={ploy.id}
              href={`/ploys/${ploy.id}`}
              active={pathname === `/ploys/${ploy.id}`}
              className={ploy.unread ? "font-medium" : ""}
              status={<PloyStatus ploy={ploy} />}
            >
              {ploy.title}
            </PloyRow>
          ))}
        </SidebarSection>
      </nav>

      <footer className="flex h-12 items-center">
        <span className="ml-1 flex size-8 items-center justify-center rounded-full bg-avatar text-[15px] text-white">
          {currentUser.initial}
        </span>
        <div className="mr-[11.5px] mb-[3px] ml-auto flex items-center gap-[27px] text-muted">
          <Gift size={20} strokeWidth={1.5} />
          <Bell size={20} strokeWidth={1.5} />
          <CircleHelp size={20} strokeWidth={1.5} />
        </div>
      </footer>
    </aside>
  );
}
