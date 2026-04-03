"use client";

import { BarChart3 } from "lucide-react";
import type { DailyUsage } from "@/lib/daily-usage-storage";

type Props = {
  usage: DailyUsage;
};

export function DailyUsagePill({ usage }: Props) {
  return (
    <div
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200/90 bg-zinc-50/90 px-3 py-1.5 text-[11px] text-zinc-700 shadow-sm dark:border-zinc-700/70 dark:bg-zinc-900/60 dark:text-zinc-300"
      title="Images generated today and running estimated spend (local only)"
    >
      <BarChart3 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
      <span className="min-w-0 truncate">
        <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {usage.imageCount}
        </span>
        <span className="text-zinc-500 dark:text-zinc-500"> img</span>
        <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
        <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400/95">
          ~CA${usage.totalCad.toFixed(2)}
        </span>
        <span className="text-zinc-500 dark:text-zinc-500"> today</span>
      </span>
    </div>
  );
}
