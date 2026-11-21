"use client";

import Image from "next/image";
import { useCruxy } from "@/components/cruxy/cruxy-context";

export function CruxyLamp() {
  const { awake, wake, sleep } = useCruxy();

  return (
    <button
      id="cruxy-lamp"
      type="button"
      aria-label={awake ? "Send Cruxy to the lamp" : "Call Cruxy"}
      title={awake ? "Tap to send Cruxy to sleep" : "Tap to call Cruxy"}
      onClick={() => {
        if (awake) sleep();
        else wake();
      }}
      className="fixed bottom-20 right-4 z-30 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-ink text-gold shadow-lg sm:bottom-6"
    >
      <Image
        src="/cruxy/cruxy-lamp.png"
        alt=""
        width={36}
        height={36}
        unoptimized
      />
      {!awake ? (
        <span className="absolute -top-1 text-[10px] tracking-widest text-gold/90">
          z z
        </span>
      ) : null}
    </button>
  );
}
