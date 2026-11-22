"use client";

/**
 * Slot for Workstream C's working document (Team Brief / build-in-Crux).
 * C owns the real UI; F only mounts this export on the Working document tab.
 */
export function WorkingDocument({
  caseId,
  teamId,
}: {
  caseId: string;
  teamId: string;
}) {
  void caseId;
  void teamId;
  return (
    <p className="m-0 rounded-[20px] bg-white px-5 py-6 text-sm text-muted">
      The working document for this case will open here.
    </p>
  );
}
