"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ThreadInline } from "@/components/discussion/thread-inline";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  canEdit: boolean;
  multiline?: boolean;
  className?: string;
  displayClassName?: string;
  placeholder?: string;
  label?: string;
  onSave: (next: string) => Promise<void> | void;
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
  onSave,
  discussion,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  let field: ReactNode;
  if (!canEdit) {
    field = (
      <span className={cn(displayClassName, className)}>
        {value.trim() ? value : <span className="text-muted">{placeholder}</span>}
      </span>
    );
  } else if (!editing) {
    field = (
      <button
        type="button"
        className={cn(
          "w-full rounded-lg text-left transition hover:ring-2 hover:ring-ink/15",
          displayClassName,
          className,
        )}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        aria-label={label ? `Edit ${label}` : "Edit"}
      >
        {value.trim() ? (
          value
        ) : (
          <span className="text-muted">{placeholder}</span>
        )}
      </button>
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
            className="h-8 rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
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
            className="h-8 rounded-lg px-3 text-xs font-semibold text-muted underline"
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
      <ThreadInline
        caseId={discussion.caseId}
        teamId={discussion.teamId}
        kind="one_pager_field"
        targetId={discussion.fieldKey}
        title={label ?? discussion.fieldKey}
      />
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
