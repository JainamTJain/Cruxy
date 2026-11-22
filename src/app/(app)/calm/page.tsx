"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CalmRoutine } from "@/components/calm/calm-routine";

function CalmInner() {
  const params = useSearchParams();
  const next = params.get("next");
  const caseId = params.get("caseId");
  const roundId = params.get("roundId");

  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-xl flex-col justify-center px-4 py-8">
      <CalmRoutine
        nextHref={next}
        caseId={caseId}
        roundId={roundId}
      />
    </main>
  );
}

export default function CalmPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-xl px-4 py-10 text-sm text-muted">
          Loading calm…
        </main>
      }
    >
      <CalmInner />
    </Suspense>
  );
}
