import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import {
  createProposal,
  markSocraticAnswered,
} from "@/lib/case-brain/service";
import type { Proposal, ProposalOrigin } from "@/lib/case-brain/types";

export async function POST(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    caseId?: string;
    text?: string;
    kind?: Proposal["kind"];
    origin?: ProposalOrigin;
    originRef?: string | null;
  };
  if (!body.caseId || !body.text?.trim()) {
    return NextResponse.json(
      { error: "caseId and text are required." },
      { status: 400 },
    );
  }
  const proposal = await createProposal({
    teamId: auth.teamId,
    caseId: body.caseId,
    personId: auth.session.personId,
    text: body.text,
    kind: body.kind,
    origin: body.origin ?? "member",
    originRef: body.originRef ?? null,
  });
  return NextResponse.json({ proposal });
}

export async function PATCH(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    proposalId?: string;
    action?: "socratic_answered";
  };
  if (!body.proposalId || body.action !== "socratic_answered") {
    return NextResponse.json({ error: "Invalid patch." }, { status: 400 });
  }
  const result = await markSocraticAnswered({
    proposalId: body.proposalId,
    teamId: auth.teamId,
    personId: auth.session.personId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
