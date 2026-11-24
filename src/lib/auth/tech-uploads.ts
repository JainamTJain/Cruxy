/**
 * Material the tech admin uploads (book chapters for book requests, and his own
 * Extra reading imports) is kept from the coach admin's view. Teams and Cruxy
 * still use it; Dr. B does not see it listed.
 */
import "server-only";
import { listPeopleFull } from "@/lib/db/repository";

export function isCoachViewer(role: string | null | undefined): boolean {
  return role === "coach_admin";
}

/** Library files made from a book request upload. */
export function isTechUploadFile(f: { drive_id?: string | null }): boolean {
  return Boolean(f.drive_id?.startsWith("upload:"));
}

/** Ids of people whose uploads are hidden from the coach. */
export async function techAdminIds(): Promise<Set<string>> {
  const people = await listPeopleFull();
  return new Set(people.filter((p) => p.role === "tech_admin").map((p) => p.id));
}
