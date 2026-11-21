import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead, canWrite } from "@/lib/admin/permissions";
import { getPersonById } from "@/lib/db/repository";
import {
  getModelSettings,
  updateModelSettings,
  type ModelTier,
  type ReasoningEffort,
} from "@/lib/cruxy/models";

export const runtime = "nodejs";

const TIERS: ModelTier[] = ["small", "strong", "embed"];

function isTier(v: unknown): v is ModelTier {
  return typeof v === "string" && (TIERS as string[]).includes(v);
}

export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "models")) {
    return NextResponse.json(
      { error: "Model settings are technical admin only." },
      { status: 403 },
    );
  }
  const settings = await getModelSettings();
  return NextResponse.json({ settings, canEdit: canWrite(person.role, "models") });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "models")) {
    return NextResponse.json(
      { error: "Only the technical admin can change model settings." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    tier?: string;
    model?: string;
    fallbacks?: string[];
    effort_default?: ReasoningEffort | null;
  };

  if (!isTier(body.tier)) {
    return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
  }
  if (body.model !== undefined && (!body.model.trim() || body.model.includes(" "))) {
    return NextResponse.json(
      { error: "Model must be a creator/model id with no spaces." },
      { status: 400 },
    );
  }
  if (body.fallbacks !== undefined) {
    if (!Array.isArray(body.fallbacks)) {
      return NextResponse.json({ error: "Fallbacks must be a list." }, { status: 400 });
    }
    if (body.tier === "embed" && body.fallbacks.length > 0) {
      return NextResponse.json(
        {
          error:
            "Embed has no fallback (different vector spaces). Leave fallbacks empty.",
        },
        { status: 400 },
      );
    }
  }

  const row = await updateModelSettings({
    tier: body.tier,
    model: body.model?.trim(),
    fallbacks: body.fallbacks?.map((f) => f.trim()).filter(Boolean),
    effort_default: body.effort_default,
    updatedBy: person.id,
  });

  return NextResponse.json({ ok: true, setting: row });
}
