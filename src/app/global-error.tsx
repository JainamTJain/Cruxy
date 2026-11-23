"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";

/**
 * Catches errors in the root layout. Must define its own <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("global error", error.digest ?? error.name);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <ErrorFallback
          fullPage
          onRetry={reset}
          title="Crux hit a snag"
          detail="Your work is safe. Try again, or tell us what happened."
        />
      </body>
    </html>
  );
}
