/**
 * Sample-mode smoke for Workstream J helpers.
 * Run: USE_SAMPLE_DATA=1 npx tsx scripts/workstream-j-smoke.ts
 */
import { decideCharacterMode, pickSocraticQuestion } from "../src/lib/cruxy/character";
import { moodForEvent } from "../src/components/cruxy/mood-events";
import {
  isRepeatedDigits,
  isStraightRun,
  validatePersonalPasscode,
} from "../src/lib/auth/passcode-shape";
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(isRepeatedDigits("111111"), "repeated");
assert(isStraightRun("123456"), "asc");
assert(isStraightRun("654321"), "desc");
assert(
  validatePersonalPasscode("111111", "000000") !== null,
  "refuse repeated",
);
assert(
  validatePersonalPasscode("123456", "000000") !== null,
  "refuse run",
);
assert(
  validatePersonalPasscode("000000", "000000") !== null,
  "refuse shared",
);

const ask = decideCharacterMode({ question: "Is this claim strong?" });
assert(ask.mode === "ask" && ask.question, "asks first");

const direct = decideCharacterMode({
  question: "Where is this in the Drive?",
});
assert(direct.mode === "direct", "lookup direct");

const timed = decideCharacterMode({
  question: "Is this claim strong?",
  timedRound: true,
});
assert(timed.mode === "direct", "timed direct");

const hint = decideCharacterMode({
  question: "Is this claim strong?",
  wantsHint: true,
});
assert(hint.mode === "hint", "hint mode");

assert(pickSocraticQuestion("seed").length > 5, "question");

const m = moodForEvent("feedback.worse");
assert(m.mood === "sad" && m.bubble, "sad mood + bubble");
assert(moodForEvent("opponent.active").mood === "angry", "fierce");
assert(moodForEvent("hint.given").mood === "winking", "hint mood");

console.log("workstream-j-smoke: ok");
