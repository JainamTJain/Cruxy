"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Primary action on the packet page: print / save as PDF. */
export function PrintPacketClient() {
  const search = useSearchParams();
  const auto = search.get("print") === "1";

  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [auto]);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
    >
      Download as PDF
    </button>
  );
}
