import "server-only";

/**
 * VAPID keys for web push. Hide the "Turn on alerts" option until these exist.
 *
 * Jainam should add in Vercel (and .env.local):
 * - NEXT_PUBLIC_VAPID_PUBLIC_KEY  (safe for the browser)
 * - VAPID_PRIVATE_KEY             (server only)
 * - VAPID_SUBJECT                 (e.g. mailto:jainam@…)
 *
 * Generate with: npx web-push generate-vapid-keys
 */

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function getVapidConfig(): VapidConfig | null {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    (process.env.TECH_ADMIN_EMAIL?.trim()
      ? `mailto:${process.env.TECH_ADMIN_EMAIL.trim()}`
      : "");
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function vapidConfigured(): boolean {
  return getVapidConfig() != null;
}
