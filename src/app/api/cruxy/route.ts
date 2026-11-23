import { NextResponse } from "next/server";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    feature?: string;
    tier?: "small" | "strong";
    model?: string;
    messages?: { role: "system" | "user" | "assistant"; content: string }[];
  };
  if (!body.feature || !body.messages?.length) {
    return NextResponse.json({ error: "Missing feature or messages." }, { status: 400 });
  }
  const result = await callCruxy({
    feature: body.feature,
    tier: body.tier,
    model: body.model,
    messages: body.messages,
    personId: session.personId,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 429 });
  }
  return NextResponse.json(result);
}
