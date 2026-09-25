"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

type MapPanelState = {
  /** Whether this page shows the map at all (not on Docs). */
  available: boolean;
  /** Open (docked on wide screens, over the page on narrow ones) or collapsed. */
  open: boolean;
  toggle: () => void;
  close: () => void;
};

const MapPanelContext = createContext<MapPanelState | null>(null);

export function MapPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const available = !pathname.startsWith("/docs");
  return (
    <MapPanelContext
      value={{ available, open: available && open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }}
    >
      {children}
    </MapPanelContext>
  );
}

export function useMapPanel() {
  const value = useContext(MapPanelContext);
  if (!value) throw new Error("useMapPanel must be used inside MapPanelProvider");
  return value;
}

/** Width of a chat page's body: the left third when the map is docked beside it (wide screens). */
export function useChatColumnClass() {
  const { open } = useMapPanel();
  return open ? "w-full xl:w-[max(34%,420px)]" : "w-full";
}
