"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

function UserOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    </svg>
  );
}

const avatarButtonCls =
  "flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-zinc-600/80 bg-zinc-800/80 shadow-md shadow-black/30 ring-2 ring-zinc-950 transition hover:border-emerald-500/40 hover:ring-emerald-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50";

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
        className={`${avatarButtonCls} shrink-0 cursor-wait text-zinc-500 opacity-60`}
        aria-busy
        aria-label="Loading account"
      >
        <UserOutlineIcon className="h-5 w-5" />
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
        className={`${avatarButtonCls} shrink-0 text-zinc-400 hover:text-zinc-200`}
        aria-label="Sign in with Google"
      >
        <UserOutlineIcon className="h-5 w-5" />
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
        className={`${avatarButtonCls} text-xs font-semibold text-zinc-200 hover:text-zinc-100`}
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
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[220px] rounded-xl border border-zinc-700/80 bg-zinc-900/95 py-2 shadow-xl shadow-black/50 ring-1 ring-white/[0.06] backdrop-blur-xl"
          role="menu"
        >
          <div className="border-b border-zinc-800/80 px-3 pb-2">
            <p className="truncate text-xs font-medium text-zinc-200">
              {user.name || "Signed in"}
            </p>
            {user.email ? (
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
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
            className="mt-1 w-full px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800/80 hover:text-white"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
