import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { decideProposal } from "@/lib/case-brain/service";
import type { DecisionVerdict } from "@/lib/case-brain/types";

export async function POST(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    proposalId?: string;
    verdict?: DecisionVerdict;
    reason?: string;
    editedText?: string | null;
  };
  if (!body.proposalId || !body.verdict) {
    return NextResponse.json(
      { error: "proposalId and verdict are required." },
      { status: 400 },
    );
  }
  if (!["accept", "reject", "edit"].includes(body.verdict)) {
    return NextResponse.json({ error: "Invalid verdict." }, { status: 400 });
  }

  const result = await decideProposal({
    proposalId: body.proposalId,
    personId: auth.session.personId,
    teamId: auth.teamId,
    verdict: body.verdict,
    reason: body.reason ?? "",
    editedText: body.editedText,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ decision: result.decision });
}
