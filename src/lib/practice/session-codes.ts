import { createHash, randomInt } from "crypto";
import { hashPasscode, verifyPasscode } from "@/lib/crypto/passcodes";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 6-char session join code (no ambiguous 0/O/1/I). */
export function generateSessionCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export async function hashSessionCode(code: string): Promise<string> {
  return hashPasscode(normalizeCode(code));
}

export async function verifySessionCode(
  hash: string,
  code: string,
): Promise<boolean> {
  return verifyPasscode(hash, normalizeCode(code));
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Guest judge short-lived token hash (never store plaintext). */
export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateGuestToken(): string {
  return createHash("sha256")
    .update(`${Date.now()}-${randomInt(1e9)}`)
    .digest("hex")
    .slice(0, 32);
}
