"use client";

import { Loader2, RefreshCw, Upload, X } from "lucide-react";
import { useCallback, useId, useState } from "react";
import type { LocalReferenceImage } from "@/lib/reference-image-files";
import {
  collectImageFilesFromDataTransfer,
  dataTransferMayContainFiles,
} from "@/lib/reference-image-files";

const labelMetaCls =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500";

export type ReferenceSessionState = "loading" | "signedOut" | "signedIn";

type Props = {
  batchMode: boolean;
  maxReferenceImages: number;
  images: LocalReferenceImage[];
  onAddFiles: (files: FileList | File[] | null) => void | Promise<void>;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onRetryUpload: (id: string) => void;
  referenceSession: ReferenceSessionState;
  onRequireSignIn: () => void;
};

export function ReferenceImagesField({
  batchMode,
  maxReferenceImages,
  images,
  onAddFiles,
  onRemove,
  onClearAll,
  onRetryUpload,
  referenceSession,
  onRequireSignIn,
}: Props) {
  const inputId = useId();
  const [dropActive, setDropActive] = useState(false);

  const canUploadReferences = referenceSession === "signedIn";

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropActive(false);
      if (referenceSession === "loading") return;
      if (referenceSession === "signedOut") {
        onRequireSignIn();
        return;
      }
      const files = collectImageFilesFromDataTransfer(e.dataTransfer);
      if (files.length) void onAddFiles(files);
    },
    [onAddFiles, onRequireSignIn, referenceSession],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dataTransferMayContainFiles(e.dataTransfer)) return;
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (referenceSession === "loading") return;
      if (!dataTransferMayContainFiles(e.dataTransfer)) return;
      setDropActive(true);
    },
    [referenceSession],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setDropActive(false);
    }
  }, []);

  const anyBusy = images.some(
    (r) => r.uploadStatus === "pending" || r.uploadStatus === "uploading",
  );

  return (
    <div className="mt-6 border-t border-zinc-200/80 pt-6 dark:border-zinc-800/80">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className={labelMetaCls}>Reference images (optional)</span>
        {images.length > 0 ? (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-500">
        Upload images to edit, compose, or use as style references. Each file is
        sent to S3 as soon as you add them (spinner on the thumbnail until
        ready). You can drop images anywhere on the page. Generate stays fast
        once uploads finish.
        Response modalities are set automatically (image-only for text-only
        prompts; text+image when references are present). Up to{" "}
        {maxReferenceImages} images for this model.
        {batchMode
          ? " In batch mode, the same references are sent with every prompt."
          : ""}
        {referenceSession === "signedOut" ? (
          <>
            {" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-300">
              Sign in to add reference images.
            </span>
          </>
        ) : null}
      </p>

      {anyBusy ? (
        <p className="mb-3 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400/90">
          <Loader2
            className="h-3.5 w-3.5 shrink-0 animate-spin"
            aria-hidden
          />
          Uploading references…
        </p>
      ) : null}

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {canUploadReferences ? (
          <>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              id={inputId}
              onChange={(e) => {
                void onAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <label
              htmlFor={inputId}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition ${
                dropActive
                  ? "border-emerald-500/70 bg-emerald-50/80 dark:border-emerald-400/50 dark:bg-emerald-500/15"
                  : "border-zinc-300/90 bg-zinc-50/60 hover:border-emerald-400/55 hover:bg-emerald-50/50 dark:border-zinc-600/80 dark:bg-zinc-950/40 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/5"
              }`}
            >
              <Upload
                className={`mb-2 h-8 w-8 ${dropActive ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 dark:text-zinc-500"}`}
                strokeWidth={1.25}
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {dropActive
                  ? "Drop images here"
                  : "Click to upload or drop anywhere"}
              </span>
              <span className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-600">
                PNG, JPEG, WebP… · {images.length}/{maxReferenceImages}
              </span>
            </label>
          </>
        ) : (
          <button
            type="button"
            disabled={referenceSession === "loading"}
            onClick={() => {
              if (referenceSession === "signedOut") onRequireSignIn();
            }}
            className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
              dropActive && referenceSession === "signedOut"
                ? "border-emerald-500/70 bg-emerald-50/80 dark:border-emerald-400/50 dark:bg-emerald-500/15"
                : "border-zinc-300/90 bg-zinc-50/60 hover:border-emerald-400/55 hover:bg-emerald-50/50 dark:border-zinc-600/80 dark:bg-zinc-950/40 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/5"
            }`}
          >
            <Upload
              className={`mb-2 h-8 w-8 ${dropActive ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 dark:text-zinc-500"}`}
              strokeWidth={1.25}
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {referenceSession === "loading"
                ? "Checking sign-in…"
                : dropActive
                  ? "Sign in to upload"
                  : "Sign in to upload or drop anywhere"}
            </span>
            <span className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-600">
              PNG, JPEG, WebP… · {images.length}/{maxReferenceImages}
            </span>
          </button>
        )}
      </div>

      {images.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {images.map((r) => {
            const busy =
              r.uploadStatus === "pending" || r.uploadStatus === "uploading";
            const failed = r.uploadStatus === "error";
            const ready = r.uploadStatus === "ready";

            return (
              <div
                key={r.id}
                className={`group relative aspect-square overflow-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-900 ${
                  failed
                    ? "border-red-400/70 dark:border-red-500/50"
                    : "border-zinc-200/90 dark:border-zinc-700/80"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.preview}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {busy ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 text-white">
                    <Loader2
                      className="h-7 w-7 animate-spin opacity-95"
                      aria-hidden
                    />
                    <span className="px-1 text-center text-[10px] font-medium leading-tight">
                      {r.uploadStatus === "pending"
                        ? "Starting…"
                        : "Uploading…"}
                    </span>
                  </div>
                ) : null}
                {failed ? (
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2">
                    <p className="line-clamp-3 text-[9px] leading-snug text-white/95">
                      {r.uploadError ?? "Upload failed"}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canUploadReferences) {
                          onRequireSignIn();
                          return;
                        }
                        onRetryUpload(r.id);
                      }}
                      className="mt-1.5 flex items-center justify-center gap-1 rounded-md bg-white/95 py-1 text-[10px] font-semibold text-zinc-900 hover:bg-white"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden />
                      Retry
                    </button>
                  </div>
                ) : null}
                {ready ? (
                  <div className="pointer-events-none absolute bottom-1 left-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                    Ready
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemove(r.id)}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white opacity-100 transition hover:bg-black/85 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
