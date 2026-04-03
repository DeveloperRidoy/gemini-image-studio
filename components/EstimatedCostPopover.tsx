"use client";

import { Coins, Dot } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CostEstimate } from "@/lib/cost-estimate";
import { USD_TO_CAD_APPROX } from "@/lib/cost-estimate";

const panelSurfaceCls =
  "rounded-2xl border border-zinc-200/80 bg-white/95 p-4 shadow-xl shadow-zinc-900/15 ring-1 ring-zinc-200/60 backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/95 dark:shadow-black/40 dark:ring-white/[0.06]";

type Props = {
  cost: CostEstimate;
};

const HOVER_LEAVE_MS = 160;

export function EstimatedCostPopover({ cost }: Props) {
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

  const visible = pinnedOpen || hoverOpen;

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const onPointerEnter = useCallback(() => {
    clearLeaveTimer();
    setHoverOpen(true);
  }, [clearLeaveTimer]);

  const onPointerLeave = useCallback(() => {
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      setHoverOpen(false);
      leaveTimerRef.current = null;
    }, HOVER_LEAVE_MS);
  }, [clearLeaveTimer]);

  useEffect(() => {
    return () => clearLeaveTimer();
  }, [clearLeaveTimer]);

  useEffect(() => {
    if (!pinnedOpen) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setPinnedOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinnedOpen(false);
        setHoverOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [pinnedOpen]);

  const summary = `~CA$${cost.estimatedCadTotal.toFixed(2)} · ${cost.requestCount} call${cost.requestCount === 1 ? "" : "s"}`;

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200/90 bg-white/90 px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:border-emerald-400/50 hover:bg-emerald-50/80 hover:text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-600/80 dark:bg-zinc-800/70 dark:text-zinc-100 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-100"
        aria-expanded={visible}
        aria-haspopup="dialog"
        aria-controls={visible ? menuId : undefined}
        title="Estimated cost — hover or click for details"
        onClick={() => setPinnedOpen((o) => !o)}
      >
        <Coins className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
        <span className="tabular-nums">{summary}</span>
      </button>

      {visible ? (
        <div
          id={menuId}
          role="dialog"
          aria-label="Estimated cost details"
          className={`absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-[min(calc(100vw-2rem),22rem)] ${panelSurfaceCls}`}
        >
          <div className="mb-3 flex items-center gap-2 border-b border-zinc-200/70 pb-3 dark:border-zinc-700/60">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
              <Coins className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Estimated cost
              </h2>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-500">
                Indicative only
              </p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-500">
            Not a bill. Approximate{" "}
            <span className="text-zinc-700 dark:text-zinc-400">CAD</span> (USD ×{" "}
            {USD_TO_CAD_APPROX}). Verify on{" "}
            <a
              className="text-emerald-700 underline decoration-emerald-500/35 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400/90 dark:hover:text-emerald-300"
              href="https://ai.google.dev/gemini-api/docs/pricing"
              target="_blank"
              rel="noreferrer"
            >
              pricing
            </a>
            .
          </p>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-3 border-b border-zinc-200/70 pb-2 dark:border-zinc-800/60">
              <dt className="text-zinc-600 dark:text-zinc-500">Est. modalities</dt>
              <dd className="text-right text-xs text-zinc-800 dark:text-zinc-300">
                {cost.usesTextAndImageModality ? "TEXT + IMAGE" : "IMAGE"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-zinc-200/70 pb-2 dark:border-zinc-800/60">
              <dt className="text-zinc-600 dark:text-zinc-500">API calls</dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-200">
                {cost.requestCount}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-zinc-200/70 pb-2 dark:border-zinc-800/60">
              <dt className="text-zinc-600 dark:text-zinc-500">Input tok / call</dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-200">
                {cost.estimatedInputTokensPerRequest}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-zinc-200/70 pb-2 dark:border-zinc-800/60">
              <dt className="text-zinc-600 dark:text-zinc-500">
                Image out tok / image
              </dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-200">
                {cost.outputImageTokensPerImage}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-zinc-200/70 pb-2 dark:border-zinc-800/60">
              <dt className="text-zinc-600 dark:text-zinc-500">~CAD / call</dt>
              <dd className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400/95">
                CA${cost.estimatedCadPerRequest.toFixed(4)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 pt-0.5 font-medium">
              <dt className="text-zinc-800 dark:text-zinc-300">~Total CAD</dt>
              <dd className="font-mono text-base tabular-nums text-emerald-700 dark:text-emerald-300">
                CA${cost.estimatedCadTotal.toFixed(4)}
              </dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-2 border-t border-zinc-200/70 pt-3 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800/60 dark:text-zinc-500">
            {cost.notes.map((n) => (
              <li key={n} className="flex gap-2">
                <Dot
                  className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400 dark:text-zinc-600"
                  strokeWidth={2}
                />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
