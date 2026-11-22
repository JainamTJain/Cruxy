/**
 * Public-domain Harvard sentences (IEEE recommended phonetically balanced lists).
 * Used for the text-dependent enrollment read. Not copyrighted.
 * Source tradition: Harvard Psychoacoustic Laboratory / IEEE.
 */

export type HarvardPassage = {
  id: string;
  text: string;
};

/** Short phonetically rich subset (~12–15 seconds when read aloud). */
export const HARVARD_ENROLLMENT: HarvardPassage = {
  id: "harvard-list1-1-4",
  text: "The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background. It is easy to tell the depth of a well. These days a chicken leg is a rare dish.",
};

export function harvardWordCount(): number {
  return HARVARD_ENROLLMENT.text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}
