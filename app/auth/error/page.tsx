import Link from "next/link";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const isAccessDenied = error === "AccessDenied";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-8 shadow-2xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-xl">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
          {isAccessDenied ? "Access not granted" : "Sign-in problem"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {isAccessDenied ? (
            <>
              Your Google account signed in successfully, but it is not on this
              app&apos;s allow list. Ask the project owner to add your email to{" "}
              <code className="rounded border border-zinc-700/80 bg-zinc-950/80 px-1.5 py-0.5 font-mono text-[11px] text-emerald-200/90">
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
          className="mt-6 inline-flex rounded-lg border border-zinc-600/80 bg-zinc-800/50 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
