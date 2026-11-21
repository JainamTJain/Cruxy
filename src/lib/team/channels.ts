/** Chat channel naming helpers */

export function teamChannel(teamId: string) {
  return `team:${teamId}`;
}

export function programChannel() {
  return "program:all";
}

export function parseTeamChannel(channel: string): string | null {
  if (!channel.startsWith("team:")) return null;
  return channel.slice("team:".length) || null;
}
