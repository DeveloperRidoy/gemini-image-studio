"use client";

import { Loader2, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const btnCls =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200/90 bg-white/90 text-zinc-600 shadow-sm shadow-zinc-900/5 ring-2 ring-zinc-100 transition hover:border-emerald-400/40 hover:text-emerald-700 hover:ring-emerald-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-600/80 dark:bg-zinc-800/80 dark:text-zinc-300 dark:shadow-black/30 dark:ring-zinc-950 dark:hover:border-emerald-500/40 dark:hover:text-emerald-200 dark:hover:ring-emerald-500/20";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`${btnCls} cursor-wait opacity-50`}
        aria-hidden
        aria-busy
      >
        <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={1.5} />
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={btnCls}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.5} />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.5} />
      )}
    </button>
  );
}
