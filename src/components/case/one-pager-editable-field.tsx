"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ThreadInline } from "@/components/discussion/thread-inline";
import { LinkedText } from "@/components/frameworks/linked-text";
import { cn } from "@/lib/utils";

export type FieldFlag = {
  label: string;
  detail: string;
  kind?: string;
};

type Props = {
  value: string;
  canEdit: boolean;
  multiline?: boolean;
  className?: string;
  displayClassName?: string;
  placeholder?: string;
  label?: string;
  /** When set, technical phrases get quiet in-place explainers. */
  caseId?: string | null;
  onSave: (next: string) => Promise<void> | void;
  /** Cruxy critique flag (fallacy or missing link) for this line. */
  flag?: FieldFlag | null;
  /** When set, show an in-place discussion thread under this field. */
  discussion?: {
    caseId: string;
    teamId: string;
    fieldKey: string;
  } | null;
};

/**
 * Tap to edit in place. Save writes a new one-pager version via the parent.
 */
export function OnePagerEditableField({
  value,
  canEdit,
  multiline,
  className,
  displayClassName,
  placeholder = "Tap to add",
  label,
  caseId,
  onSave,
  flag,
  discussion,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const display = value.trim() ? (
    <LinkedText text={value} caseId={caseId} preWrap={multiline} />
  ) : (
    <span className="text-muted">{placeholder}</span>
  );

  const flagChip = flag ? (
    <div className="print:hidden">
      <button
        type="button"
        className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-md bg-[#FFF3C4] px-2 text-[11px] font-semibold text-[#8A6500]"
        onClick={() => setFlagOpen((v) => !v)}
        aria-expanded={flagOpen}
      >
        Cruxy flag: {flag.label}
      </button>
      {flagOpen ? (
        <p className="mt-1 max-w-prose text-[12px] leading-snug text-[#5A606B]">
          {flag.detail}
        </p>
      ) : null}
    </div>
  ) : null;

  let field: ReactNode;
  if (!editing) {
    // Div (not a wrapping button) so framework marks stay clickable.
    field = (
      <div className={cn("group relative", displayClassName, className)}>
        {display}
        {flagChip}
        {canEdit ? (
          <button
            type="button"
            className="mt-1 inline-flex min-h-11 items-center text-[11px] font-semibold text-muted underline-offset-2 hover:underline print:hidden"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            aria-label={label ? `Edit ${label}` : "Edit"}
          >
            Edit
          </button>
        ) : null}
      </div>
    );
  } else {
    field = (
      <div className={cn("flex flex-col gap-2", className)}>
        {multiline ? (
          <textarea
            className="min-h-[88px] w-full rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        ) : (
          <input
            className="h-10 w-full rounded-xl border border-ink/20 bg-white px-3 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="min-h-11 rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await onSave(draft);
                  setEditing(false);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-11 rounded-lg px-3 text-xs font-semibold text-muted underline"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!discussion) return field;

  return (
    <div className="flex flex-col">
      {field}
      <div className="print:hidden">
        <ThreadInline
          caseId={discussion.caseId}
          teamId={discussion.teamId}
          kind="one_pager_field"
          targetId={discussion.fieldKey}
          title={label ?? discussion.fieldKey}
        />
      </div>
    </div>
  );
}

/** Skeleton line for role names while case roles load. */
export function RoleNameSkeleton() {
  return (
    <span
      className="inline-block h-3 w-16 animate-pulse rounded bg-[#D8DBE0]"
      aria-hidden
    />
  );
}
