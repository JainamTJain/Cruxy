/** Chat channel naming helpers */

export function teamChannel(teamId: string) {
  return `team:${teamId}`;
}

export function programChannel() {
  return "program:all";
}

/** Whole-team channel (same as teamChannel). */
export function wholeTeamChannel(teamId: string) {
  return teamChannel(teamId);
}

export function caseChatChannel(teamId: string, caseId: string) {
  return `team:${teamId}:case:${caseId}`;
}

export function leadsChannel(teamId: string) {
  return `team:${teamId}:leads`;
}

export function parseTeamChannel(channel: string): string | null {
  if (!channel.startsWith("team:")) return null;
  const rest = channel.slice("team:".length);
  if (!rest) return null;
  // team:{id} or team:{id}:case:{caseId} or team:{id}:leads
  const caseIdx = rest.indexOf(":case:");
  if (caseIdx >= 0) return rest.slice(0, caseIdx);
  const leadsIdx = rest.indexOf(":leads");
  if (leadsIdx >= 0) return rest.slice(0, leadsIdx);
  return rest;
}

export function parseCaseChatChannel(
  channel: string,
): { teamId: string; caseId: string } | null {
  if (!channel.startsWith("team:")) return null;
  const rest = channel.slice("team:".length);
  const marker = ":case:";
  const i = rest.indexOf(marker);
  if (i < 0) return null;
  const teamId = rest.slice(0, i);
  const caseId = rest.slice(i + marker.length);
  if (!teamId || !caseId) return null;
  return { teamId, caseId };
}

export function isLeadsChannel(channel: string): boolean {
  return channel.startsWith("team:") && channel.endsWith(":leads");
}

export type ConversationMeta = {
  title: string;
  purpose: string;
  audience: string;
  kind: "program" | "whole_team" | "case" | "leads" | "other";
  caseId: string | null;
};

export function conversationMeta(input: {
  channel: string;
  caseNumber?: number | null;
  caseTitle?: string | null;
}): ConversationMeta {
  if (input.channel === programChannel()) {
    return {
      title: "All program",
      purpose: "Notes for every USC Ethics Bowl team.",
      audience: "Everyone in the program can see this.",
      kind: "program",
      caseId: null,
    };
  }
  const caseParsed = parseCaseChatChannel(input.channel);
  if (caseParsed) {
    const n = input.caseNumber;
    const title =
      n != null && input.caseTitle
        ? `Case ${n}: ${input.caseTitle}`
        : "Case conversation";
    return {
      title,
      purpose: "Work this case together: claims, sources, and prep notes.",
      audience: "Your whole team can see this.",
      kind: "case",
      caseId: caseParsed.caseId,
    };
  }
  if (isLeadsChannel(input.channel)) {
    return {
      title: "Leads only",
      purpose: "Lead planning that stays with case leads.",
      audience: "Case leads on your team can see this.",
      kind: "leads",
      caseId: null,
    };
  }
  if (input.channel.startsWith("team:")) {
    return {
      title: "Whole team",
      purpose: "Day to day notes for everyone on your team.",
      audience: "Your whole team can see this.",
      kind: "whole_team",
      caseId: null,
    };
  }
  return {
    title: "Conversation",
    purpose: "Team chat",
    audience: "Team members can see this.",
    kind: "other",
    caseId: null,
  };
}
