"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keypad } from "@/components/keypad";
import { NamePicker } from "@/components/name-picker";
import type { PublicPerson } from "@/lib/db/repository";
import type { Team } from "@/lib/types";

export default function SignInPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<PublicPerson[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"name" | "code">("name");

  useEffect(() => {
    void fetch("/api/auth/people")
      .then((r) => r.json())
      .then((d: { teams: Team[]; people: PublicPerson[] }) => {
        setTeams(d.teams);
        setPeople(d.people);
      });
  }, []);

  const selected = people.find((p) => p.id === selectedId);

  async function submitCode(code: string) {
    if (!selectedId) return;
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-8 sm:py-12">
      <header className="mb-8 animate-fade-up">
        <p className="font-display text-4xl font-semibold tracking-tight text-cardinal sm:text-5xl">
          crux
        </p>
        <p className="mt-3 max-w-md text-sm text-muted sm:text-base">
          Three teams, twelve cases, one place where every argument is built,
          tested and backed by a source.
        </p>
      </header>

      {step === "name" ? (
        <section className="animate-fade-up">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Tap your name
          </h1>
          <p className="mt-1 text-sm text-muted">Step 1 of 3</p>
          <div className="mt-6">
            <NamePicker
              teams={teams}
              people={people}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          <div className="mt-8">
            <button
              type="button"
              disabled={!selectedId}
              onClick={() => setStep("code")}
              className="rounded-xl bg-cardinal px-5 py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Continue{selected ? ` as ${selected.name}` : ""}
            </button>
          </div>
        </section>
      ) : (
        <section className="animate-fade-up">
          <button
            type="button"
            className="mb-4 text-sm text-muted underline"
            onClick={() => {
              setStep("name");
              setError(null);
            }}
          >
            ← {selected?.name ?? "Back"}
          </button>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Passcode
          </h1>
          <p className="mt-1 text-sm text-muted">
            First time? Use the member code Jainam gave you. After that, your
            own passcode.
          </p>
          <div className="mt-8">
            <Keypad
              onSubmit={submitCode}
              footer={
                <>
                  Forgot your passcode? Ask Jainam.
                  {error ? (
                    <span className="mt-2 block text-cardinal">{error}</span>
                  ) : null}
                </>
              }
            />
          </div>
        </section>
      )}
    </main>
  );
}
