import { NextResponse } from "next/server";
import { requireSession } from "@/lib/revision/api-auth";
import { buildWarmUp } from "@/lib/revision/repository";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const warm = await buildWarmUp(auth.session.personId);
  return NextResponse.json(warm);
}
