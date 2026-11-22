"use client";

import { useMemo } from "react";
import {
  AnnotateSurface,
  ReadingToolbar,
  ReadingToolsProvider,
  buildLegend,
  renderMarkedText,
  type ReadingMark,
} from "@/components/case/reading-tools";
import { cn } from "@/lib/utils";

export type AnnotatablePassage = {
  id: string;
  text: string;
};

type MarkIn = {
  id?: string;
  needle: string;
  kind: "highlight" | "comment";
  personKey?: string | null;
  personName?: string | null;
  createdAt?: string | null;
};

/**
 * Shared reading tools for case text and full originals:
 * Highlighter toggle, right click / long press menu, coloured highlights.
 * Framework terms stay linked via LinkedText inside marked text.
 */
export function AnnotatablePassages({
  passages,
  marks,
  caseId,
  teamId,
  onSaved,
  className,
}: {
  passages: AnnotatablePassage[];
  marks: MarkIn[];
  caseId?: string | null;
  teamId?: string | null;
  onSaved?: () => void | Promise<void>;
  className?: string;
}) {
  const readingMarks: ReadingMark[] = useMemo(
    () =>
      marks.map((m, i) => ({
        id: m.id ?? `m-${i}`,
        needle: m.needle,
        kind: m.kind,
        personKey: m.personKey ?? m.personName ?? null,
        personName: m.personName ?? null,
        createdAt: m.createdAt ?? null,
      })),
    [marks],
  );
  const legend = useMemo(() => buildLegend(readingMarks), [readingMarks]);

  return (
    <ReadingToolsProvider caseId={caseId} teamId={teamId}>
      <div className={cn("flex flex-col gap-2", className)}>
        <ReadingToolbar legend={legend} />
        <AnnotateSurface
          className="max-h-[420px] overflow-y-auto rounded-xl border border-[#E3E5E9] bg-[#F7F8FA] p-3 text-sm leading-relaxed"
          resolvePassageId={(el) =>
            (el.closest("[data-passage-id]") as HTMLElement | null)?.dataset
              .passageId ?? null
          }
          onSaved={onSaved}
        >
          <div
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            {passages.map((p) => (
              <p
                key={p.id}
                className="m-0 mb-3 last:mb-0"
                data-passage-id={p.id}
              >
                {renderMarkedText(p.text, readingMarks, caseId)}
              </p>
            ))}
          </div>
        </AnnotateSurface>
      </div>
    </ReadingToolsProvider>
  );
}
