import { NextResponse } from "next/server";
import { listPeoplePublic } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const data = await listPeoplePublic();
  return NextResponse.json(data);
}
