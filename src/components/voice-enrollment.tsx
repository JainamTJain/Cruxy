"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { HARVARD_ENROLLMENT } from "@/lib/voice/harvard";
import {
  competitionVoicePrompt,
  naturalEnrollmentPrompt,
} from "@/lib/voice/appe-prompts";
import { wordsOf } from "@/lib/auth/voice-passages";
import {
  analyseTimeDomain,
  getSpeechRecognitionCtor,
  pickRecorderMime,
  releaseStream,
  type QualityFlag,
  type SpeechRecognitionEventLike,
} from "@/lib/auth/voice-vad";
import type { EnrollmentPartId } from "@/lib/voice/types";

type PartPhase = "idle" | "recording" | "review";

type PartState = {
  blob: Blob | null;
  voicedSeconds: number;
  redoReason: string | null;
  heardText: string;
};

type Props = {
  onDone: (payload: {
    parts: Record<EnrollmentPartId, Blob>;
    heardText: string;
  }) => void | Promise<void>;
  onCancelTextOnly: () => void | Promise<void>;
  busy?: boolean;
  caseTitle?: string | null;
  /** When true, hide the text-only escape (Settings re-record). */
  requireVoice?: boolean;
};

const PART_ORDER: EnrollmentPartId[] = ["read", "natural", "competition"];

function formatSeconds(n: number): string {
  const s = Math.max(0, Math.floor(n));
  return `${s}s`;
}

function qualityMessage(q: QualityFlag): string | null {
  if (q === "quiet") return "Too quiet. Move closer to the mic.";
  if (q === "clipping") return "Too loud. Move back a little.";
  if (q === "background") return "Loud background. Find a quieter spot.";
  return null;
}

function minVoiced(part: EnrollmentPartId): number {
  if (part === "read") return 10;
  if (part === "natural") return 18;
  return 12;
}

/**
 * Three-part voiceprint enrollment (~45–60s voiced).
 * Read (Harvard) → natural APPE prompt → competition voice.
 * Each part has live quality checks and a specific redo reason.
 */
export function VoiceEnrollment({
  onDone,
  onCancelTextOnly,
  busy,
  caseTitle,
  requireVoice,
}: Props) {
  const [partIndex, setPartIndex] = useState(0);
  const [phase, setPhase] = useState<PartPhase>("idle");
  const [level, setLevel] = useState(0);
  const [quality, setQuality] = useState<QualityFlag>("ok");
  const [voicedSeconds, setVoicedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [heardText, setHeardText] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [parts, setParts] = useState<Record<EnrollmentPartId, PartState>>({
    read: { blob: null, voicedSeconds: 0, redoReason: null, heardText: "" },
    natural: { blob: null, voicedSeconds: 0, redoReason: null, heardText: "" },
    competition: {
      blob: null,
      voicedSeconds: 0,
      redoReason: null,
      heardText: "",
    },
  });

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const voicedMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const noiseFloorRef = useRef(0.01);
  const recogRef = useRef<{
    start: () => void;
    stop: () => void;
    onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    onend: (() => void) | null;
  } | null>(null);
  const wantRecogRef = useRef(false);
  const heardRef = useRef("");

  const partId = PART_ORDER[partIndex]!;
  const natural = useMemo(
    () => naturalEnrollmentPrompt({ caseTitle }),
    [caseTitle],
  );
  const competition = useMemo(() => competitionVoicePrompt(), []);

  const prompt = useMemo(() => {
    if (partId === "read") {
      return { title: "Read aloud", text: HARVARD_ENROLLMENT.text };
    }
    if (partId === "natural") return natural;
    return competition;
  }, [partId, natural, competition]);

  const passageWords = useMemo(() => wordsOf(prompt.text), [prompt.text]);
  const matchedWords = useMemo(() => {
    if (partId !== "read") return 0;
    const heard = new Set(wordsOf(heardText));
    return passageWords.filter((w) => heard.has(w)).length;
  }, [heardText, passageWords, partId]);

  useEffect(() => {
    return () => {
      stopMeter();
      releaseStream(streamRef.current);
      streamRef.current = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopMeter() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  function tickMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] ?? 0;
      sumSq += v * v;
    }
    const frameRms = Math.sqrt(sumSq / buf.length);
    if (frameRms < 0.02) {
      noiseFloorRef.current = noiseFloorRef.current * 0.95 + frameRms * 0.05;
    }
    const frame = analyseTimeDomain(buf, {
      noiseFloor: noiseFloorRef.current,
    });
    setLevel(Math.min(1, frame.rms * 4));
    setQuality(frame.quality);
    const now = performance.now();
    if (lastTickRef.current != null) {
      const dt = now - lastTickRef.current;
      if (frame.voiced) voicedMsRef.current += dt;
      setVoicedSeconds(voicedMsRef.current / 1000);
    }
    lastTickRef.current = now;
    rafRef.current = requestAnimationFrame(tickMeter);
  }

  async function startRecording() {
    setError(null);
    setHeardText("");
    heardRef.current = "";
    chunksRef.current = [];
    voicedMsRef.current = 0;
    lastTickRef.current = null;
    setVoicedSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      rafRef.current = requestAnimationFrame(tickMeter);

      const { mimeType } = pickRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase("review");
        setParts((prev) => ({
          ...prev,
          [partId]: {
            blob,
            voicedSeconds: voicedMsRef.current / 1000,
            redoReason: null,
            heardText: heardRef.current,
          },
        }));
        stopMeter();
        releaseStream(streamRef.current);
        streamRef.current = null;
        wantRecogRef.current = false;
        try {
          recogRef.current?.stop();
        } catch {
          /* ignore */
        }
      };
      recorder.start(250);
      setPhase("recording");

      if (partId === "read") {
        const Ctor = getSpeechRecognitionCtor();
        if (Ctor) {
          const recog = new Ctor();
          recog.continuous = true;
          recog.interimResults = true;
          recog.lang = "en-US";
          recog.onresult = (ev: SpeechRecognitionEventLike) => {
            let text = "";
            for (let i = 0; i < ev.results.length; i++) {
              text += ev.results[i]![0]!.transcript + " ";
            }
            heardRef.current = text;
            setHeardText(text);
          };
          recog.onerror = () => undefined;
          recog.onend = () => {
            if (wantRecogRef.current) {
              try {
                recog.start();
              } catch {
                /* ignore */
              }
            }
          };
          recogRef.current = recog;
          wantRecogRef.current = true;
          try {
            recog.start();
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      setError("Microphone permission is needed to enroll your voice.");
      setPhase("idle");
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  function redoPart(reason?: string) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setParts((prev) => ({
      ...prev,
      [partId]: {
        blob: null,
        voicedSeconds: 0,
        redoReason: reason ?? "Redo this part.",
        heardText: "",
      },
    }));
    setPhase("idle");
    setHeardText("");
    setError(null);
  }

  function acceptPart() {
    const min = minVoiced(partId);
    const voiced = voicedMsRef.current / 1000;
    if (voiced < min) {
      redoPart(
        `Need about ${min} seconds of clear speech (heard ${voiced.toFixed(1)}s).`,
      );
      return;
    }
    const qMsg = qualityMessage(quality);
    if (qMsg && quality !== "ok") {
      // Soft warn only at accept if last frame was bad; still allow if voiced enough.
    }
    if (partIndex < PART_ORDER.length - 1) {
      setPartIndex((i) => i + 1);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPhase("idle");
      setHeardText("");
      return;
    }
    void finish();
  }

  async function finish() {
    const read = parts.read.blob;
    const naturalBlob = parts.natural.blob;
    const competitionBlob = parts.competition.blob;
    // Current part blob may be newer than state.
    const currentBlob =
      parts[partId].blob ??
      (previewUrl
        ? await fetch(previewUrl).then((r) => r.blob())
        : null);
    const finalParts: Record<EnrollmentPartId, Blob | null> = {
      read: partId === "read" ? currentBlob : read,
      natural: partId === "natural" ? currentBlob : naturalBlob,
      competition: partId === "competition" ? currentBlob : competitionBlob,
    };
    if (!finalParts.read || !finalParts.natural || !finalParts.competition) {
      setError("Record all three parts before finishing.");
      return;
    }
    await onDone({
      parts: finalParts as Record<EnrollmentPartId, Blob>,
      heardText: parts.read.heardText || heardRef.current,
    });
  }

  const stepLabel = `${partIndex + 1} of 3`;
  const target = minVoiced(partId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Voice enrollment, {stepLabel}
        </p>
        <h2 className="font-display m-0 mt-1 text-[22px] font-extrabold">
          {prompt.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink">{prompt.text}</p>
        {partId === "read" && (
          <p className="mt-1 text-xs text-muted">
            Words matched: {matchedWords} / {passageWords.length}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-usc-gold transition-[width]"
            style={{ width: `${Math.min(100, level * 100)}%` }}
          />
        </div>
        <span className="font-mono text-xs text-muted">
          {formatSeconds(voicedSeconds)} / {target}s
        </span>
      </div>
      {qualityMessage(quality) && phase === "recording" && (
        <p className="text-sm text-usc-cardinal">{qualityMessage(quality)}</p>
      )}
      {parts[partId].redoReason && phase === "idle" && (
        <p className="text-sm text-usc-cardinal">{parts[partId].redoReason}</p>
      )}
      {error && <p className="text-sm text-usc-cardinal">{error}</p>}

      {phase === "review" && previewUrl && (
        <audio controls src={previewUrl} className="w-full" />
      )}

      <div className="flex flex-wrap gap-2">
        {phase === "idle" && (
          <Button type="button" onClick={() => void startRecording()}>
            Start this part
          </Button>
        )}
        {phase === "recording" && (
          <Button type="button" onClick={stopRecording}>
            Stop
          </Button>
        )}
        {phase === "review" && (
          <>
            <Button type="button" onClick={acceptPart} disabled={busy}>
              {partIndex < PART_ORDER.length - 1 ? "Next part" : "Save voice"}
            </Button>
            <Button type="button" variant="outline" onClick={() => redoPart()}>
              Redo
            </Button>
          </>
        )}
        {!requireVoice && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void onCancelTextOnly()}
            disabled={busy}
          >
            Not now: text only
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        About 45 to 60 seconds total. We keep a voiceprint only; the recording
        is deleted after it passes.
      </p>
    </div>
  );
}
