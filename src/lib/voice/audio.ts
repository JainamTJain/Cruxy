/**
 * Decode enrollment / practice audio to 16 kHz mono float32 PCM.
 * WAV is supported natively. Other containers need ffmpeg on PATH.
 */

export type Pcm16k = {
  samples: Float32Array;
  sampleRate: 16000;
};

function readAscii(buf: Buffer, offset: number, len: number): string {
  return buf.subarray(offset, offset + len).toString("ascii");
}

/** Parse a PCM WAV buffer into mono float32 at the file's sample rate. */
export function decodeWav(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  if (buf.length < 44 || readAscii(buf, 0, 4) !== "RIFF" || readAscii(buf, 8, 4) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  let offset = 12;
  let sampleRate = 16000;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id = readAscii(buf, offset, 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bitsPerSample = buf.readUInt16LE(start + 14);
    } else if (id === "data") {
      dataOffset = start;
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error("WAV missing data chunk");

  const frameCount = Math.floor(dataSize / ((bitsPerSample / 8) * channels));
  const mono = new Float32Array(frameCount);
  if (bitsPerSample === 16) {
    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        sum += buf.readInt16LE(dataOffset + (i * channels + c) * 2) / 32768;
      }
      mono[i] = sum / channels;
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        sum += buf.readFloatLE(dataOffset + (i * channels + c) * 4);
      }
      mono[i] = sum / channels;
    }
  } else {
    throw new Error(`Unsupported WAV bit depth ${bitsPerSample}`);
  }
  return { samples: mono, sampleRate };
}

export function resampleLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = samples[i0]! * (1 - t) + samples[i1]! * t;
  }
  return out;
}

export function toPcm16k(samples: Float32Array, sampleRate: number): Pcm16k {
  return { samples: resampleLinear(samples, sampleRate, 16000), sampleRate: 16000 };
}

/** Encode mono float32 PCM as 16-bit WAV at the given rate. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

/**
 * Decode audio bytes to 16 kHz mono.
 * WAV: native. Other formats: try `ffmpeg` on PATH when available.
 */
export async function decodeToPcm16k(buf: Buffer): Promise<Pcm16k | null> {
  try {
    if (buf.length >= 12 && readAscii(buf, 0, 4) === "RIFF") {
      const wav = decodeWav(buf);
      return toPcm16k(wav.samples, wav.sampleRate);
    }
  } catch {
    // fall through
  }

  try {
    const { spawn } = await import("child_process");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const { promises: fs } = await import("fs");
    const { randomUUID } = await import("crypto");
    const inPath = join(tmpdir(), `crux-in-${randomUUID()}`);
    const outPath = join(tmpdir(), `crux-out-${randomUUID()}.wav`);
    await fs.writeFile(inPath, buf);
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        "ffmpeg",
        ["-y", "-i", inPath, "-ac", "1", "-ar", "16000", "-f", "wav", outPath],
        { stdio: "ignore" },
      );
      p.on("error", reject);
      p.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)),
      );
    });
    const out = await fs.readFile(outPath);
    await fs.unlink(inPath).catch(() => undefined);
    await fs.unlink(outPath).catch(() => undefined);
    const wav = decodeWav(out);
    return toPcm16k(wav.samples, wav.sampleRate);
  } catch {
    return null;
  }
}

/** Slice PCM by millisecond range (16 kHz). */
export function slicePcmMs(pcm: Pcm16k, startMs: number, endMs: number): Pcm16k {
  const start = Math.max(0, Math.floor((startMs / 1000) * 16000));
  const end = Math.min(pcm.samples.length, Math.ceil((endMs / 1000) * 16000));
  return {
    samples: pcm.samples.subarray(start, Math.max(start + 1, end)),
    sampleRate: 16000,
  };
}
