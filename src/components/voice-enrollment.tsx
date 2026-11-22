"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  VOICE_ENROLLMENT_PASSAGES,
  VOICED_TARGET_SECONDS,
  wordsOf,
} from "@/lib/auth/voice-passages";
import {
  analyseTimeDomain,
  getSpeechRecognitionCtor,
  pickRecorderMime,
  releaseStream,
  type QualityFlag,
  type SpeechRecognitionEventLike,
} from "@/lib/auth/voice-vad";

type Phase = "idle" | "recording" | "paused" | "stopped" | "review";

type Props = {
  onDone: (blob: Blob) => void | Promise<void>;
  onCancelTextOnly: () => void | Promise<void>;
  busy?: boolean;
};

function formatSeconds(n: number): string {
  const s = Math.max(0, Math.floor(n));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${r.toString().padStart(2, "0")}` : `${r}s`;
}

function qualityMessage(q: QualityFlag): string | null {
  if (q === "quiet") return "Too quiet. Move closer to the mic.";
  if (q === "clipping") return "Too loud. Move back a little.";
  if (q === "background") return "Loud background. Find a quieter spot.";
  return null;
}

/**
 * Guided voice enrollment for /consent.
 * Counts voiced frames (not wall time) until VOICED_TARGET_SECONDS,
 * with read-along when SpeechRecognition is available.
 */
export function VoiceEnrollment({ onDone, onCancelTextOnly, busy }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [passageIndex, setPassageIndex] = useState(0);
  const [matchedWords, setMatchedWords] = useState(0);
  const [voicedSeconds, setVoicedSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [quality, setQuality] = useState<QualityFlag>("ok");
  const [hasSpeechRec, setHasSpeechRec] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeExt, setMimeExt] = useState("webm");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const goodChunksRef = useRef<Blob[]>([]);
  const voicedMsRef = useRef(0);
  const elapsedMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const noiseFloorRef = useRef(0.01);
  const badStreakRef = useRef(0);
  const recogRef = useRef<{
    start: () => void;
    stop: () => void;
    onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    onend: (() => void) | null;
  } | null>(null);
  const wantRecogRef = useRef(false);
  const passageIndexRef = useRef(0);
  const matchedRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  const passage = VOICE_ENROLLMENT_PASSAGES[passageIndex]!;
  const passageWords = useMemo(() => wordsOf(passage.text), [passage.text]);
  /** Original text pieces with word indices for read-along highlight. */
  const passagePieces = useMemo(() => {
    const pieces: { text: string; wordIndex: number | null }[] = [];
    let wordIndex = 0;
    for (const piece of passage.text.split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) {
        pieces.push({ text: piece, wordIndex: null });
        continue;
      }
      const token = wordsOf(piece)[0];
      if (token) {
        pieces.push({ text: piece, wordIndex });
        wordIndex += 1;
      } else {
        pieces.push({ text: piece, wordIndex: null });
      }
    }
    return pieces;
  }, [passage.text]);
  const enough = voicedSeconds >= VOICED_TARGET_SECONDS;
  const passageProgress =
    passageWords.length > 0 ? matchedWords / passageWords.length : 0;

  useEffect(() => {
    passageIndexRef.current = passageIndex;
  }, [passageIndex]);
  useEffect(() => {
    matchedRef.current = matchedWords;
  }, [matchedWords]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    setHasSpeechRec(Boolean(getSpeechRecognitionCtor()));
    return () => {
      teardownAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAnalyserLoop() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTickRef.current = null;
  }

  function stopRecognition() {
    wantRecogRef.current = false;
    const r = recogRef.current;
    recogRef.current = null;
    if (!r) return;
    try {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      r.stop();
    } catch {
      /* ignore */
    }
  }

  function releaseMic() {
    stopAnalyserLoop();
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    releaseStream(streamRef.current);
    streamRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (ctx) {
      void ctx.close().catch(() => undefined);
    }
  }

  function teardownAll() {
    stopRecognition();
    releaseMic();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }

  function advancePassageIfNeeded(nextMatched: number) {
    const words = wordsOf(
      VOICE_ENROLLMENT_PASSAGES[passageIndexRef.current]?.text ?? "",
    );
    if (nextMatched >= words.length && words.length > 0) {
      const next = passageIndexRef.current + 1;
      if (next < VOICE_ENROLLMENT_PASSAGES.length) {
        setPassageIndex(next);
        setMatchedWords(0);
        matchedRef.current = 0;
      }
    }
  }

  function startRecognition() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    stopRecognition();
    wantRecogRef.current = true;
    const recog = new Ctor();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";
    recog.onresult = (ev: SpeechRecognitionEventLike) => {
      let heard = "";
      for (let i = 0; i < ev.results.length; i++) {
        heard += ` ${ev.results[i]![0]?.transcript ?? ""}`;
      }
      const heardTokens = wordsOf(heard);
      const words = wordsOf(
        VOICE_ENROLLMENT_PASSAGES[passageIndexRef.current]?.text ?? "",
      );
      let cursor = 0;
      let hi = 0;
      while (cursor < words.length && hi < heardTokens.length) {
        const want = words[cursor]!;
        const got = heardTokens[hi]!;
        if (
          got === want ||
          (want.length > 3 && got.startsWith(want.slice(0, 4))) ||
          (got.length > 3 && want.startsWith(got.slice(0, 4)))
        ) {
          cursor += 1;
          hi += 1;
        } else {
          hi += 1;
        }
      }
      if (cursor > matchedRef.current) {
        matchedRef.current = cursor;
        setMatchedWords(cursor);
        advancePassageIfNeeded(cursor);
      }
    };
    recog.onerror = () => {
      /* keep recording; user can use Next */
    };
    recog.onend = () => {
      if (wantRecogRef.current && phaseRef.current === "recording") {
        try {
          recog.start();
        } catch {
          /* ignore */
        }
      }
    };
    recogRef.current = recog;
    try {
      recog.start();
    } catch {
      /* ignore */
    }
  }

  function startAnalyserLoop() {
    stopAnalyserLoop();
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      analyser.getFloatTimeDomainData(buf);

      // Noise floor: slow EMA of quieter frames.
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i] ?? 0;
        sumSq += v * v;
      }
      const instantRms = Math.sqrt(sumSq / buf.length);
      if (instantRms < 0.025) {
        noiseFloorRef.current =
          noiseFloorRef.current * 0.95 + instantRms * 0.05;
      }

      const frame = analyseTimeDomain(buf, {
        noiseFloor: noiseFloorRef.current,
      });
      setLevel(Math.min(1, frame.rms * 4));
      setQuality(frame.quality);

      const last = lastTickRef.current ?? now;
      const dt = Math.min(100, Math.max(0, now - last));
      lastTickRef.current = now;

      if (phaseRef.current !== "recording") return;

      elapsedMsRef.current += dt;
      setElapsedSeconds(elapsedMsRef.current / 1000);

      if (frame.quality !== "ok") {
        badStreakRef.current += dt;
        // Sustained bad audio: do not credit voiced time (discard segment credit).
        return;
      }
      badStreakRef.current = 0;

      if (frame.voiced) {
        voicedMsRef.current += dt;
        setVoicedSeconds(voicedMsRef.current / 1000);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function beginRecording(resetProgress: boolean) {
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (resetProgress) {
      chunksRef.current = [];
      goodChunksRef.current = [];
      voicedMsRef.current = 0;
      elapsedMsRef.current = 0;
      setVoicedSeconds(0);
      setElapsedSeconds(0);
      setPassageIndex(0);
      setMatchedWords(0);
      matchedRef.current = 0;
      noiseFloorRef.current = 0.01;
    }

    releaseMic();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      const { mimeType, ext } = pickRecorderMime();
      setMimeExt(ext);
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (!e.data.size) return;
        chunksRef.current.push(e.data);
        if (badStreakRef.current < 400) {
          goodChunksRef.current.push(e.data);
        }
      };
      recorderRef.current = recorder;
      recorder.start(250);

      setPhase("recording");
      phaseRef.current = "recording";
      startAnalyserLoop();
      if (getSpeechRecognitionCtor()) startRecognition();
    } catch {
      setError("Microphone unavailable. You can continue text only.");
      releaseMic();
      setPhase("idle");
    }
  }

  function pauseRecording() {
    if (phase !== "recording") return;
    const rec = recorderRef.current;
    if (rec && rec.state === "recording" && typeof rec.pause === "function") {
      try {
        rec.pause();
      } catch {
        /* ignore */
      }
    }
    stopRecognition();
    stopAnalyserLoop();
    setPhase("paused");
  }

  function resumeRecording() {
    if (phase !== "paused") return;
    const rec = recorderRef.current;
    if (rec && rec.state === "paused" && typeof rec.resume === "function") {
      try {
        rec.resume();
      } catch {
        /* ignore */
      }
      setPhase("recording");
      phaseRef.current = "recording";
      startAnalyserLoop();
      if (getSpeechRecognitionCtor()) startRecognition();
      return;
    }
    // Pause unsupported: restart recorder on same stream if still live.
    void beginRecording(false);
  }

  function stopRecording() {
    stopRecognition();
    const rec = recorderRef.current;
    const finalize = () => {
      releaseMic();
      const parts =
        goodChunksRef.current.length > 0
          ? goodChunksRef.current
          : chunksRef.current;
      if (!parts.length) {
        setPhase("idle");
        setError("No usable speech yet. Press Start and read aloud.");
        return;
      }
      const type =
        parts[0]?.type ||
        (mimeExt === "mp4" ? "audio/mp4" : "audio/webm");
      const blob = new Blob(parts, { type });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPhase("review");
    };

    if (rec && rec.state !== "inactive") {
      rec.onstop = () => finalize();
      try {
        rec.stop();
      } catch {
        finalize();
      }
    } else {
      finalize();
    }
    setPhase("stopped");
  }

  function redo() {
    stopRecognition();
    releaseMic();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    chunksRef.current = [];
    goodChunksRef.current = [];
    voicedMsRef.current = 0;
    elapsedMsRef.current = 0;
    setVoicedSeconds(0);
    setElapsedSeconds(0);
    setPassageIndex(0);
    setMatchedWords(0);
    matchedRef.current = 0;
    setQuality("ok");
    setLevel(0);
    setError(null);
    setPhase("idle");
  }

  function nextPassageManual() {
    if (passageIndex >= VOICE_ENROLLMENT_PASSAGES.length - 1) {
      setMatchedWords(passageWords.length);
      return;
    }
    setPassageIndex((i) => i + 1);
    setMatchedWords(0);
    matchedRef.current = 0;
  }

  async function finish() {
    const parts =
      goodChunksRef.current.length > 0
        ? goodChunksRef.current
        : chunksRef.current;
    if (!parts.length) {
      setError("Record a little more speech before Done.");
      return;
    }
    if (voicedMsRef.current < VOICED_TARGET_SECONDS * 1000) {
      setError(
        `Need about ${VOICED_TARGET_SECONDS} seconds of clear speech. You have ${Math.floor(voicedSeconds)}.`,
      );
      if (phase === "review") {
        // Let them continue recording.
        void beginRecording(false);
      }
      return;
    }
    stopRecognition();
    releaseMic();
    const type =
      parts[0]?.type || (mimeExt === "mp4" ? "audio/mp4" : "audio/webm");
    const blob = new Blob(parts, { type });
    await onDone(blob);
  }

  const qMsg = qualityMessage(quality);
  const profilePct = Math.min(
    100,
    (voicedSeconds / VOICED_TARGET_SECONDS) * 100,
  );

  return (
    <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-ink/10 bg-white p-4 sm:p-5">
      <div>
        <h2 className="m-0 font-display text-xl font-extrabold text-ink">
          Voice sample
        </h2>
        <p className="mt-1 text-sm text-muted">
          Read the lines aloud. We count clear speech, not silence, until about{" "}
          {VOICED_TARGET_SECONDS} seconds. Nothing is saved until you press Done.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={
              phase === "recording"
                ? "inline-block h-3.5 w-3.5 animate-pulse rounded-full bg-cardinal"
                : phase === "paused"
                  ? "inline-block h-3.5 w-3.5 rounded-full bg-gold"
                  : "inline-block h-3.5 w-3.5 rounded-full bg-mist"
            }
            aria-hidden
          />
          <span className="text-sm font-semibold text-ink">
            {phase === "recording"
              ? `Recording ${formatSeconds(elapsedSeconds)}`
              : phase === "paused"
                ? "Paused"
                : phase === "review"
                  ? "Review your sample"
                  : phase === "stopped"
                    ? "Stopped"
                    : "Mic off"}
          </span>
        </div>
        <span className="font-mono text-xs text-muted">
          Voice profile: {Math.min(VOICED_TARGET_SECONDS, Math.floor(voicedSeconds))}{" "}
          of {VOICED_TARGET_SECONDS} seconds
        </span>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-mist"
        role="progressbar"
        aria-valuenow={Math.round(profilePct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Voiced speech collected"
      >
        <div
          className="h-full rounded-full bg-cardinal transition-[width] duration-150"
          style={{ width: `${profilePct}%` }}
        />
      </div>

      {/* Level meter */}
      <div className="flex items-end gap-0.5" style={{ height: 36 }} aria-hidden>
        {Array.from({ length: 24 }).map((_, i) => {
          const on = level * 24 > i;
          const hot = i > 20;
          return (
            <div
              key={i}
              className={
                on
                  ? hot
                    ? "flex-1 rounded-sm bg-cardinal"
                    : "flex-1 rounded-sm bg-genie"
                  : "flex-1 rounded-sm bg-mist"
              }
              style={{ height: `${20 + (i / 24) * 80}%` }}
            />
          );
        })}
      </div>

      {qMsg && phase === "recording" ? (
        <p className="m-0 rounded-xl bg-[#FFF7DB] px-3 py-2 text-sm text-ink">
          {qMsg}
        </p>
      ) : null}

      {phase !== "review" ? (
        <div className="rounded-xl bg-paper px-3 py-4 sm:px-4">
          <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Passage {passageIndex + 1} of {VOICE_ENROLLMENT_PASSAGES.length}
            {passage.title ? `, ${passage.title}` : ""}
          </p>
          <p className="mt-3 font-display text-xl font-bold leading-snug text-ink sm:text-2xl">
            {hasSpeechRec
              ? passagePieces.map((piece, i) => {
                  if (piece.wordIndex == null) {
                    return <span key={`s-${i}`}>{piece.text}</span>;
                  }
                  const cls =
                    piece.wordIndex < matchedWords
                      ? "text-genie"
                      : piece.wordIndex === matchedWords
                        ? "bg-gold/40 text-ink"
                        : "text-ink";
                  return (
                    <span key={`w-${i}`} className={cls}>
                      {piece.text}
                    </span>
                  );
                })
              : passage.text}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
            <div
              className="h-full rounded-full bg-genie transition-[width] duration-150"
              style={{
                width: `${Math.min(100, passageProgress * 100)}%`,
              }}
            />
          </div>
          {!hasSpeechRec ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="m-0 text-xs text-muted">
                Read aloud, then press Next when you finish this passage.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={phase !== "recording" && phase !== "paused"}
                onClick={nextPassageManual}
              >
                Next
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Words light up as you say them.
            </p>
          )}
        </div>
      ) : null}

      {phase === "review" && previewUrl ? (
        <div className="flex flex-col gap-2 rounded-xl bg-paper p-3">
          <p className="m-0 text-sm text-ink">
            Listen once. If it sounds like you, press Done.
          </p>
          <audio controls src={previewUrl} className="w-full">
            Your browser cannot play this preview. The passage you read is still
            shown above as text.
          </audio>
          <p className="mt-2 text-xs text-muted">
            Transcript: the enrollment passage above is the text that matches
            this recording.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {phase === "idle" || phase === "stopped" ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void beginRecording(phase === "idle")}
          >
            {phase === "stopped" ? "Continue" : "Start recording"}
          </Button>
        ) : null}
        {phase === "recording" ? (
          <>
            <Button type="button" variant="outline" onClick={pauseRecording}>
              Pause
            </Button>
            <Button type="button" variant="outline" onClick={stopRecording}>
              Stop
            </Button>
          </>
        ) : null}
        {phase === "paused" ? (
          <>
            <Button type="button" onClick={resumeRecording}>
              Resume
            </Button>
            <Button type="button" variant="outline" onClick={stopRecording}>
              Stop
            </Button>
          </>
        ) : null}
        {phase === "review" ? (
          <>
            {enough ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void finish()}
              >
                {busy ? "Saving…" : "Done"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void beginRecording(false)}
              >
                Continue recording
              </Button>
            )}
          </>
        ) : null}
        {enough && phase === "recording" ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              stopRecording();
            }}
          >
            Finish and review
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          disabled={busy || phase === "idle"}
          onClick={redo}
        >
          Redo
        </Button>
      </div>

      {phase === "review" && !enough ? (
        <p className="m-0 text-sm text-muted">
          Need more clear speech
          {" ("}
          {Math.floor(voicedSeconds)} of {VOICED_TARGET_SECONDS}
          {"). Keep reading, then Done."}
        </p>
      ) : null}

      {enough && phase !== "review" ? (
        <p className="m-0 text-sm text-[#0F7B6C]">
          Enough clear speech collected. Stop to listen, then Done.
        </p>
      ) : null}

      {error ? <p className="m-0 text-sm text-cardinal">{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void onCancelTextOnly()}
        className="self-start text-sm text-muted underline"
      >
        Not now: text only
      </button>
    </section>
  );
}
