/**
 * Classify Drive files that could not be read as text, with plain guidance.
 */

import type { LibraryFile } from "@/lib/library/types";

export type UnreadableKind =
  | "scanned_pdf"
  | "image"
  | "slides"
  | "binary"
  | "extract_failed";

export type UnreadableFile = {
  id: string;
  name: string;
  path: string | null;
  mime: string | null;
  kind: UnreadableKind;
  whatToDo: string;
};

function mimeLooksImage(mime: string | null): boolean {
  return Boolean(mime && /^image\//i.test(mime));
}

function mimeLooksSlides(mime: string | null, name: string): boolean {
  if (mime && /presentation|powerpoint|keynote/i.test(mime)) return true;
  return /\.(pptx?|key|odp)$/i.test(name);
}

const WHAT_TO_DO: Record<UnreadableKind, string> = {
  scanned_pdf:
    "Ask Jainam for a text PDF or OCR export, then put it in the Ethics Bowl Drive folder and Sync now.",
  image:
    "Images are not read yet. Paste key text into a Google Doc in the Drive folder, or ask Jainam for a typed transcript.",
  slides:
    "Export the deck as a Google Doc or PDF with selectable text, share it in the Drive folder, then Sync now.",
  extract_failed:
    "Re-export the file from Google Drive (File, Download as PDF or plain text), then Sync now.",
  binary:
    "This file has no usable text yet. Replace it with a Doc, Sheet, or text PDF in the Drive folder.",
};

export function classifyUnreadable(file: LibraryFile): UnreadableFile | null {
  const raw =
    file.unreadable_reason ??
    inferUnreadableReason({
      scannedPdf: file.scanned_pdf,
      mime: file.mime,
      name: file.name,
      text: file.text_content ?? "",
    });
  if (!raw) return null;
  const kind = (WHAT_TO_DO[raw as UnreadableKind]
    ? raw
    : "binary") as UnreadableKind;
  return {
    id: file.id,
    name: file.name,
    path: file.path,
    mime: file.mime,
    kind,
    whatToDo: WHAT_TO_DO[kind],
  };
}

/** Persistable reason string set during digest. */
export function inferUnreadableReason(args: {
  scannedPdf: boolean;
  mime: string | null;
  name: string;
  text: string;
}): string | null {
  if (args.scannedPdf || /^\[Scanned PDF flagged/i.test(args.text)) {
    return "scanned_pdf";
  }
  if (/\(Extract failed/i.test(args.text)) return "extract_failed";
  if (
    mimeLooksImage(args.mime) ||
    /\.(png|jpe?g|gif|webp|tiff?)$/i.test(args.name)
  ) {
    return "image";
  }
  if (mimeLooksSlides(args.mime, args.name)) return "slides";
  if (/^\[Not readable as text yet:/i.test(args.text)) return "binary";
  return null;
}

export function listUnreadableFiles(files: LibraryFile[]): UnreadableFile[] {
  const out: UnreadableFile[] = [];
  for (const f of files) {
    const u = classifyUnreadable(f);
    if (u) out.push(u);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Human label for kind chips. */
export function unreadableKindLabel(kind: UnreadableKind): string {
  switch (kind) {
    case "scanned_pdf":
      return "Scanned PDF";
    case "image":
      return "Image";
    case "slides":
      return "Slides";
    case "extract_failed":
      return "Extract failed";
    default:
      return "Not readable";
  }
}
