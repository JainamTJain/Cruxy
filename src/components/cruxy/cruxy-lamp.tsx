"use client";

import Image from "next/image";
import { useCruxy } from "@/components/cruxy/cruxy-context";

export function CruxyLamp() {
  const { awake, wake, sleep } = useCruxy();

  return (
    <div className="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-1 sm:bottom-4 sm:right-5">
      {!awake ? (
        <span
          aria-hidden
          className="font-display mr-8 text-[22px] font-extrabold tracking-wide text-[#1E3A9E]"
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
        className="flex w-[120px] flex-col items-center border-0 bg-transparent p-0"
      >
        <Image
          src="/cruxy/cruxy-lamp.png"
          alt=""
          width={120}
          height={88}
          className="h-auto w-[120px] drop-shadow-[0_6px_10px_rgba(17,19,24,0.25)]"
          unoptimized
        />
        <span className="mt-1 text-[11px] font-medium text-muted">
          {awake ? "Cruxy's lamp" : "Tap to call"}
        </span>
      </button>
    </div>
  );
}
