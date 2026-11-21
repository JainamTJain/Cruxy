import argon2 from "argon2";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { SAMPLE_MEMBER_STARTER } from "@/lib/constants";

const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function viewKeyBytes(): Buffer {
  const raw = process.env.PASSCODE_VIEW_KEY;
  if (!raw) {
    throw new Error("PASSCODE_VIEW_KEY is not set");
  }
  // Accept base64 or utf8; derive 32-byte key via SHA-256 so any length works.
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length >= 16) return createHash("sha256").update(b64).digest();
  } catch {
    /* fall through */
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export async function hashPasscode(code: string): Promise<string> {
  const hash = await argon2.hash(code, ARGON2_OPTS);
  return typeof hash === "string" ? hash : Buffer.from(hash).toString("utf8");
}

export async function verifyPasscode(
  hash: string,
  code: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, code);
  } catch {
    return false;
  }
}

/** AES-256-GCM encrypt; returns base64(iv|tag|ciphertext). */
export function encryptPasscodeCopy(code: string): string {
  const key = viewKeyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptPasscodeCopy(payload: string): string {
  const key = viewKeyBytes();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

export {
  isRepeatedDigits,
  isStraightRun,
  validatePersonalPasscode,
} from "@/lib/auth/passcode-shape";

export function getSampleMemberStarter(): string {
  return SAMPLE_MEMBER_STARTER;
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.SESSION_SECRET ?? "crux-ip";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
