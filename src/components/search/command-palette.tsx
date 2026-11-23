"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import type { GlobalSearchGroup } from "@/lib/search/types";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "crux:open-search";
/** After this many ms with no reply, show a slow-search tip. */
const SLOW_MS = 700;

export function openGlobalSearch() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_EVENT));
  }
}

/** Compact button that opens the single shell search dialog. */
export function SearchOpenButton({
  className,
  showShortcut,
}: {
  className?: string;
  showShortcut?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => openGlobalSearch()}
      className={className}
      aria-label="Search"
    >
      {showShortcut ? (
        <>
          <span className="text-white/50">Search</span>
          <kbd className="rounded border border-white/20 px-1.5 py-0.5 font-mono text-[10px] text-white/60">
            ⌘K
          </kbd>
        </>
      ) : (
        "Search"
      )}
    </button>
  );
}

/**
 * One search dialog for Ctrl/Cmd K and the top bar.
 * Mount once in the app shell.
 */
export function GlobalSearchHost() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [took, setTook] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(0);
  const [slow, setSlow] = useState(false);

  const flat = groups.flatMap((g) =>
    g.hits.map((h) => ({ ...h, group: g.label })),
  );

  const run = useCallback((query: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSlow(false);

    startTransition(() => {
      void (async () => {
        if (query.trim().length < 2) {
          setGroups([]);
          setTook(null);
          setError(null);
          return;
        }
        const slowTimer = window.setTimeout(() => {
          if (!ac.signal.aborted) setSlow(true);
        }, SLOW_MS);
        try {
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(query.trim())}`,
            { signal: ac.signal },
          );
          const json = (await res.json()) as {
            groups?: GlobalSearchGroup[];
            took_ms?: number;
            error?: string;
          };
          if (ac.signal.aborted) return;
          if (!res.ok) {
            setError(json.error ?? "Search failed.");
            setGroups([]);
            setTook(null);
            return;
          }
          setError(null);
          setGroups(json.groups ?? []);
          setTook(json.took_ms ?? null);
          setActive(0);
        } catch (e) {
          if (ac.signal.aborted) return;
          if (e instanceof DOMException && e.name === "AbortError") return;
          setError("Search could not reach the server. Try again.");
          setGroups([]);
          setTook(null);
        } finally {
          window.clearTimeout(slowTimer);
          if (!ac.signal.aborted) setSlow(false);
        }
      })();
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => run(q), 180);
    return () => window.clearTimeout(t);
  }, [q, open, run]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      abortRef.current?.abort();
      setQ("");
      setGroups([]);
      setTook(null);
      setError(null);
      setSlow(false);
    }
  }, [open]);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    function onKey(e: KeyboardEvent) {
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/50 p-3 pt-[12vh] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Search Crux"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-mist px-3">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) =>
                  Math.min(i + 1, Math.max(flat.length - 1, 0)),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && flat[active]) {
                e.preventDefault();
                go(flat[active]!.href);
              }
            }}
            placeholder="Search cases, briefs, evidence, cards…"
            className="h-12 w-full border-0 bg-transparent text-base outline-none placeholder:text-muted"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              flat[active] ? `search-hit-${flat[active]!.id}` : undefined
            }
          />
          {pending || slow ? (
            <LoadingGenie compact size={36} label="" />
          ) : took != null ? (
            <span className="shrink-0 text-[11px] text-muted">{took} ms</span>
          ) : null}
        </div>

        <div id={listId} className="max-h-[55vh] overflow-y-auto p-2" role="listbox">
          {slow && !error ? (
            <p className="px-3 py-2 text-xs text-muted">
              Still searching. Bad wifi can make this slow.
            </p>
          ) : null}
          {error ? (
            <p className="px-3 py-4 text-sm text-cardinal" role="alert">
              {error}
            </p>
          ) : null}
          {!error &&
          q.trim().length >= 2 &&
          groups.length === 0 &&
          !pending &&
          !slow ? (
            <p className="px-3 py-4 text-sm text-muted">
              Nothing matched. Try a case number or a short phrase.
            </p>
          ) : null}
          {q.trim().length < 2 ? (
            <p className="px-3 py-4 text-sm text-muted">
              Type at least two letters. Results respect your team.
            </p>
          ) : null}

          {groups.map((g) => (
            <section key={g.kind} className="mb-2">
              <h3 className="px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                {g.label}
              </h3>
              <ul className="m-0 list-none p-0">
                {g.hits.map((h) => {
                  const idx = flat.findIndex(
                    (x) => x.kind === h.kind && x.id === h.id,
                  );
                  return (
                    <li key={`${h.kind}:${h.id}`}>
                      <button
                        type="button"
                        id={`search-hit-${h.id}`}
                        role="option"
                        aria-selected={idx === active}
                        onClick={() => go(h.href)}
                        onMouseEnter={() => setActive(idx)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left",
                          idx === active
                            ? "bg-[#F7F8FA]"
                            : "hover:bg-[#F7F8FA]",
                        )}
                      >
                        <span className="text-sm font-semibold text-ink">
                          {h.title}
                        </span>
                        <span className="text-xs text-muted">{h.snippet}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
