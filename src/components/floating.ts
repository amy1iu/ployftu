import { useState } from "react";

export type Anchor = { top: number; bottom: number; left: number; right: number; centerX: number };

/**
 * Where an element is on screen, captured on demand (e.g. on hover or click),
 * so a tooltip or menu can float over everything with fixed positioning
 * instead of being clipped by scrolling containers like the sidebar.
 */
export function useAnchor() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const capture = (element: Element) => {
    const r = element.getBoundingClientRect();
    setAnchor({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, centerX: r.left + r.width / 2 });
  };
  return { anchor, capture, clear: () => setAnchor(null) };
}
