import { answerProgramQuestion } from "@/lib/team/program-assistant";

/**
 * Cruxy admin mode: answers program questions from live Crux records
 * with the numbers used (cite-or-quiet). Members cannot call this path.
 */
export async function answerAdminProgramQuestion(input: {
  question: string;
  personId: string;
}): Promise<{
  text: string;
  links: { label: string; href: string }[];
  stub: boolean;
  numbers?: string[];
  missing?: string[];
}> {
  const answer = await answerProgramQuestion(input);
  return {
    text: answer.text,
    links: answer.links,
    stub: answer.stub,
    numbers: answer.numbers,
    missing: answer.missing,
  };
}
