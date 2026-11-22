"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCruxy, type CruxyMood } from "@/components/cruxy/cruxy-context";
import {
  emitMood,
  subscribeMood,
  type MoodBusEvent,
} from "@/components/cruxy/mood/bus";
import {
  poseSrc,
  preloadCruxyPoses,
  type CruxyPose,
} from "@/components/cruxy/mood/poses";

function toContextMood(pose: CruxyPose): CruxyMood {
  if (pose === "thinking") return "neutral";
  return pose;
}

/**
 * Wave 7 G: context expressions for the floating Genie and drawer.
 * Maps bus events onto the 10 poses and writes through the existing Cruxy context.
 */
export function useCruxyMood() {
  const { mood, setMood, setBubble, emitCruxyEvent } = useCruxy();
  const holdTimer = useRef<number | null>(null);

  useEffect(() => {
    preloadCruxyPoses();
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const applyPose = useCallback(
    (pose: CruxyPose, holdMs: number, bubble?: string | null) => {
      setMood(toContextMood(pose));
      if (bubble !== undefined && bubble !== null) setBubble(bubble);
      clearHold();
      if (holdMs > 0 && pose !== "sleepy" && pose !== "thinking") {
        holdTimer.current = window.setTimeout(() => {
          setMood("curious");
        }, holdMs);
      }
    },
    [setMood, setBubble, clearHold],
  );

  useEffect(() => {
    return subscribeMood((_event, mapped) => {
      applyPose(mapped.pose, mapped.holdMs, mapped.bubble);
    });
  }, [applyPose]);

  const emit = useCallback((event: MoodBusEvent) => {
    return emitMood(event);
  }, []);

  return {
    mood: mood as CruxyPose,
    poseSrc: poseSrc(mood),
    srcFor: poseSrc,
    emit,
    applyPose,
    /** Keep legacy event names working beside the Wave 7 bus. */
    emitLegacy: emitCruxyEvent,
  };
}
