"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app error", error.digest ?? error.name);
  }, [error]);

  return (
    <ErrorFallback
      onRetry={reset}
      detail="This screen failed to load. Your work is safe. Try again, or tell us what happened."
    />
  );
}
