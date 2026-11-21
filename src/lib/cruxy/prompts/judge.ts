import {
  JUDGE_PROMPT_ADDITIONS,
  sharedSystemPrefix,
} from "@/lib/cruxy/prompts/shared";

export const JUDGE_ROLE = `You are Cruxy's Judge. ${JUDGE_PROMPT_ADDITIONS}`;

export function judgeSystemPrompt(): string {
  return `${sharedSystemPrefix()}\n\n${JUDGE_ROLE}`;
}
