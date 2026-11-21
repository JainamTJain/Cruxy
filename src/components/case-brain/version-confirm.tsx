"use client";

import { useState } from "react";

type DiffLine = { path: string; before: string; after: string };

type Props = {
  version: number | null;
  changeSummary: string | null;
  confirmedCount: number;
  teamSize: number;
  unconfirmedNames: string[];
  diffLines: DiffLine[];
  canConfirm: boolean;
  canPublish: boolean;
  busy: boolean;
  onConfirm: () => void;
  onPublish: (changeSummary: string) => void;
  onEnsure?: () => void;
};

export function VersionConfirm({
  version,
  changeSummary,
  confirmedCount,
  teamSize,
  unconfirmedNames,
  diffLines,
  canConfirm,
  canPublish,
  busy,
  onConfirm,
  onPublish,
  onEnsure,
}: Props) {
  const [reason, setReason] = useState("");
  const [showPublish, setShowPublish] = useState(false);

  if (version == null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white px-[22px] py-[18px]">
        <p className="text-sm leading-snug">
          No claim-map version yet. Publish v1 so teammates can confirm they have
          it.
        </p>
        {onEnsure ? (
          <button
            type="button"
            disabled={busy}
            onClick={onEnsure}
            className="rounded-xl bg-ink px-[18px] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Publish v1
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white px-[22px] py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-snug">
          <strong>Claim map v{version}.</strong> {confirmedCount} of {teamSize}{" "}
          confirmed
          {unconfirmedNames.length
            ? `. Still on an older version: ${unconfirmedNames.join(", ")}`
            : ""}
          .
        </p>
        <div className="flex flex-wrap gap-2">
          {canConfirm ? (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="rounded-xl bg-ink px-[18px] py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              I&apos;ve got v{version}
            </button>
          ) : (
            <span className="self-center text-sm font-semibold text-muted">
              You confirmed
            </span>
          )}
          {canPublish ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowPublish((v) => !v)}
              className="rounded-xl border border-ink/15 bg-white px-[18px] py-3 text-sm font-semibold disabled:opacity-50"
            >
              {showPublish ? "Cancel" : "Publish a new version"}
            </button>
          ) : null}
        </div>
      </div>

      {changeSummary ? (
        <p className="m-0 text-sm text-[#3B404A]">
          What changed: {changeSummary}
        </p>
      ) : null}

      {diffLines.length > 0 ? (
        <ul className="m-0 space-y-2 p-0">
          {diffLines.slice(0, 6).map((d) => (
            <li
              key={`${d.path}-${d.after.slice(0, 24)}`}
              className="rounded-xl bg-[#F7F8FA] px-3 py-2 text-sm"
            >
              <span className="font-mono text-[11px] text-muted">{d.path}</span>
              <div>
                <span className="text-muted line-through">
                  {d.before || "∅"}
                </span>
                {" → "}
                <span>{d.after || "∅"}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {showPublish && canPublish ? (
        <div className="flex flex-col gap-2 border-t border-ink/10 pt-3">
          <label className="text-sm font-semibold" htmlFor="map-change-reason">
            What changed and why (required)
          </label>
          <input
            id="map-change-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="One line, e.g. Claim 2 now answers Waldron with a partnership"
            className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || reason.trim().length < 3}
            onClick={() => {
              onPublish(reason.trim());
              setReason("");
              setShowPublish(false);
            }}
            className="self-start rounded-xl bg-ink px-[18px] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Publish v{version + 1}
          </button>
        </div>
      ) : null}
    </div>
  );
}
