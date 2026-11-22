/**
 * Quiet hours use local wall-clock minutes (0–1439).
 * Spans that cross midnight work (e.g. 22:00–07:00).
 */

export function isInQuietHours(
  now: Date,
  start: number | null,
  end: number | null,
): boolean {
  if (start == null || end == null) return false;
  if (start === end) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return minutes >= start && minutes < end;
  }
  // Overnight window.
  return minutes >= start || minutes < end;
}

export function formatQuietMinutes(mins: number | null): string {
  if (mins == null) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseQuietTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
