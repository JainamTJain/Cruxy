/**
 * Opposing positions from a case's prep: one per commentary-kit line
 * ("If they argue X: our answer"), each paired with the counterclaim that
 * best matches it, so no two positions repeat the same support.
 * Pure; used by the seed and to repair rows seeded before this existed.
 */
export type PrepForOpposing = {
  commentaryKit: string[];
  counterclaims: Array<{
    text: string;
    theirSupports?: string | null;
    rebut?: string | null;
  }>;
};

export type DerivedOpposing = {
  title: string;
  strongest_support: string;
  weak_point: string;
  commentary_angles: [string, string];
};

function words(s: string): Set<string> {
  return new Set(
    s.toLowerCase().match(/[a-z][a-z'-]{3,}/g)?.filter((w) => !/^(that|this|they|their|with|from|only|what|would|should|because)$/.test(w)) ?? [],
  );
}

export function opposingFromPrep(p: PrepForOpposing): DerivedOpposing[] {
  const used = new Set<number>();
  const shown = new Set<string>();
  return p.commentaryKit.map((line, i) => {
    const m = line.match(/^If they\s+(.+?):\s*(.+)$/i);
    const title = m ? `They ${m[1]!.trim()}` : line.trim();
    const angle = (m?.[2] ?? line).trim();
    const want = words(`${title} ${angle}`);
    let best = -1;
    let bestScore = -1;
    p.counterclaims.forEach((cc, j) => {
      let score = 0;
      for (const w of words(`${cc.text} ${cc.theirSupports ?? ""}`)) if (want.has(w)) score += 1;
      if (used.has(j)) score -= 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    });
    if (best < 0 && p.counterclaims.length) best = i % p.counterclaims.length;
    if (best >= 0) used.add(best);
    const cc = best >= 0 ? p.counterclaims[best] : undefined;
    // Never show the same support twice: fall back to the counterclaim's own
    // wording, then to any other counterclaim not shown yet.
    const options = [
      cc?.theirSupports?.trim(),
      cc?.text?.trim(),
      ...p.counterclaims.flatMap((c) => [c.text?.trim(), c.theirSupports?.trim()]),
    ].filter((x): x is string => Boolean(x));
    const strongest =
      options.find((x) => !shown.has(x)) ??
      options[0] ??
      "Their strongest reading of the case facts.";
    shown.add(strongest);
    return {
      title,
      strongest_support: strongest,
      weak_point: angle,
      commentary_angles: [angle, cc?.rebut?.trim() || "Ask what their principle would require in a flipped case."],
    };
  });
}
