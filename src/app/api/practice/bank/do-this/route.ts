import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { markBankDoThis } from "@/lib/practice/wave5";

/** F-281: "I do this" adds the bank drill to the person's roadmap. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    bankEntryId?: string;
    caseId?: string | null;
  };
  if (!body.bankEntryId) {
    return NextResponse.json({ error: "bankEntryId required" }, { status: 400 });
  }
  const result = await markBankDoThis({
    bankEntryId: body.bankEntryId,
    personId: session.personId,
    caseId: body.caseId ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json(result);
}
