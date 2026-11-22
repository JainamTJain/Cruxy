/** Build a VCALENDAR (.ics) string from team events. */
import type { TeamEvent } from "@/lib/team/calendar-types";

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const sec = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${sec}Z`;
}

function toIcsDateOnly(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export function buildIcsCalendar(input: {
  calendarName: string;
  events: TeamEvent[];
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Crux//Team Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(input.calendarName)}`,
  ];

  for (const e of input.events) {
    const uid = `${e.id}@crux.team`;
    const stamp = toIcsUtc(e.created_at || e.starts_at);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (e.kind === "deadline" && e.starts_at.length <= 10) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDateOnly(e.starts_at.slice(0, 10))}`);
    } else {
      lines.push(`DTSTART:${toIcsUtc(e.starts_at)}`);
      if (e.ends_at) lines.push(`DTEND:${toIcsUtc(e.ends_at)}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title)}`);
    const descBits: string[] = [];
    if (e.body) descBits.push(e.body);
    if (e.place) descBits.push(`Place: ${e.place}`);
    if (e.online) descBits.push("Online");
    if (descBits.length) {
      lines.push(`DESCRIPTION:${icsEscape(descBits.join("\n"))}`);
    }
    if (e.place) lines.push(`LOCATION:${icsEscape(e.place)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
