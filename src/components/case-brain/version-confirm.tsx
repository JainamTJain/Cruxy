"use client";

type Props = {
  version: number | null;
  confirmedCount: number;
  teamSize: number;
  canConfirm: boolean;
  busy: boolean;
  onConfirm: () => void;
  onPublish?: () => void;
};

export function VersionConfirm({
  version,
  confirmedCount,
  teamSize,
  canConfirm,
  busy,
  onConfirm,
  onPublish,
}: Props) {
  if (version == null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white px-[22px] py-[18px]">
        <p className="text-sm leading-snug">
          No claim-map version yet. Publish v1 so teammates can confirm they have
          it.
        </p>
        {onPublish ? (
          <button
            type="button"
            disabled={busy}
            onClick={onPublish}
            className="rounded-xl bg-ink px-[18px] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Publish v1
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white px-[22px] py-[18px]">
      <p className="text-sm leading-snug">
        <strong>Claim map v{version}.</strong> {confirmedCount} of {teamSize}{" "}
        confirmed.
      </p>
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
        <span className="text-sm font-semibold text-muted">You confirmed</span>
      )}
    </div>
  );
}
