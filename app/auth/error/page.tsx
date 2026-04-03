import { AlertCircle, ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const isAccessDenied = error === "AccessDenied";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white/85 p-8 shadow-xl shadow-zinc-900/10 ring-1 ring-zinc-200/60 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:shadow-2xl dark:shadow-black/40 dark:ring-white/[0.04]">
        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${
            isAccessDenied
              ? "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400"
              : "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400"
          }`}
        >
          {isAccessDenied ? (
            <ShieldAlert className="h-6 w-6" strokeWidth={1.5} />
          ) : (
            <AlertCircle className="h-6 w-6" strokeWidth={1.5} />
          )}
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {isAccessDenied ? "Access not granted" : "Sign-in problem"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {isAccessDenied ? (
            <>
              Your Google account signed in successfully, but it is not on this
              app&apos;s allow list. Ask the project owner to add your email to{" "}
              <code className="rounded border border-emerald-200/80 bg-emerald-50/90 px-1.5 py-0.5 font-mono text-[11px] text-emerald-800 dark:border-zinc-700/80 dark:bg-zinc-950/80 dark:text-emerald-200/90">
                ALLOWED_USER_EMAILS
              </code>{" "}
              if you need access.
            </>
          ) : (
            <>
              Something went wrong during sign-in. Try again, or contact the
              project owner if it keeps happening.
            </>
          )}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-zinc-200/90 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-emerald-400/50 hover:bg-emerald-50/80 hover:text-emerald-800 dark:border-zinc-600/80 dark:bg-zinc-800/50 dark:text-zinc-200 dark:shadow-none dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Back to home
        </Link>
      </div>
    </div>
  );
}
