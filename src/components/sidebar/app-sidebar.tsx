import { Bell, ChevronDown, Gift, CircleHelp, Search } from "lucide-react";
import { activePloyId, currentUser, ploys, recentSites, workspace } from "@/lib/mock-data";
import { libraryNav, primaryNav } from "./nav-config";
import { SidebarNavItem, SidebarRow, SidebarSection } from "./sidebar-primitives";

function PanelToggleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 3.5h4.25v13H3.5z" fill="currentColor" />
    </svg>
  );
}

export function AppSidebar({ onToggle }: { onToggle: () => void }) {
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

      <button
        type="button"
        className="flex h-[38px] w-full items-center gap-2.5 rounded-lg border border-[#f0f0f0] bg-surface pr-3 pl-[5px] text-left"
      >
        <span className="flex size-6 items-center justify-center rounded-[5px] bg-[#0f0f0f] text-[13px] font-medium text-white">
          {workspace.initial}
        </span>
        <span className="flex-1 truncate text-[14px]">{workspace.name}</span>
        <ChevronDown size={18} strokeWidth={2} className="text-[#3a3a3a]" />
      </button>

      <nav className="flex flex-1 flex-col overflow-y-auto">
        <div className="mt-2 flex flex-col gap-1.5">
          {primaryNav.map((item) => (
            <SidebarNavItem key={item.id} item={item} tall />
          ))}
        </div>

        <SidebarSection label="Library" className="mt-[23px]">
          <div className="flex flex-col gap-1.5 pt-[3px]">
            {libraryNav.map((item) => (
              <SidebarNavItem key={item.id} item={item} />
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
          {ploys.map((ploy) => (
            <SidebarRow
              key={ploy.id}
              active={ploy.id === activePloyId}
              trailing={<span className="mr-2 size-[7px] rounded-full border border-subtle" />}
            >
              {ploy.title}
            </SidebarRow>
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
