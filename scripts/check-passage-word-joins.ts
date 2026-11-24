/**
 * Unit checks for PDF/Doc line-join + run-together repair.
 * Run: npx tsx scripts/check-passage-word-joins.ts
 */
import { joinExtractedLines, normalizeExtractedText } from "../src/lib/library/join-extracted-text";
import { repairRunTogetherWords } from "../src/lib/library/repair-run-together";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEq(actual: string, expected: string, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

// --- joinExtractedLines ---
assertEq(
  joinExtractedLines("mass surveillance of\nAmericans today"),
  "mass surveillance of Americans today",
  "soft line wrap joins with a space",
);
assertEq(
  joinExtractedLines("first paragraph.\n\nsecond paragraph."),
  "first paragraph.\n\nsecond paragraph.",
  "paragraph breaks kept",
);
assertEq(
  joinExtractedLines("surveil-\nlance of citizens"),
  "surveillance of citizens",
  "de-hyphenate wrap only",
);
assertEq(
  joinExtractedLines("well-known\npolicy"),
  "well-known policy",
  "keep in-line hyphen; join next soft wrap",
);
assertEq(
  joinExtractedLines("New-\nYork style"),
  "New-York style",
  "keep hyphen across capital wrap, no extra space",
);

// --- repairRunTogetherWords (Case 1 live examples) ---
const samples: [string, string][] = [
  [
    "no mass surveillance ofAmericans without oversight",
    "no mass surveillance of Americans without oversight",
  ],
  ["today'sAI systems are unreliable", "today's AI systems are unreliable"],
  [
    "more accurately, andreduce battlefield mistakes",
    "more accurately, and reduce battlefield mistakes",
  ],
  [
    "The models often treatedtactical nuclear use",
    "The models often treated tactical nuclear use",
  ],
  [
    "the chain of command.Private companies are not elected",
    "the chain of command. Private companies are not elected",
  ],
];

for (const [before, after] of samples) {
  assertEq(repairRunTogetherWords(before), after, `repair: ${before}`);
}

// --- must not split ---
assertEq(repairRunTogetherWords("Buy an iPhone today"), "Buy an iPhone today", "iPhone");
assertEq(repairRunTogetherWords("Visit eBay for parts"), "Visit eBay for parts", "eBay");
assertEq(
  repairRunTogetherWords("See https://example.com/ofAmericans for more"),
  "See https://example.com/ofAmericans for more",
  "URL left alone",
);
assertEq(repairRunTogetherWords("A therapist helps."), "A therapist helps.", "real word");
assertEq(repairRunTogetherWords("go elsewhere now"), "go elsewhere now", "elsewhere");

// --- normalizeExtractedText combines both ---
assertEq(
  normalizeExtractedText("mass surveillance of\nAmericans\n\ntoday'sAI systems"),
  "mass surveillance of Americans\n\ntoday's AI systems",
  "normalize joins then repairs",
);

assert(true, "ok");
console.log("passage word-join checks ok");
console.log("\nBefore / after (Case 1 examples):");
for (const [before, after] of samples) {
  console.log(`  - ${JSON.stringify(before)}`);
  console.log(`    → ${JSON.stringify(after)}`);
}
