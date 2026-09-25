"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

type MapPanelState = {
  /** Whether this page shows the map at all (not on Docs). */
  available: boolean;
  /** Docked beside the chat (wide screens; open by default). */
  docked: boolean;
  /** Open over the page (narrower screens; closed by default, and on navigation). */
  overlay: boolean;
  /** Whether the map is on screen right now, whichever way it's shown. */
  visible: boolean;
  toggle: () => void;
  closeOverlay: () => void;
};

const MapPanelContext = createContext<MapPanelState | null>(null);

/** Matches the `xl` breakpoint, where the map docks beside the chat. */
const WIDE = "(min-width: 1280px)";

function useIsWide() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

export function MapPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [docked, setDocked] = useState(true);
  // The overlay belongs to the page it was opened on, so navigating (e.g. starting a task) closes it.
  const [overlayOn, setOverlayOn] = useState<string | null>(null);
  const overlay = overlayOn === pathname;
  const wide = useIsWide();
  const available = !pathname.startsWith("/docs");
  return (
    <MapPanelContext
      value={{
        available,
        docked: available && docked,
        overlay: available && overlay,
        visible: available && (wide ? docked : overlay),
        toggle: () => (wide ? setDocked((d) => !d) : setOverlayOn(overlay ? null : pathname)),
        closeOverlay: () => setOverlayOn(null),
      }}
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
  const { docked } = useMapPanel();
  return docked ? "w-full xl:w-[max(34%,420px)]" : "w-full";
}
