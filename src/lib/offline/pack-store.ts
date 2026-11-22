/** IndexedDB offline case packs (client-only). */

const DB_NAME = "crux-offline";
const DB_VERSION = 1;
const STORE = "case_packs";

export type OfflinePackMeta = {
  caseId: string;
  caseNumber: number;
  title: string;
  savedAt: string;
  bytes: number;
};

export type OfflinePack = OfflinePackMeta & {
  payload: unknown;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "caseId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function listOfflinePacks(): Promise<OfflinePackMeta[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as OfflinePack[]).map((r) => ({
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        title: r.title,
        savedAt: r.savedAt,
        bytes: r.bytes,
      }));
      resolve(rows.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflinePack(
  caseId: string,
): Promise<OfflinePack | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(caseId);
    req.onsuccess = () => resolve((req.result as OfflinePack) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflinePack(pack: OfflinePack): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(pack);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteOfflinePack(caseId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(caseId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function relativeSavedLabel(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Saved for offline";
  const mins = Math.max(0, Math.round((now - then) / 60_000));
  if (mins < 2) return "Saved for offline, just now";
  if (mins < 60) return `Saved for offline, updated ${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return "Saved for offline, updated 1 hour ago";
  if (hours < 48) return `Saved for offline, updated ${hours} hours ago`;
  const days = Math.round(hours / 24);
  return `Saved for offline, updated ${days} days ago`;
}
