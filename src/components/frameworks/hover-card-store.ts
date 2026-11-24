"use client";

/**
 * Tiny page-wide hover card registry: only one card open at a time.
 * Used by framework LinkedText marks and the reading-tools explain card.
 */

type Listener = () => void;

let activeId: string | null = null;
const listeners = new Set<Listener>();

export function getActiveHoverCardId(): string | null {
  return activeId;
}

export function subscribeHoverCard(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const l of listeners) l();
}

/** Open this card and close any other. */
export function openHoverCard(id: string) {
  if (activeId === id) return;
  activeId = id;
  emit();
}

/** Close this card, or any card when id is omitted. */
export function closeHoverCard(id?: string) {
  if (id && activeId !== id) return;
  if (activeId === null) return;
  activeId = null;
  emit();
}

/**
 * Place a fixed card near an anchor so it stays inside the viewport.
 * Returns left/top in viewport coordinates (for position: fixed).
 */
export function placeHoverCard(
  anchor: DOMRect,
  cardW: number,
  cardH: number,
  pad = 8,
): { left: number; top: number; below: boolean } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let left = anchor.left;
  if (left + cardW > vw - pad) left = vw - cardW - pad;
  if (left < pad) left = pad;

  const spaceBelow = vh - anchor.bottom - pad;
  const spaceAbove = anchor.top - pad;
  const below = spaceBelow >= cardH || spaceBelow >= spaceAbove;
  let top = below ? anchor.bottom + 4 : anchor.top - cardH - 4;
  if (top < pad) top = pad;
  if (top + cardH > vh - pad) top = Math.max(pad, vh - cardH - pad);

  return { left, top, below };
}
