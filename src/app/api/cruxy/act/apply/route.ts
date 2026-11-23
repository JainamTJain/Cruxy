import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { applySignedPlan } from "@/lib/cruxy/actions/apply";
import { readPlan } from "@/lib/cruxy/actions/plan-token";
import { getPersonById } from "@/lib/db/repository";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Apply a plan Cruxy proposed, after the person tapped Apply. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { planId?: string };
  const plan = body.planId ? await readPlan(body.planId) : null;
  if (!plan || plan.personId !== session.personId) {
    return NextResponse.json(
      {
        error:
          "That plan has expired. Ask Cruxy again and it will make a fresh one.",
      },
      { status: 400 },
    );
  }

  try {
    const person = await getPersonById(session.personId);
    const result = await applySignedPlan({ plan, session, person });
    return NextResponse.json({
      message: result.message,
      navigate: result.navigate ?? null,
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 409;
    const msg = err instanceof Error ? err.message : "";
    return NextResponse.json(
      { error: msg || "That did not go through. Nothing was changed." },
      { status: status === 403 || status === 400 ? status : 409 },
    );
  }
}
