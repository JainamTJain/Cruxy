import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  listBankEntries,
  saveBankEntry,
} from "@/lib/db/practice-repository";
import { proposeBankEntry } from "@/lib/practice/feedback";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const entries = await listBankEntries();
  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    lesson?: string;
    exampleLineId?: string | null;
    why?: string;
    improved?: string;
    caseId?: string | null;
  };
  if (!body.lesson?.trim()) {
    return NextResponse.json({ error: "lesson required" }, { status: 400 });
  }
  const entry = proposeBankEntry({
    lesson: body.lesson.trim(),
    exampleLineId: body.exampleLineId ?? null,
    why: body.why ?? "",
    improved: body.improved ?? "",
    caseId: body.caseId ?? null,
    createdBy: session.personId,
  });
  await saveBankEntry(entry);
  return NextResponse.json({ entry });
}
