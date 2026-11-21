"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keypad } from "@/components/keypad";
import { NamePicker } from "@/components/name-picker";
import type { PublicPerson } from "@/lib/db/repository";
import type { Team } from "@/lib/types";

type Totals = {
  drive_files: number;
  ideas_accepted: number;
  bank_questions: number;
  rounds_graded: number;
  sources_verified: number;
};

export default function SignInPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<PublicPerson[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/people")
      .then((r) => r.json())
      .then(
        (d: {
          teams: Team[];
          people: PublicPerson[];
          totals?: Totals;
          daysToCompetition?: number | null;
        }) => {
          setTeams(d.teams);
          setPeople(d.people);
          setTotals(d.totals ?? null);
          setDays(d.daysToCompetition ?? null);
        },
      );
  }, []);

  async function submitCode(code: string) {
    if (!selectedId) {
      setError("Tap your name first.");
      return;
    }
    setError(null);
    const res = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId: selectedId, code }),
    });
    const data = (await res.json()) as {
      error?: string;
      mustConsent?: boolean;
      mustChoosePasscode?: boolean;
    };
    if (!res.ok) {
      setError(data.error ?? "Sign in failed.");
      return;
    }
    if (data.mustConsent) router.push("/consent");
    else if (data.mustChoosePasscode) router.push("/choose-passcode");
    else router.push("/home");
  }

  const built = [
    [totals?.drive_files ?? "—", "Drive files read and cited"],
    [totals?.ideas_accepted ?? "—", "ideas accepted into Truth Sources"],
    [totals?.bank_questions ?? "—", "moderator questions in the bank"],
    [totals?.rounds_graded ?? "—", "practice rounds graded"],
    [totals?.sources_verified ?? "—", "new sources verified"],
    [days ?? "—", "days to the regional"],
  ] as const;

  return (
    <main className="flex min-h-dvh flex-col bg-paper lg:flex-row">
      <section className="flex flex-1 flex-col justify-between gap-10 bg-cardinal px-8 py-10 text-white sm:px-12 sm:py-12">
        <div className="flex items-center justify-between text-[13px] font-semibold tracking-[0.08em]">
          <span>USC ETHICS BOWL</span>
          <span>CALIFORNIA REGIONAL · DEC 5</span>
        </div>
        <div>
          <h1 className="font-display text-[clamp(5.5rem,18vw,11.75rem)] font-extrabold leading-[0.82] tracking-[-0.05em] sm:text-[188px]">
            crux
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/90">
            Three teams, twelve cases, one place where every argument is built,
            tested and backed by a source.
          </p>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/70">
            Built so far · sample data
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {built.map(([n, label]) => (
              <div key={label}>
                <p className="font-display text-3xl font-extrabold tabular-nums">
                  {n}
                </p>
                <p className="text-xs text-white/75">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-1 flex-col px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Step 1 of 3
          </p>
          <h2 className="mt-2 font-display text-[40px] font-extrabold leading-none tracking-[-0.02em] text-ink">
            Tap your name
          </h2>
          <div className="mt-6">
            <NamePicker
              teams={teams}
              people={people}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setError(null);
              }}
            />
          </div>

          <div className="mt-8 border-t border-mist pt-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[15px] font-semibold">Passcode</p>
              <p className="text-xs text-muted">
                First time? Use the member code Jainam gave you.
              </p>
            </div>
            <Keypad
              onSubmit={submitCode}
              disabled={!selectedId}
              footer={
                <>
                  After that, your own passcode. Forgot it? Ask Jainam.
                  {error ? (
                    <span className="mt-2 block text-cardinal">{error}</span>
                  ) : null}
                </>
              }
            />
          </div>
        </div>
      </section>
    </main>
  );
}
