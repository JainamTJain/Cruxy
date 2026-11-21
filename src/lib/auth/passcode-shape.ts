/** Client-safe passcode shape checks (no Node crypto / argon2). */

export function isRepeatedDigits(code: string): boolean {
  return /^(\d)\1{5}$/.test(code);
}

export function isStraightRun(code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const asc = "0123456789";
  const desc = "9876543210";
  return asc.includes(code) || desc.includes(code);
}

export function validatePersonalPasscode(
  code: string,
  sharedStarter: string,
): string | null {
  if (!/^\d{6}$/.test(code)) return "Enter exactly 6 digits.";
  if (code === sharedStarter) return "Not the member code.";
  if (isRepeatedDigits(code))
    return "Not one digit repeated, like 111111.";
  if (isStraightRun(code))
    return "Not a straight run, like 123456 or 654321.";
  return null;
}
