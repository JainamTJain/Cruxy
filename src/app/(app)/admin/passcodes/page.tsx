"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Passcodes panel is on the main admin console (Admin.html parity). */
export default function PasscodesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin#pc");
  }, [router]);
  return <p className="text-sm text-muted">Opening passcodes…</p>;
}
