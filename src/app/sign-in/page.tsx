"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CruxWordmark } from "@/components/crux-wordmark";
import { Keypad } from "@/components/keypad";
import { NamePicker } from "@/components/name-picker";
import { CountUp } from "@/components/motion/count-up";
import { preloadCruxyPoses } from "@/components/cruxy/mood/poses";
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
    preloadCruxyPoses();
  }, []);

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
    [totals?.drive_files ?? "…", "Drive files read and cited"],
    [totals?.ideas_accepted ?? "…", "ideas accepted into Evidence Library"],
    [totals?.bank_questions ?? "…", "moderator questions in the bank"],
    [totals?.rounds_graded ?? "…", "practice rounds graded"],
    [totals?.sources_verified ?? "…", "new sources verified"],
    [days ?? "…", "days to the regional"],
  ] as const;

  return (
    <main className="flex min-h-dvh flex-col bg-paper lg:flex-row">
      <section className="flex flex-1 flex-col gap-8 bg-cardinal px-6 py-8 text-white sm:gap-10 sm:px-12 sm:py-12 lg:justify-between">
        <header className="relative z-20 flex shrink-0 items-center justify-between gap-4 bg-cardinal text-[13px] font-semibold tracking-[0.08em]">
          <span className="min-w-0">USC ETHICS BOWL</span>
          <span className="shrink-0 text-right">
            California Regional
            <br />
            Dec 5
          </span>
        </header>

        {/* Hero stays below the label at every width; Genie is clipped to its stack. */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center">
          <div className="flex flex-col items-start gap-5 min-[520px]:flex-row min-[520px]:items-end min-[520px]:gap-6">
            <div className="relative h-[220px] w-[120px] shrink-0 [clip-path:inset(-80px_-80px_0_-80px)] sm:h-[260px] sm:w-[140px]">
              <Image
                src="/cruxy/cruxy-lamp.png"
                alt=""
                width={327}
                height={235}
                className="absolute bottom-0 left-1/2 w-[100px] -translate-x-1/2 drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)] sm:w-[120px]"
                unoptimized
                priority
              />
              <Image
                src="/cruxy/cruxy-curious.png"
                alt="Cruxy rising from the lamp"
                width={273}
                height={557}
                className="animate-genie-rise absolute bottom-[40px] left-1/2 w-[88px] -translate-x-1/2 drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)] sm:bottom-[46px] sm:w-[105px]"
                unoptimized
                priority
              />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <CruxWordmark
                as="h1"
                className="inline-block max-w-full pb-2 pr-3 text-[clamp(3.5rem,12vw,8rem)]"
              />
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/90">
                Three teams, twelve cases, one place where every argument is
                built, tested and backed by a source.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 shrink-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/70">
            Built so far
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {built.map(([n, label]) => (
              <div key={label}>
                <p className="font-display text-3xl font-extrabold tabular-nums">
                  {typeof n === "number" ? <CountUp value={n} /> : n}
                </p>
                <p className="text-xs text-white/75">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-1 flex-col px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-xl rounded-[20px] border-2 border-genie/25 bg-white p-6 sm:p-8">
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
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[15px] font-semibold">Passcode</p>
              <p className="text-xs text-muted">
                First time? Use the starter code Jainam gave you.
              </p>
            </div>
            <Keypad
              onSubmit={submitCode}
              disabled={!selectedId}
              footer={
                <>
                  After that, your own passcode. Forgot your passcode? Ask
                  Jainam.
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
