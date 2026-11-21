"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Model settings live on the main admin console (ONLY JAINAM panel). */
export default function ModelsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin#models");
  }, [router]);
  return <p className="text-sm text-muted">Opening model settings…</p>;
}
