"use client";

import { LogOut, UserRound } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

const avatarButtonCls =
  "flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-zinc-200/90 bg-white shadow-md shadow-zinc-900/10 ring-2 ring-zinc-100 transition hover:border-emerald-400/50 hover:ring-emerald-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-600/80 dark:bg-zinc-800/80 dark:shadow-black/30 dark:ring-zinc-950 dark:hover:border-emerald-500/40 dark:hover:ring-emerald-500/20 dark:focus-visible:ring-emerald-400/50";

export function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const callbackUrl =
    typeof window !== "undefined" ? window.location.href : "/";

  if (status === "loading") {
    return (
      <div
        className={`${avatarButtonCls} shrink-0 cursor-wait text-zinc-400 opacity-60 dark:text-zinc-500`}
        aria-busy
        aria-label="Loading account"
      >
        <UserRound className="h-5 w-5" strokeWidth={1.5} />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => {
          void signIn("google", { callbackUrl });
        }}
        className={`${avatarButtonCls} shrink-0 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200`}
        aria-label="Sign in with Google"
      >
        <UserRound className="h-5 w-5" strokeWidth={1.5} />
      </button>
    );
  }

  const user = session.user;
  const initial = (
    user.name?.[0] ||
    user.email?.[0] ||
    "?"
  ).toUpperCase();

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${avatarButtonCls} text-xs font-semibold text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-100`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span aria-hidden>{initial}</span>
        )}
      </button>
      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[220px] rounded-xl border border-zinc-200/90 bg-white/95 py-2 shadow-xl shadow-zinc-900/10 ring-1 ring-zinc-200/60 backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/95 dark:shadow-black/50 dark:ring-white/[0.06]"
          role="menu"
        >
          <div className="border-b border-zinc-200/80 px-3 pb-2 dark:border-zinc-800/80">
            <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
              {user.name || "Signed in"}
            </p>
            {user.email ? (
              <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-500">
                {user.email}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: "/" });
            }}
            className="mt-1 flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
