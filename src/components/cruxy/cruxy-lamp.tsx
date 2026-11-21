"use client";

import Image from "next/image";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import { cn } from "@/lib/utils";

export function CruxyLamp() {
  const { awake, wake, sleep, lampMotion } = useCruxy();

  return (
    <div className="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-1 sm:bottom-4 sm:right-5">
      {!awake && lampMotion !== "pop" ? (
        <span
          aria-hidden
          className="font-display mr-8 text-[22px] font-extrabold tracking-wide text-genie"
        >
          z z
        </span>
      ) : null}
      <button
        id="cruxy-lamp"
        type="button"
        aria-label={awake ? "Send Cruxy to the lamp" : "Call Cruxy"}
        title={awake ? "Tap to send Cruxy to sleep" : "Tap to call Cruxy"}
        onClick={() => {
          if (awake) sleep();
          else wake();
        }}
        className="relative flex w-[120px] flex-col items-center border-0 bg-transparent p-0"
      >
        {lampMotion === "swirl" ? (
          <span
            aria-hidden
            className="animate-lamp-swirl pointer-events-none absolute left-1/2 top-0 h-10 w-10 -translate-x-1/2 rounded-full bg-genie/40 blur-[2px]"
          />
        ) : null}
        {lampMotion === "pop" ? (
          <span
            aria-hidden
            className="animate-lamp-pop pointer-events-none absolute left-1/2 top-0 h-12 w-12 -translate-x-1/2"
          >
            <Image
              src="/cruxy/cruxy-curious.png"
              alt=""
              width={48}
              height={96}
              className="h-auto w-full"
              unoptimized
            />
          </span>
        ) : null}
        <Image
          src="/cruxy/cruxy-lamp.png"
          alt=""
          width={120}
          height={88}
          className={cn(
            "h-auto w-[120px] drop-shadow-[0_6px_10px_rgba(17,19,24,0.25)]",
            lampMotion === "pop" && "scale-105 transition-transform",
          )}
          unoptimized
        />
        <span className="mt-1 text-[11px] font-medium text-muted">
          {awake ? "Cruxy's lamp" : "Cruxy is resting. Tap to call."}
        </span>
      </button>
    </div>
  );
}
