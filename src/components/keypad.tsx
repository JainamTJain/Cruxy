"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function Keypad({
  onSubmit,
  disabled,
  footer,
  onDigitsChange,
}: {
  onSubmit: (code: string) => void | Promise<void>;
  disabled?: boolean;
  footer?: React.ReactNode;
  onDigitsChange?: (digits: string) => void;
}) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);

  function set(next: string) {
    setDigits(next);
    onDigitsChange?.(next);
  }

  function press(d: string) {
    if (disabled || busy) return;
    setPressed(d);
    setTimeout(() => setPressed(null), 120);
    set(digits.length >= 6 ? digits : digits + d);
  }

  function clear() {
    set("");
  }

  function backspace() {
    set(digits.slice(0, -1));
  }

  async function enter() {
    if (digits.length !== 6 || busy || disabled) return;
    setBusy(true);
    try {
      await onSubmit(digits);
    } finally {
      setBusy(false);
      set("");
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Enter"];

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-4 flex justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-3 rounded-full border border-ink/30",
              i < digits.length ? "bg-ink" : "bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => {
          const isClear = k === "Clear";
          const isEnter = k === "Enter";
          return (
            <button
              key={k}
              type="button"
              disabled={disabled || busy || (isEnter && digits.length !== 6)}
              className={cn(
                "h-[60px] rounded-[14px] border border-mist bg-[#F7F8FA] text-[22px] font-semibold text-ink disabled:opacity-40",
                pressed === k && "animate-press",
                isEnter && "bg-cardinal text-white border-cardinal",
                isClear && "text-sm font-semibold",
              )}
              onClick={() => {
                if (isClear) clear();
                else if (isEnter) void enter();
                else press(k);
              }}
              onContextMenu={(e) => {
                if (isClear) {
                  e.preventDefault();
                  backspace();
                }
              }}
            >
              {k}
            </button>
          );
        })}
      </div>
      {footer ? (
        <div className="mt-4 text-center text-sm text-muted">{footer}</div>
      ) : null}
    </div>
  );
}
