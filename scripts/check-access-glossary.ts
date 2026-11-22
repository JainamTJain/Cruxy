/**
 * Quick asserts for Wave 9 I glossary lookup.
 * Run: npx tsx scripts/check-access-glossary.ts
 */
import { lookupGlossary } from "../src/lib/access/ethics-glossary";
import {
  normalizeAccessPrefs,
  isTextSizeStep,
} from "../src/lib/access/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(Boolean(lookupGlossary("Ethics Bowl")?.meaning.includes("moral")), "ethics bowl");
assert(lookupGlossary("APPE") != null, "appe");
assert(lookupGlossary("counterclaim") != null, "counterclaim");
assert(lookupGlossary("xyzzy-not-a-term") == null, "miss");
assert(isTextSizeStep("lg"), "lg step");
assert(!isTextSizeStep("huge"), "bad step");
assert(normalizeAccessPrefs({ text_size: "xl" }).text_size === "xl", "norm");
assert(
  normalizeAccessPrefs({}).reduce_motion === "system",
  "default motion",
);

console.log("access glossary checks ok");
