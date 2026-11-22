"use client";

export function PrintPacketClient() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
    >
      Print packet
    </button>
  );
}
