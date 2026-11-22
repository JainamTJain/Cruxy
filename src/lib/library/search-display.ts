/** Parse passage anchors like p3:Heading into a page label. */

export function pageFromAnchor(anchor: string | null | undefined): {
  page: number | null;
  heading: string | null;
  label: string | null;
} {
  if (!anchor) return { page: null, heading: null, label: null };
  const m = /^p(\d+)(?::(.*))?$/i.exec(anchor.trim());
  if (!m) {
    return { page: null, heading: anchor, label: anchor };
  }
  const page = Number(m[1]);
  const heading = m[2]?.trim() || null;
  const label = heading ? `Page ${page}, ${heading}` : `Page ${page}`;
  return { page, heading, label };
}
