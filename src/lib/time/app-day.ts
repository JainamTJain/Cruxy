/**
 * The teams are in California, but servers run in UTC. "Today" for due items,
 * sessions and reminders is the Los Angeles calendar day, so the app does not
 * flip to tomorrow at 4pm Pacific.
 */
export const APP_TIME_ZONE = "America/Los_Angeles";

/** Today's date in Los Angeles as YYYY-MM-DD. */
export function appToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
