"use client";

import { useRouter } from "next/navigation";
import { LearningProfileForm } from "@/components/learning-profile-form";

/**
 * First-run learning profile, right after voice enrollment / consent.
 */
export default function LearningProfilePage() {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-10 sm:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
        Step 3 of 4
      </p>
      <p className="text-xs text-muted">First time only</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-ink sm:text-4xl">
        How Cruxy should help you
      </h1>
      <p className="mt-2 text-sm text-muted">
        Four concrete choices. About 30 seconds. Your starting scoring level
        comes from your first real judge card, not a self-rating.
      </p>
      <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-4 sm:p-5">
        <LearningProfileForm
          firstRun
          onSaved={() => {
            void fetch("/api/auth/me")
              .then((r) => r.json())
              .then(
                (d: {
                  session?: { mustChoosePasscode?: boolean };
                }) => {
                  if (d.session?.mustChoosePasscode) {
                    router.push("/choose-passcode");
                  } else {
                    router.push("/today");
                  }
                },
              )
              .catch(() => router.push("/choose-passcode"));
          }}
        />
      </div>
    </main>
  );
}
