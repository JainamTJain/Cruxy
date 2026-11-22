/**
 * Download Apache-2.0 ECAPA-TDNN ONNX (192-dim) for voiceprints.
 * Not required for CI (spectral fallback). Production: run once so
 * onnxruntime-node can load `.data/models/ecapa-any-length.onnx`.
 *
 * Source: https://huggingface.co/kenrunio/transcriber-speaker-onnx
 */
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { pipeline } from "stream/promises";

const URL =
  "https://huggingface.co/kenrunio/transcriber-speaker-onnx/resolve/main/ecapa-any-length.onnx";
const OUT = path.join(process.cwd(), ".data", "models", "ecapa-any-length.onnx");

async function main() {
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  try {
    await fs.access(OUT);
    const st = await fs.stat(OUT);
    if (st.size > 1_000_000) {
      console.log("model already present:", OUT);
      return;
    }
  } catch {
    /* download */
  }
  console.log("Downloading ECAPA ONNX (Apache-2.0)…");
  const res = await fetch(URL);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status}`);
  }
  await pipeline(res.body, createWriteStream(OUT));
  console.log("Saved", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
