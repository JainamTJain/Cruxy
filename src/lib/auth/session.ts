import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SessionPayload } from "@/lib/types";
import { SESSION_DAYS } from "@/lib/constants";

const COOKIE = "crux_session";

function secretKey() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function readSessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const jar = await cookies();
  // Secure only on real HTTPS hosts (Vercel). Sample-mode `next start` on
  // http://localhost must keep the cookie or every signed-in journey fails.
  const secure =
    Boolean(process.env.VERCEL) || process.env.COOKIE_SECURE === "1";
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * Returns the session only if the cookie is valid and people.session_version
 * still matches (passcode reset signs the person out everywhere).
 */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const payload = await readSessionToken(token);
  if (!payload) return null;

  try {
    const { getPersonSessionVersion } = await import(
      "@/lib/db/supabase/auth-extra"
    );
    const current = await getPersonSessionVersion(payload.personId);
    const tokenVersion =
      typeof payload.sessionVersion === "number" ? payload.sessionVersion : 0;
    if (tokenVersion !== current) {
      await clearSessionCookie();
      return null;
    }
  } catch {
    // If the version check cannot run, keep the cookie so sample/dev still works.
  }

  if (payload.deviceId) {
    try {
      const { isDeviceActive, touchAuthDevice } = await import(
        "@/lib/auth/devices"
      );
      const active = await isDeviceActive(payload.personId, payload.deviceId);
      if (!active) {
        await clearSessionCookie();
        return null;
      }
      await touchAuthDevice(payload.deviceId);
    } catch {
      // Device table may be missing before migration; keep the cookie.
    }
  }

  // Older cookies predate Wave 8; fill the learning-profile gate.
  if (typeof payload.mustSetLearningProfile !== "boolean") {
    if (payload.mustConsent) {
      payload.mustSetLearningProfile = true;
    } else {
      try {
        const { hasLearningProfile } = await import("@/lib/learning/profile");
        payload.mustSetLearningProfile = !(await hasLearningProfile(
          payload.personId,
        ));
      } catch {
        payload.mustSetLearningProfile = false;
      }
    }
  }

  return payload;
}

export async function updateSession(patch: Partial<SessionPayload>) {
  const current = await getSession();
  if (!current) return null;
  const next = { ...current, ...patch };
  await setSessionCookie(next);
  return next;
}
