"use client";

import type { PublicPerson } from "@/lib/db/repository";
import type { Team } from "@/lib/types";
import { cn } from "@/lib/utils";

export function NamePicker({
  teams,
  people,
  selectedId,
  onSelect,
}: {
  teams: Team[];
  people: PublicPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const coach = people.filter((p) => p.role === "coach_admin");
  const byTeam = teams.map((t) => ({
    team: t,
    members: people.filter((p) => p.team_id === t.id),
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-3">
        {byTeam.map(({ team, members }) => (
          <div key={team.id} className="animate-fade-up">
            <p
              className="mb-2 flex items-center gap-2 border-b-[3px] pb-1.5 text-[13px] font-bold text-ink"
              style={{ borderColor: team.colour }}
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-ink/20"
                style={{ backgroundColor: team.colour }}
              />
              <span>{team.name}</span>
            </p>
            <ul className="space-y-1.5">
              {members.map((m) => {
                const active = selectedId === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(m.id)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2.5 text-left text-sm transition",
                        active
                          ? "border-ink bg-ink font-semibold text-white"
                          : "border-mist bg-white text-ink hover:border-ink/20",
                      )}
                    >
                      {m.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {coach.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Coach
          </p>
          <div className="flex flex-wrap gap-2">
            {coach.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={selectedId === m.id}
                onClick={() => onSelect(m.id)}
                className={cn(
                  "rounded-xl border px-4 py-2.5 text-sm transition",
                  selectedId === m.id
                    ? "border-ink bg-ink font-semibold text-white"
                    : "border-mist bg-white text-ink",
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
