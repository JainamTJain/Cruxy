"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  /** Where Change should go. */
  changeHref?: string;
  className?: string;
};

/**
 * Visible effect of the learning profile on Today and in the Cruxy panel.
 */
export function TailoredLine({
  changeHref = "/settings#my-profile",
  className,
}: Props) {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/learning-profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { tailored?: string | null } | null) => {
        if (d?.tailored) setLine(d.tailored);
      })
      .catch(() => undefined);
  }, []);

  if (!line) return null;

  return (
    <p className={className ?? "m-0 text-sm text-muted"}>
      {line}
      {". "}
      <Link href={changeHref} className="font-semibold text-cardinal underline">
        Change
      </Link>
    </p>
  );
}
