import { Suspense } from "react";
import { SessionClient } from "./session-client";

export default function SessionDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading session…</p>}>
      <SessionClient />
    </Suspense>
  );
}
