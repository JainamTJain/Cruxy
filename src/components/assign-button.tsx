"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AssignmentTargetKind } from "@/lib/team/types";

type PersonOpt = { id: string; name: string };

export function AssignButton(props: {
  teamId: string;
  caseId?: string | null;
  targetKind: AssignmentTargetKind;
  targetId?: string | null;
  people: PersonOpt[];
  defaultTask?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [task, setTask] = useState(props.defaultTask ?? "");
  const [due, setDue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    const res = await fetch("/api/team/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId: props.teamId,
        caseId: props.caseId ?? null,
        personIds: selected,
        task: task || "Assigned work",
        targetKind: props.targetKind,
        targetId: props.targetId ?? null,
        due: due || null,
      }),
    });
    if (res.ok) {
      setMsg("Assigned.");
      setOpen(false);
      setStep(1);
      setSelected([]);
    } else {
      setMsg("Could not assign.");
    }
  }

  if (!open) {
    return (
      <div>
        <Button
          variant="secondary"
          className="text-xs"
          onClick={() => setOpen(true)}
        >
          Assign
        </Button>
        {msg ? <p className="mt-1 text-xs text-muted">{msg}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/90 p-3 text-sm shadow-sm">
      <p className="font-medium">
        Assign, tap {step === 1 ? "1 of 2" : "2 of 2"}
      </p>
      {step === 1 ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted">Pick people</p>
          <div className="flex flex-wrap gap-2">
            {props.people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={
                  selected.includes(p.id)
                    ? "rounded-lg bg-ink px-2 py-1 text-xs text-white"
                    : "rounded-lg border border-ink/15 px-2 py-1 text-xs"
                }
              >
                {p.name}
              </button>
            ))}
          </div>
          <Button
            disabled={!selected.length}
            onClick={() => setStep(2)}
            className="mt-2"
          >
            Next
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block text-xs">
            Task / role
            <input
              className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1"
              value={task}
              onChange={(e) => setTask(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            Due (optional)
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => void save()}>Confirm assign</Button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="mt-2 text-xs text-muted underline"
        onClick={() => {
          setOpen(false);
          setStep(1);
        }}
      >
        Cancel
      </button>
    </div>
  );
}
