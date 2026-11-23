import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { callCruxy } from "@/lib/cruxy/callCruxy";
import { getPassage, getLibraryFile } from "@/lib/db/library-repository";

export const runtime = "nodejs";
export const maxDuration = 120;

const ACTIONS = ["explain", "counterexample", "cited_elsewhere"] as const;

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as {
    passageId?: string;
    highlightText?: string;
    action?: (typeof ACTIONS)[number];
  };

  if (!body.passageId || !body.action || !ACTIONS.includes(body.action)) {
    return NextResponse.json(
      { error: "passageId and action (explain|counterexample|cited_elsewhere) required" },
      { status: 400 },
    );
  }

  const passage = await getPassage(body.passageId);
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }
  const file = await getLibraryFile(passage.file_id);

  const prompts: Record<(typeof ACTIONS)[number], string> = {
    explain: "Explain this highlight in plain words. Cite the passage id.",
    counterexample: "Find a counterexample to this highlight. Cite or say you couldn't find a source.",
    cited_elsewhere:
      "Is this cited elsewhere in our Drive? Use only the passage provided; if you cannot verify, say so.",
  };

  const result = await callCruxy({
    feature: "reading",
    tier: "small",
    personId: auth.session.personId,
    messages: [
      {
        role: "system",
        content:
          "You are Cruxy in the reading room. Cite passage ids. If sources don't support an answer, say so. Keep it short. Ask one question before a full answer unless this is a lookup.",
      },
      {
        role: "user",
        content: [
          prompts[body.action],
          `Passage id: ${passage.id}`,
          `Anchor: ${passage.anchor}`,
          `Drive file: ${file?.name ?? "unknown"} (${file?.drive_id ?? "no drive id"})`,
          `Highlight: ${body.highlightText ?? "(full passage)"}`,
          `Passage text:\n${passage.text.slice(0, 2500)}`,
        ].join("\n\n"),
      },
    ],
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, refused: true },
      { status: 402 },
    );
  }

  return NextResponse.json({
    answer: result.text,
    citation: {
      passage_id: passage.id,
      drive_id: passage.drive_id ?? file?.drive_id ?? null,
      anchor: passage.anchor,
      file_id: passage.file_id,
    },
    stub: result.stub,
  });
}
