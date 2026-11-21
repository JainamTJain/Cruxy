import "server-only";
import { logActivity } from "@/lib/db/repository";

export type SendEmailResult =
  | { ok: true; stub: boolean; id?: string }
  | { ok: false; error: string; stub: boolean };

const DEFAULT_FROM = "Crux <onboarding@resend.dev>";

/**
 * Thin Resend send. Stubs (and logs) when EMAIL_API_KEY is missing.
 * Sender stays onboarding@resend.dev until Jainam verifies a domain.
 */
export async function sendOpsEmail(opts: {
  to: string;
  subject: string;
  text: string;
  action: string;
  meta?: Record<string, unknown>;
}): Promise<SendEmailResult> {
  const apiKey = process.env.EMAIL_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;

  if (!apiKey) {
    await logActivity({
      person_id: null,
      action: `${opts.action}_stubbed`,
      target: opts.to,
      meta: { subject: opts.subject, ...(opts.meta ?? {}) },
    });
    return { ok: true, stub: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    await logActivity({
      person_id: null,
      action: `${opts.action}_error`,
      target: opts.to,
      meta: { status: res.status, body, ...(opts.meta ?? {}) },
    });
    return { ok: false, stub: false, error: `Resend ${res.status}` };
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  await logActivity({
    person_id: null,
    action: `${opts.action}_sent`,
    target: opts.to,
    meta: { id: json.id, subject: opts.subject, ...(opts.meta ?? {}) },
  });
  return { ok: true, stub: false, id: json.id };
}
