/**
 * Client-safe chunk upload helpers (no server-only imports).
 * Retries and index resync so a failed upload never skips ahead.
 */

export const CLIENT_CHUNK_MS = 10_000;

export type ChunkUploadResult =
  | {
      ok: true;
      nextIndex: number;
      resumed?: boolean;
      maxLossMs?: number;
    }
  | {
      ok: false;
      error: string;
      nextIndex?: number;
      status: number;
      maxLossMs?: number;
    };

export type ChunkUploadResponseBody = {
  ok?: boolean;
  error?: string;
  nextIndex?: number;
  maxLossMs?: number;
  resumed?: boolean;
};

/** Plain copy for common upload failures. */
export function chunkUploadErrorMessage(
  status: number,
  body: ChunkUploadResponseBody,
): string {
  if (status === 403) {
    return (
      body.error ??
      "This device cannot record. Text-only members stay off the mic, or switch layout to own device."
    );
  }
  if (status === 401) {
    return "Sign in again, then resume recording. Saved parts are still on the server.";
  }
  if (status === 409) {
    return (
      body.error ??
      "Upload got out of order. Syncing to the next open part."
    );
  }
  if (status >= 500 || status === 0) {
    return "Network or server problem uploading audio. Retrying. At most about 10 seconds can be lost.";
  }
  return body.error ?? "Upload failed. Retrying.";
}

/**
 * Decide the next index after a response.
 * On 409, trust the server's nextIndex so the client can resume.
 */
export function resolveNextIndexAfterUpload(opts: {
  attemptedIndex: number;
  status: number;
  body: ChunkUploadResponseBody;
  currentNext: number;
}): number {
  if (opts.status === 409 && typeof opts.body.nextIndex === "number") {
    return opts.body.nextIndex;
  }
  if (opts.status >= 200 && opts.status < 300) {
    return opts.body.nextIndex ?? opts.attemptedIndex + 1;
  }
  // Failed upload: keep current next (do not skip the failed index).
  return opts.currentNext;
}

export async function uploadChunkWithRetry(opts: {
  roundId: string;
  blob: Blob;
  index: number;
  mime: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ChunkUploadResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const maxAttempts = opts.maxAttempts ?? 4;
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const ext = opts.mime.includes("mp4") ? "mp4" : "webm";

  let last: ChunkUploadResult = {
    ok: false,
    error: "Upload failed",
    status: 0,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const form = new FormData();
      form.append("chunk", opts.blob, `chunk-${opts.index}.${ext}`);
      form.append("index", String(opts.index));
      form.append("mime", opts.mime);
      const res = await fetchFn(`/api/practice/rounds/${opts.roundId}/chunks`, {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as ChunkUploadResponseBody;

      if (res.ok) {
        return {
          ok: true,
          nextIndex: body.nextIndex ?? opts.index + 1,
          resumed: body.resumed,
          maxLossMs: body.maxLossMs ?? CLIENT_CHUNK_MS,
        };
      }

      last = {
        ok: false,
        error: chunkUploadErrorMessage(res.status, body),
        nextIndex: body.nextIndex,
        status: res.status,
        maxLossMs: body.maxLossMs ?? CLIENT_CHUNK_MS,
      };

      // 409: client should resync; no point retrying the same wrong index.
      if (res.status === 409) return last;
      // 403/401: consent or auth; retrying will not help.
      if (res.status === 401 || res.status === 403) return last;

      if (attempt < maxAttempts) {
        await sleep(400 * attempt);
      }
    } catch {
      last = {
        ok: false,
        error:
          "Network dropped while uploading. Retrying. At most about 10 seconds can be lost.",
        status: 0,
        maxLossMs: CLIENT_CHUNK_MS,
      };
      if (attempt < maxAttempts) {
        await sleep(400 * attempt);
      }
    }
  }

  return last;
}
