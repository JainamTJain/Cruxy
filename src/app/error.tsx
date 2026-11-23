"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the digest for ops; never put the message in the UI.
    console.error("route error", error.digest ?? error.name);
  }, [error]);

  return (
    <ErrorFallback
      fullPage
      onRetry={reset}
      detail="Your work is safe. Try again, or tell us what happened."
    />
  );
}
