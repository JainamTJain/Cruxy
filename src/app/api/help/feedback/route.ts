import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { canWrite } from "@/lib/admin/permissions";
import {
  createProductFeedback,
  listProductFeedback,
  updateProductFeedbackStatus,
  type ProductFeedbackKind,
  type ProductFeedbackStatus,
} from "@/lib/db/supabase/product-feedback-extra";
import { uploadBytes } from "@/lib/ops/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !session.adminView || !canWrite(person.role, "product_feedback")) {
    return NextResponse.json({ error: "Only Jainam can open this queue" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ProductFeedbackStatus | null;
  const rows = await listProductFeedback(
    status ? { status } : undefined,
  );
  return NextResponse.json({ feedback: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const body = (await req.json()) as {
    kind?: ProductFeedbackKind;
    pagePath?: string;
    whatDoing?: string;
    details?: string;
    screenshotBase64?: string | null;
    screenshotContentType?: string | null;
  };

  if (body.kind !== "problem" && body.kind !== "suggestion") {
    return NextResponse.json({ error: "Pick problem or suggestion" }, { status: 400 });
  }
  const pagePath = (body.pagePath ?? "").trim();
  const whatDoing = (body.whatDoing ?? "").trim();
  if (!pagePath || !whatDoing) {
    return NextResponse.json(
      { error: "Say which page and what you were doing" },
      { status: 400 },
    );
  }

  let screenshotPath: string | null = null;
  if (body.screenshotBase64 && body.screenshotBase64.length < 1_800_000) {
    try {
      const raw = body.screenshotBase64.replace(/^data:[^;]+;base64,/, "");
      const bytes = Buffer.from(raw, "base64");
      const ext =
        body.screenshotContentType?.includes("png")
          ? "png"
          : body.screenshotContentType?.includes("webp")
            ? "webp"
            : "jpg";
      const path = `feedback/${session.personId}/${Date.now()}.${ext}`;
      await uploadBytes({
        bucket: "crux-uploads",
        path,
        bytes,
        contentType: body.screenshotContentType ?? "image/jpeg",
      });
      screenshotPath = path;
    } catch {
      // Screenshot is optional; keep the report.
    }
  }

  const row = await createProductFeedback({
    personId: session.personId,
    kind: body.kind,
    pagePath,
    whatDoing,
    details: body.details?.trim() || null,
    screenshotPath,
  });

  return NextResponse.json({ feedback: row });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !session.adminView || !canWrite(person.role, "product_feedback")) {
    return NextResponse.json({ error: "Only Jainam can update this queue" }, { status: 403 });
  }

  const body = (await req.json()) as {
    id?: string;
    status?: ProductFeedbackStatus;
    adminNote?: string | null;
  };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "Need id and status" }, { status: 400 });
  }
  const allowed: ProductFeedbackStatus[] = [
    "open",
    "fixed",
    "wont_fix",
    "duplicate",
  ];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }

  const updated = await updateProductFeedbackStatus({
    id: body.id,
    status: body.status,
    adminNote: body.adminNote,
    actorId: session.personId,
  });
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ feedback: updated });
}
