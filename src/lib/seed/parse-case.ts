/** Parse a Team 3 case prep markdown file into structured fields. */

export interface ParsedFact {
  fact: string;
  source: string;
}

export interface ParsedStakeholder {
  who: string;
  stake: string;
  voice: string;
}

export interface ParsedQA {
  question: string;
  answer: string;
}

export interface ParsedBacking {
  kind: "case_fact" | "source" | "example" | "framework";
  text: string;
}

export interface ParsedSupport {
  label: string;
  /** Short support title (e.g. "The responsibility gap"). */
  title: string;
  /** Body after the title. */
  body: string;
  /** Display text: "Title. Body" (or title alone). */
  text: string;
  backing: ParsedBacking;
}

export interface ParsedClaim {
  title: string;
  logicLine: string;
  supports: ParsedSupport[];
  ethicalAnalysis: string;
  concede: string;
}

export interface ParsedCounterclaim {
  text: string;
  theirSupports: string;
  concede: string;
  distinguish: string;
  rebut: string;
}

export interface ParsedCase {
  number: number;
  titleFromDoc: string;
  facts: ParsedFact[];
  crux: string;
  trap: string;
  stakeholders: ParsedStakeholder[];
  moderatorQuestions: ParsedQA[];
  thesis: string;
  claim1: ParsedClaim;
  claim2: ParsedClaim;
  counterclaims: ParsedCounterclaim[];
  judgeQuestions: ParsedQA[];
  commentaryKit: string[];
}

function section(md: string, heading: string): string {
  const re = new RegExp(
    `##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    "i",
  );
  const m = md.match(re);
  return m?.[1]?.trim() ?? "";
}

function parseTable(block: string): string[][] {
  const rows: string[][] = [];
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|\s*-/.test(t)) continue;
    const cells = t
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function boldField(block: string, label: string): string {
  // Accept "Crux:", "The trap:", "The traps." etc.
  const re = new RegExp(
    `\\*\\*${label}s?(?:[:.]|\\*\\*)\\*\\*\\s*([\\s\\S]*?)(?=\\n\\n|\\n\\*\\*|\\n\\|\\s*Who|$)`,
    "i",
  );
  const m = block.match(re);
  return (m?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function parseBacking(raw: string): ParsedBacking {
  const m = raw.match(
    /^\*Backing\s*\(([^)]+)\):\*\s*([\s\S]*)$/i,
  );
  if (!m) {
    return { kind: "source", text: raw.replace(/^\*Backing[^:]*:\*\s*/i, "").trim() };
  }
  const label = m[1]!.toLowerCase();
  const text = m[2]!.trim();
  if (label.includes("framework")) return { kind: "framework", text };
  if (label.includes("example")) return { kind: "example", text };
  if (label.includes("case fact") || label.includes("case"))
    return { kind: "case_fact", text };
  return { kind: "source", text };
}

function parseClaim(block: string, headingPrefix: string): ParsedClaim {
  const titleMatch = block.match(
    new RegExp(`##\\s+${headingPrefix}[^:]*:\\s*([\\s\\S]+?)\\n`, "i"),
  );
  // When called with just the section body, title is passed separately.
  const titleLine = block.match(/^([^\n]+)/)?.[1]?.trim() ?? "";
  const title =
    titleMatch?.[1]?.trim() ??
    titleLine.replace(/^Claim\s+\d+:\s*/i, "").trim();

  const logic =
    block.match(/\*\*Logic line:\*\*\s*([\s\S]*?)(?=\n\*\*S\d|\n\*\*Ethical)/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? "";

  const supports: ParsedSupport[] = [];
  const supportRe =
    /\*\*(S\d)\.\s*([^*]+)\*\*\s*([\s\S]*?)(?=\n\*\*S\d|\n\*\*Ethical|\n\*\*We concede|$)/gi;
  let sm: RegExpExecArray | null;
  while ((sm = supportRe.exec(block)) !== null) {
    const label = sm[1]!;
    const title = sm[2]!.trim().replace(/\.$/, "");
    const rawBody = sm[3]!.trim();
    const lines = rawBody.split("\n").map((l) => l.trim()).filter(Boolean);
    const backingLine = lines.find((l) => /^\*Backing/i.test(l)) ?? "";
    const body = lines
      .filter((l) => !/^\*Backing/i.test(l))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const text = body ? `${title}. ${body}` : title;
    supports.push({
      label,
      title,
      body,
      text,
      backing: parseBacking(backingLine || `*Backing (source):* ${text}`),
    });
  }

  const ethical =
    block
      .match(/\*\*Ethical analysis\.\*\*\s*([\s\S]*?)(?=\n\*\*We concede|$)/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? "";
  const concede =
    block
      .match(/\*\*We concede:\*\*\s*([\s\S]*?)(?=\n##|$)/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? "";

  return {
    title: title || headFromFirstLine(block),
    logicLine: logic,
    supports: supports.slice(0, 3),
    ethicalAnalysis: ethical,
    concede,
  };
}

function headFromFirstLine(block: string): string {
  return block.split("\n")[0]?.trim() ?? "";
}

function cleanSeedText(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    // Unwrap short emphasis quotes so quality checks don't see orphans.
    .replace(/"([^"]{1,60})"/g, "$1")
    .replace(/“([^”]{1,60})”/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^["“]+|["”]+$/g, "")
    .replace(/\s*\(post h$/i, "")
    .trim();
}

function parseCounterclaimTitle(part: string): string {
  const firstLine = (part.split("\n")[0] ?? "").trim();
  const quoted = firstLine.match(/^["“]([^"“”]+)["”]/);
  if (quoted) return cleanSeedText(quoted[1]!);
  return cleanSeedText(firstLine.replace(/\*\*\s*$/, ""));
}

function parseCounterclaims(block: string): ParsedCounterclaim[] {
  const parts = block.split(/\*\*Counterclaim:\s*/i).slice(1);
  return parts.map((part) => {
    const text = parseCounterclaimTitle(part);
    const their =
      part
        .match(/\*Their supports:\*\s*([\s\S]*?)(?=\n\*Our response|$)/i)?.[1]
        ?.replace(/\s+/g, " ")
        .trim() ?? "";
    const response =
      part
        .match(
          /\*Our response(?:\s*\([^)]*\))?:\*\s*([\s\S]*?)(?=\n\*\*Counterclaim|\n##|$)/i,
        )?.[1]
        ?.trim() ?? "";

    const concedeM = response.match(
      /\*\*Concede\*\*[^(]*\(([^)]+)\):\s*([\s\S]+?)(?=\s*\*\*(?:Distinguish|Rebut)\b|$)/i,
    );
    const distinguishM = response.match(
      /\*\*Distinguish\*\*[^(]*\(([^)]+)\):\s*([\s\S]+?)(?=\s*\*\*(?:Concede|Rebut)\b|$)/i,
    );
    const distinguishPlain = response.match(
      /\*\*Distinguish:\*\*\s*([\s\S]+?)(?=\s*\*\*(?:Concede|Rebut)\b|$)/i,
    );
    const rebutM = response.match(
      /\*\*Rebut\*\*[^(]*\(([^)]+)\):\s*([\s\S]+?)$/i,
    );
    const rebutPlain = response.match(/\*\*Rebut\*\*[^:]*:\s*([\s\S]+?)$/i);

    const concede = concedeM
      ? `(${concedeM[1]}) ${concedeM[2]}`
      : "";
    const distinguish = distinguishM
      ? `(${distinguishM[1]}) ${distinguishM[2]}`
      : distinguishPlain?.[1] ?? "";
    const rebutRaw = rebutM?.[2] ?? rebutPlain?.[1] ?? "";
    const rebut =
      !concede && !distinguish && !rebutRaw ? response : rebutRaw;

    return {
      text,
      theirSupports: cleanSeedText(their),
      concede: cleanSeedText(concede) || "See response.",
      distinguish: cleanSeedText(distinguish) || "See response.",
      rebut: cleanSeedText(rebut) || cleanSeedText(response),
    };
  });
}

function parseQATable(block: string): ParsedQA[] {
  const rows = parseTable(block);
  // skip header
  return rows.slice(1).map((r) => ({
    question: r[0] ?? "",
    answer: r[1] ?? "",
  })).filter((q) => q.question);
}

export function parseCaseMarkdown(md: string): ParsedCase {
  const header =
    md.match(/#\s+Case\s+(\d+):\s*(.+?)(?:\s*\(detailed review\))?\s*$/im) ??
    md.match(/#\s+Case\s+(\d+):\s*(.+)/i);
  const number = Number(header?.[1] ?? 0);
  const titleFromDoc = (header?.[2] ?? "").trim();

  const glance = section(md, "1. The case at a glance");
  const factRows = parseTable(glance).slice(1);
  const facts = factRows.map((r) => ({
    fact: r[0] ?? "",
    source: r[1] ?? "Case text",
  })).filter((f) => f.fact);

  const cts = section(md, "2. Crux, trap and stakeholders");
  const crux = boldField(cts, "Crux");
  const trap = boldField(cts, "The trap");
  const stakeRows = parseTable(cts).slice(1);
  const stakeholders = stakeRows.map((r) => ({
    who: r[0] ?? "",
    stake: r[1] ?? "",
    voice: r[2] ?? "",
  })).filter((s) => s.who);

  const mod = section(md, "3. Moderator questions and our answer");
  const moderatorQuestions = parseQATable(mod);
  const thesis =
    mod
      .match(/\*\*Our thesis:\*\*\s*([\s\S]*?)(?=\n##|$)/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? "";

  const claim1Raw =
    md.match(/##\s+4\.\s+Claim 1:\s*([^\n]+)\n([\s\S]*?)(?=\n##\s+5\.)/i) ??
    null;
  const claim2Raw =
    md.match(/##\s+5\.\s+Claim 2:\s*([^\n]+)\n([\s\S]*?)(?=\n##\s+6\.)/i) ??
    null;

  const claim1 = parseClaim(
    claim1Raw ? `${claim1Raw[1]}\n${claim1Raw[2]}` : "",
    "4",
  );
  if (claim1Raw?.[1]) claim1.title = claim1Raw[1].trim();

  const claim2 = parseClaim(
    claim2Raw ? `${claim2Raw[1]}\n${claim2Raw[2]}` : "",
    "5",
  );
  if (claim2Raw?.[1]) claim2.title = claim2Raw[1].trim();

  const ccBody = section(md, "6. Counterclaims and our responses");
  const counterclaims = parseCounterclaims(ccBody);

  const judgeBody = section(md, "8. Judge question bank");
  const judgeQuestions = parseQATable(judgeBody);

  const kitBody = section(md, "9. Commentary kit");
  const commentaryKit = kitBody
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);

  return {
    number,
    titleFromDoc,
    facts,
    crux,
    trap,
    stakeholders,
    moderatorQuestions,
    thesis,
    claim1,
    claim2,
    counterclaims,
    judgeQuestions,
    commentaryKit,
  };
}
