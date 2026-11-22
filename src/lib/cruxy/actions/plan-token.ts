/**
 * Signed, short-lived action plans. Cruxy proposes; the person taps Apply.
 * The plan travels to the browser and back, so it is signed to stop tampering.
 */
import "server-only";

import { SignJWT, jwtVerify } from "jose";

const PLAN_MINUTES = 15;

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(`cruxy-action:${s}`);
}

export type SignedPlan<T> = {
  action: string;
  personId: string;
  teamId: string | null;
  data: T;
};

export async function signPlan<T>(plan: SignedPlan<T>): Promise<string> {
  return new SignJWT({ plan })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PLAN_MINUTES}m`)
    .sign(key());
}

export async function readPlan<T>(token: string): Promise<SignedPlan<T> | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    return (payload.plan as SignedPlan<T>) ?? null;
  } catch {
    return null;
  }
}
