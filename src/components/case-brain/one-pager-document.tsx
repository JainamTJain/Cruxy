"use client";

import Link from "next/link";
import type { OnePager } from "@/lib/revision/types";
import type { CaseRow, Team } from "@/lib/types";
import { supportLabel } from "@/components/case-brain/support-label";

type RoleNames = {
  lead1: string;
  lead2: string;
  counter: string;
  supporter: string;
};

type Props = {
  page: OnePager;
  caseRow: CaseRow | null;
  team: Team | null;
  roles: RoleNames;
  teamSize: number;
  canSign: boolean;
  busy: boolean;
  status: string;
  onSignOff: () => void;
  onExportPdf: () => void;
  onExportDrive: () => void;
  onRedraft: () => void;
};

function visual<T = Record<string, unknown>>(
  page: OnePager,
  kind: string,
): T | null {
  const v = page.body.visuals.find((x) => x.kind === kind);
  return (v?.payload as T) ?? null;
}

export function OnePagerDocument({
  page,
  caseRow,
  team,
  roles,
  teamSize,
  canSign,
  busy,
  status,
  onSignOff,
  onExportPdf,
  onExportDrive,
  onRedraft,
}: Props) {
  const caseNum = String(caseRow?.number ?? "").padStart(2, "0");
  const claimMap = visual<{
    nodes?: { id: string; label: string; supports: string[] }[];
    thesis?: string;
    crux?: string;
  }>(page, "claim_map");
  const values = visual<{
    left?: string;
    right?: string;
    note?: string | null;
    position?: number;
  }>(page, "values_scale");
  const stakeholders = visual<{
    cells?: { who: string; stake: string; voice: string }[] | string[];
  }>(page, "stakeholder_grid");
  const timeline = visual<{
    events?: { order: number; text: string; source?: string; when?: string }[];
  }>(page, "fact_timeline");
  const frameworks = visual<{
    items?: { name: string; one_line: string }[];
  }>(page, "framework_strip");
  const questions = visual<{ rows?: { q: string; a: string }[] }>(
    page,
    "question_table",
  );

  const thesis =
    claimMap?.thesis ||
    page.body.language?.plain ||
    page.body.claims[0]?.text ||
    "";

  const claims = page.body.claims.slice(0, 2);
  const cc = page.body.counterclaim;
  const signed = page.signed_off_by.length;
  const emptyRows = page.body.empty_rows ?? [];
  const hasEmptyRows = emptyRows.length > 0;
  const placeholderCc =
    Boolean(cc) &&
    [cc?.concede, cc?.distinguish, cc?.rebut].some(
      (x) => !x || /^see response\.?$/i.test(x.trim()),
    );

  const stakeCells = (stakeholders?.cells ?? []).map((c) =>
    typeof c === "string"
      ? { who: c, stake: "", voice: "" }
      : { who: c.who, stake: c.stake, voice: c.voice },
  );

  const events = (timeline?.events ?? []).slice(0, 6);
  const valuePos = Math.min(
    85,
    Math.max(12, Math.round((values?.position ?? 0.28) * 100)),
  );

  return (
    <div className="flex flex-col items-center gap-4 bg-[#E9EBEF] print:bg-white">
      <div className="flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-2.5">
        <Link
          href={caseRow ? `/case-brain/${caseRow.id}?teamId=${page.team_id}` : "/case-brain"}
          className="text-sm font-semibold"
        >
          ← Back to the case brain
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExportPdf}
            className="h-10 rounded-[10px] border border-[#C9CCD3] bg-white px-3.5 text-[13px] font-semibold"
          >
            Export PDF
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onExportDrive}
            className="h-10 rounded-[10px] border border-[#C9CCD3] bg-white px-3.5 text-[13px] font-semibold disabled:opacity-50"
          >
            Save to Drive as a Doc
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRedraft}
            className="h-10 rounded-[10px] border border-[#C9CCD3] bg-white px-3.5 text-[13px] font-semibold disabled:opacity-50"
          >
            Ask Cruxy to re-draft
          </button>
          {canSign ? (
            <button
              type="button"
              disabled={busy || hasEmptyRows}
              onClick={onSignOff}
              className="h-10 rounded-[10px] bg-ink px-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
              title={
                hasEmptyRows
                  ? "Fill empty rows before signing off"
                  : undefined
              }
            >
              Sign off v{page.version}
            </button>
          ) : null}
        </div>
      </div>

      {hasEmptyRows || placeholderCc ? (
        <div className="w-full max-w-[1100px] rounded-[14px] border border-[#C62828]/30 bg-white px-4 py-3 text-sm">
          {hasEmptyRows ? (
            <p className="m-0">
              Empty rows still open: {emptyRows.join(", ")}. Fill them before
              sign-off.
            </p>
          ) : null}
          {placeholderCc ? (
            <p className={hasEmptyRows ? "mt-1 mb-0" : "m-0"}>
              Counterclaim answers still say &quot;See response.&quot; Replace
              them with concede, distinguish and rebut.
            </p>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p className="w-full max-w-[1100px] text-xs text-muted">{status}</p>
      ) : null}

      <article className="flex w-full max-w-[1100px] flex-col gap-[22px] rounded-md bg-white px-10 py-9 print:shadow-none">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-[3px] border-ink pb-3.5">
          <div className="flex items-end gap-4">
            <span className="font-display text-[72px] font-extrabold leading-[0.8] text-cardinal">
              {caseNum}
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                One pager · {team?.name ?? "Team"} · v{page.version}
              </div>
              <h1 className="font-display m-0 text-[34px] font-extrabold">
                {caseRow?.title ?? "Case"}
              </h1>
            </div>
          </div>
          <span className="text-[13px] text-muted">
            Leads {roles.lead1}, {roles.lead2} · counter {roles.counter} ·
            supporter {roles.supporter} · signed off {signed} of {teamSize}
          </span>
        </header>

        <section className="rounded-xl bg-ink px-5 py-4 text-white">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gold">
            Our answer in one sentence
          </div>
          <p className="font-display mt-1.5 mb-0 text-[22px] font-semibold leading-snug">
            {thesis}
          </p>
        </section>

        {/* Claim map as connected boxes */}
        <section className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
          {claims.map((c, i) => (
            <div key={i} className="flex flex-col gap-3.5">
              <div className="rounded-xl border-2 border-ink bg-[#FFF7DB] p-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A6500]">
                  Claim {i + 1}
                </span>
                <div className="mt-1 text-[15px] font-semibold">{c.text}</div>
              </div>
              <div className="flex gap-2.5">
                {c.supports.map((s, j) => {
                  const { title } = supportLabel(s || `S${j + 1}`);
                  const backing =
                    (claimMap?.nodes?.[i]?.supports?.[j] &&
                      supportLabel(claimMap.nodes[i]!.supports[j]!).title) ||
                    "";
                  // Prefer short backing hint from mono line if support text is long
                  const mono = extractBackingHint(s);
                  return (
                    <div
                      key={j}
                      className="relative flex-1 rounded-[10px] border-[1.5px] border-ink bg-white p-2.5 text-[13px] leading-snug before:absolute before:left-1/2 before:top-[-14px] before:h-[14px] before:w-[1.5px] before:bg-ink before:content-['']"
                    >
                      <strong>S{j + 1}</strong> {title}
                      {mono ? (
                        <span className="mt-1 block font-mono text-[11px] text-muted">
                          {mono}
                        </span>
                      ) : backing && backing !== title ? (
                        <span className="mt-1 block font-mono text-[11px] text-muted">
                          {backing}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-[18px] md:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-2 rounded-xl border-2 border-cardinal p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-cardinal">
              Counterclaim and our answer
            </span>
            <span className="text-[15px] font-semibold">
              {cc?.text
                ? cc.text.startsWith('"')
                  ? cc.text
                  : `"${cc.text}"`
                : "No counterclaim yet"}
            </span>
            {cc ? (
              <div className="grid grid-cols-1 gap-2 text-[13px] leading-snug sm:grid-cols-3">
                <div className="rounded-xl bg-[#F7F8FA] p-3">
                  <strong>Concede</strong>
                  <br />
                  {cc.concede || "—"}
                </div>
                <div className="rounded-xl bg-[#F7F8FA] p-3">
                  <strong>Distinguish</strong>
                  <br />
                  {cc.distinguish || "—"}
                </div>
                <div className="rounded-xl bg-[#F7F8FA] p-3">
                  <strong>Rebut</strong>
                  <br />
                  {cc.rebut || "—"}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2.5 rounded-xl bg-[#F7F8FA] p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Values in tension · where we land
            </span>
            <div className="relative h-[34px]">
              <div className="absolute top-[15px] right-0 left-0 h-1 rounded-sm bg-[#C9CCD3]" />
              <div
                className="absolute top-1.5 h-[22px] w-[22px] rounded-full border-[3px] border-white bg-cardinal"
                style={{ left: `${valuePos}%` }}
              />
            </div>
            <div className="flex justify-between text-[13px] font-semibold">
              <span>{values?.left || "Value A"}</span>
              <span>{values?.right || "Value B"}</span>
            </div>
            {values?.note ? (
              <span className="text-xs text-muted">{values.note}</span>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            Case facts in order
          </span>
          <div className="relative grid grid-cols-2 gap-2 pt-3.5 sm:grid-cols-3 md:grid-cols-6">
            <div className="absolute top-[19px] right-[4%] left-[4%] h-[3px] bg-ink" />
            {events.length ? (
              events.map((e, i) => {
                const when =
                  e.when ||
                  guessWhen(e.text, e.source) ||
                  String(e.order ?? i + 1);
                const isLate = i >= events.length - 2;
                return (
                  <div
                    key={`${when}-${i}`}
                    className="relative flex flex-col items-center gap-1.5 text-center text-xs"
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full"
                      style={{
                        background:
                          i === events.length - 1
                            ? "var(--crux-gold)"
                            : isLate
                              ? "var(--crux-cardinal)"
                              : "#111318",
                      }}
                    />
                    <strong className="font-mono">{when}</strong>
                    {shortFact(e.text)}
                  </div>
                );
              })
            ) : (
              <p className="col-span-full text-sm text-muted">No facts yet.</p>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-[18px] md:grid-cols-[1fr_1.3fr]">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Stakeholders · stake · voice in the case
            </span>
            <div className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1.5 text-[13px]">
              {stakeCells.map((s) => (
                <StakeRow key={s.who} who={s.who} voice={s.voice} />
              ))}
            </div>
            <span className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Frameworks in one line
            </span>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {(frameworks?.items ?? []).slice(0, 4).map((f) => (
                <div
                  key={f.name}
                  className="rounded-xl bg-[#F7F8FA] p-3 text-[13px] leading-snug"
                >
                  <strong>{f.name.replace(/:$/, "")}:</strong>{" "}
                  {stripName(f.one_line, f.name)}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Hardest questions · our line
            </span>
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {(questions?.rows ?? []).slice(0, 6).map((row) => (
                  <tr key={row.q} className="border-t border-mist last:border-b">
                    <td className="w-[42%] py-2 pr-2 font-semibold align-top">
                      {row.q}
                    </td>
                    <td className="py-2 align-top">{row.a || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </article>
    </div>
  );
}

function StakeRow({ who, voice }: { who: string; voice: string }) {
  const hasVoice = /yes|through|indirect|official/i.test(voice || "");
  const strongVoice = /^yes$/i.test((voice || "").trim());
  return (
    <>
      <span>{who}</span>
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            background: hasVoice ? "#111318" : "transparent",
            border: hasVoice ? undefined : "2px solid #111318",
            boxSizing: "border-box",
          }}
        />
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            background: strongVoice ? "#111318" : "transparent",
            border: strongVoice ? undefined : "2px solid #111318",
            boxSizing: "border-box",
          }}
        />
      </span>
    </>
  );
}

function extractBackingHint(supportText: string): string {
  // Look for a short proper-name / act citation at the start of the body
  const { body } = supportLabel(supportText);
  const m = (body || supportText).match(
    /\b(Nozick|Kant|Young|Ross|Waldron|GEM|HTA|Human Tissue Act|Louvre|Appiah|Cuno)[^.]{0,20}/i,
  );
  return m?.[0]?.trim() ?? "";
}

function shortFact(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 48) return cleaned;
  const cut = cleaned.slice(0, 48);
  const at = cut.lastIndexOf(" ");
  return `${(at > 20 ? cut.slice(0, at) : cut).trim()}…`;
}

function guessWhen(text: string, source?: string): string | null {
  const blob = `${text} ${source ?? ""}`;
  const nov = blob.match(/\b(?:Nov(?:ember)?)\s+(20\d{2}|1[89]\d{2})\b/i);
  if (nov) return `Nov ${nov[1]}`;
  const decade = blob.match(/\b(1[7-9]\d0s)\b/i);
  if (decade) return decade[1]!;
  const year = blob.match(/\b(1[7-9]\d{2}|20\d{2})\b/);
  if (year) return year[1]!;
  if (/\btoday\b|\bnow\b/i.test(blob)) return "Now";
  return null;
}

function stripName(oneLine: string, name: string): string {
  const stripped = oneLine
    .replace(new RegExp(`^${escapeReg(name)}\\s*:\\s*`, "i"), "")
    .trim();
  return stripped || oneLine;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
