/**
 * Fails if seeded content contains placeholders or mid-word truncation.
 * Usage: npx tsx scripts/seed-quality.ts
 */
import path from "path";
import { buildContentSeed } from "../src/lib/seed/build-content";
import { assertSeedQuality } from "../src/lib/seed/quality";

async function main() {
  const bundle = await buildContentSeed(path.resolve(__dirname, ".."));
  // Focus on the content that ships to the app (not raw ParsedCase dumps).
  const { parsed: _parsed, ...shipped } = bundle;
  assertSeedQuality(shipped);
  console.log("seed quality: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
