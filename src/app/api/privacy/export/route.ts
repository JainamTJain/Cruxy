import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { buildPersonalDataExport } from "@/lib/ops/personal-export";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { filename, json } = await buildPersonalDataExport(session.personId);
  return new NextResponse(json, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
