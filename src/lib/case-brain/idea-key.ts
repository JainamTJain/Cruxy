import { createHash } from "crypto";

export function ideaKeyFromText(text: string): string {
  return createHash("sha256")
    .update(text.trim().toLowerCase().replace(/\s+/g, " "))
    .digest("hex")
    .slice(0, 24);
}
