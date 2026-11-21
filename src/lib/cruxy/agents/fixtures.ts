import fs from "fs";
import path from "path";

const FIXTURE_ROOT = path.join(
  process.cwd(),
  "tests",
  "cruxy",
  "fixtures",
  "responses",
);

/**
 * Load a recorded agent response for test:cruxy (no AI key required).
 * Returns null when the fixture file is missing.
 */
export function loadFixtureText(key: string): string | null {
  if (!key) return null;
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = path.join(FIXTURE_ROOT, `${safe}.json`);
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function fixturePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(FIXTURE_ROOT, `${safe}.json`);
}
