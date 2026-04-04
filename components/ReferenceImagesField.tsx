"use client";

import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Move,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import type { LocalReferenceImage } from "@/lib/reference-image-files";
import {
  REFERENCE_REORDER_MIME,
  collectImageFilesFromDataTransfer,
  dataTransferIsReferenceReorderDrag,
  dataTransferMayContainFiles,
} from "@/lib/reference-image-files";

const labelMetaCls =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500";

export type ReferenceSessionState = "loading" | "signedOut" | "signedIn";

type ReorderHover = "label" | "end" | number | null;

type Props = {
  batchMode: boolean;
  maxReferenceImages: number;
  images: LocalReferenceImage[];
  onAddFiles: (files: FileList | File[] | null) => void | Promise<void>;
  onReorder: (draggedId: string, toIndex: number) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onRetryUpload: (id: string) => void;
  referenceSession: ReferenceSessionState;
  onRequireSignIn: () => void;
};

function tryReorderDrop(
  e: React.DragEvent,
  onReorder: (draggedId: string, toIndex: number) => void,
  toIndex: number,
): boolean {
  if (!dataTransferIsReferenceReorderDrag(e.dataTransfer)) return false;
  const id = e.dataTransfer.getData(REFERENCE_REORDER_MIME);
  if (id) onReorder(id, toIndex);
  return true;
}

/** Touch / coarse pointers: no meaningful hover; HTML5 drag-and-drop is unsupported. */
function useTouchOrCoarsePointer() {
  const [touchUi, setTouchUi] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const sync = () => setTouchUi(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return touchUi;
}

function ReadyReferenceTile({
  r,
  index,
  imageCount,
  reorderDraggingId,
  dropRing,
  touchUi,
  onReorder,
  onReorderDragStart,
  onReorderDragEnd,
  onReorderHover,
  onTileDrop,
  onRemove,
}: {
  r: LocalReferenceImage;
  index: number;
  imageCount: number;
  reorderDraggingId: string | null;
  dropRing: boolean;
  touchUi: boolean;
  onReorder: (draggedId: string, toIndex: number) => void;
  onReorderDragStart: (id: string) => void;
  onReorderDragEnd: () => void;
  onReorderHover: (target: ReorderHover) => void;
  onTileDrop: (e: React.DragEvent) => void;
  onRemove: (id: string) => void;
}) {
  const [centerRemove, setCenterRemove] = useState(false);

  const canMoveEarlier = index > 0;
  const canMoveLater = index < imageCount - 1;

  const moveEarlier = useCallback(() => {
    if (!canMoveEarlier) return;
    onReorder(r.id, index - 1);
  }, [canMoveEarlier, index, onReorder, r.id]);

  const moveLater = useCallback(() => {
    if (!canMoveLater) return;
    onReorder(r.id, index + 2);
  }, [canMoveLater, index, onReorder, r.id]);

  const updateCenterRemove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const radius = Math.min(b.width, b.height) * 0.22;
    setCenterRemove(
      Math.abs(e.clientX - cx) <= radius &&
        Math.abs(e.clientY - cy) <= radius,
    );
  }, []);

  const deleteBtnClass =
    "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
    "border border-white/25 bg-gradient-to-b from-white/20 to-white/10 " +
    "text-white shadow-[0_6px_28px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.1)_inset,inset_0_1px_0_rgba(255,255,255,0.4)] " +
    "ring-1 ring-white/15 backdrop-blur-xl transition duration-200 " +
    "hover:from-white/26 hover:to-white/14 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] " +
    "active:scale-[0.97] dark:from-white/15 dark:to-white/5 dark:shadow-[0_8px_36px_rgba(0,0,0,0.6)]";

  return (
    <div
      draggable={!touchUi}
      onDragStart={(e) => {
        if (touchUi) {
          e.preventDefault();
          return;
        }
        onReorderDragStart(r.id);
        e.dataTransfer.setData(REFERENCE_REORDER_MIME, r.id);
        e.dataTransfer.setData("text/plain", r.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        onReorderDragEnd();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dataTransferIsReferenceReorderDrag(e.dataTransfer)) {
          e.dataTransfer.dropEffect = "move";
          onReorderHover(index);
        } else if (dataTransferMayContainFiles(e.dataTransfer)) {
          e.dataTransfer.dropEffect = "copy";
          onReorderHover(null);
        }
      }}
      onDragLeave={(e) => {
        e.stopPropagation();
        const related = e.relatedTarget as Node | null;
        if (!related || !e.currentTarget.contains(related)) {
          onReorderHover(null);
        }
      }}
      onDrop={(e) => {
        onTileDrop(e);
      }}
      className={`group relative aspect-square select-none overflow-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-900 ${
        dropRing
          ? "border-emerald-500 ring-2 ring-emerald-400/80 dark:border-emerald-400/70"
          : "border-zinc-200/90 dark:border-zinc-700/80"
      } ${reorderDraggingId === r.id ? "opacity-60" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={r.preview}
        alt=""
        draggable={false}
        className="pointer-events-none h-full w-full object-cover transition-[filter] duration-300 ease-out motion-reduce:transition-none motion-reduce:group-hover:blur-none group-hover:blur-md"
      />
      <div className="pointer-events-none absolute bottom-1 left-1 z-[3] rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm">
        Ready
      </div>

      {touchUi ? (
        <div className="absolute inset-x-0 bottom-0 z-[2] flex items-stretch justify-between gap-0.5 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-1 pb-1 pt-6">
          <button
            type="button"
            disabled={!canMoveEarlier}
            onClick={(e) => {
              e.stopPropagation();
              moveEarlier();
            }}
            className="flex flex-1 items-center justify-center rounded-md bg-white/12 py-2 text-white backdrop-blur-md transition enabled:active:scale-[0.98] disabled:opacity-25"
            aria-label="Move earlier in list"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(r.id);
            }}
            className={`${deleteBtnClass} mx-0.5 scale-90`}
            aria-label="Remove image"
          >
            <X
              className="h-[1.15rem] w-[1.15rem] text-rose-100 drop-shadow-[0_0_12px_rgba(251,113,133,0.55)]"
              strokeWidth={2.25}
            />
          </button>
          <button
            type="button"
            disabled={!canMoveLater}
            onClick={(e) => {
              e.stopPropagation();
              moveLater();
            }}
            className="flex flex-1 items-center justify-center rounded-md bg-white/12 py-2 text-white backdrop-blur-md transition enabled:active:scale-[0.98] disabled:opacity-25"
            aria-label="Move later in list"
          >
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 z-[2] opacity-0 transition-opacity duration-300 ease-out motion-reduce:transition-none group-hover:pointer-events-auto group-hover:opacity-100"
          onMouseMove={updateCenterRemove}
          onMouseLeave={() => setCenterRemove(false)}
        >
          {/* Dim only: avoid backdrop-blur (often pops in late). Blur uses CSS filter on <img> so it eases smoothly. */}
          <div
            className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/32 to-zinc-950/45"
            aria-hidden
          />
          <div className="absolute inset-0 flex items-center justify-center px-2">
            <div
              className={`relative flex w-full max-w-[11rem] flex-col items-center justify-center transition-opacity duration-200 ease-out motion-reduce:transition-none ${
                centerRemove
                  ? "pointer-events-none opacity-0"
                  : "opacity-100"
              }`}
            >
              <Move
                className="h-7 w-7 text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]"
                strokeWidth={1.5}
              />
              <span className="mt-1.5 px-1 text-center text-[9px] font-medium uppercase tracking-[0.12em] text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]">
                Drag to reorder
              </span>
            </div>
            <div
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ease-out motion-reduce:transition-none ${
                centerRemove
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(r.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={deleteBtnClass}
                aria-label="Remove image"
              >
                <X
                  className="h-[1.15rem] w-[1.15rem] text-rose-100 drop-shadow-[0_0_14px_rgba(251,113,133,0.65)]"
                  strokeWidth={2.25}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReferenceImagesField({
  batchMode,
  maxReferenceImages,
  images,
  onAddFiles,
  onReorder,
  onRemove,
  onClearAll,
  onRetryUpload,
  referenceSession,
  onRequireSignIn,
}: Props) {
  const inputId = useId();
  const [dropActive, setDropActive] = useState(false);
  const [reorderDraggingId, setReorderDraggingId] = useState<string | null>(
    null,
  );
  const [reorderHover, setReorderHover] = useState<ReorderHover>(null);
  const touchUi = useTouchOrCoarsePointer();

  const canUploadReferences = referenceSession === "signedIn";

  const acceptForEnter = useCallback((dt: DataTransfer | null) => {
    return (
      dataTransferIsReferenceReorderDrag(dt) || dataTransferMayContainFiles(dt)
    );
  }, []);

  const handleDragOverZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dataTransferIsReferenceReorderDrag(e.dataTransfer)) {
      e.dataTransfer.dropEffect = "move";
      return;
    }
    if (!dataTransferMayContainFiles(e.dataTransfer)) return;
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (referenceSession === "loading") return;
      if (!acceptForEnter(e.dataTransfer)) return;
      setDropActive(true);
    },
    [acceptForEnter, referenceSession],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setDropActive(false);
      setReorderHover(null);
    }
  }, []);

  const handleDropZone = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropActive(false);
      setReorderHover(null);
      if (referenceSession === "loading") return;

      if (dataTransferIsReferenceReorderDrag(e.dataTransfer)) {
        const id = e.dataTransfer.getData(REFERENCE_REORDER_MIME);
        if (id) onReorder(id, images.length);
        return;
      }

      if (referenceSession === "signedOut") {
        onRequireSignIn();
        return;
      }
      const files = collectImageFilesFromDataTransfer(e.dataTransfer);
      if (files.length) void onAddFiles(files);
    },
    [
      images.length,
      onAddFiles,
      onRequireSignIn,
      onReorder,
      referenceSession,
    ],
  );

  const handleLabelDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dataTransferIsReferenceReorderDrag(e.dataTransfer)) {
        e.dataTransfer.dropEffect = "move";
        setReorderHover("label");
        return;
      }
      if (!dataTransferMayContainFiles(e.dataTransfer)) return;
      e.dataTransfer.dropEffect = "copy";
      setReorderHover(null);
    },
    [],
  );

  const handleLabelDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropActive(false);
      setReorderHover(null);
      if (referenceSession === "loading") return;

      if (tryReorderDrop(e, onReorder, 0)) return;

      if (referenceSession === "signedOut") {
        onRequireSignIn();
        return;
      }
      const files = collectImageFilesFromDataTransfer(e.dataTransfer);
      if (files.length) void onAddFiles(files);
    },
    [onAddFiles, onRequireSignIn, onReorder, referenceSession],
  );

  const handleThumbDrop = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDropActive(false);
      setReorderHover(null);
      if (referenceSession === "loading") return;

      if (tryReorderDrop(e, onReorder, index)) return;

      if (referenceSession === "signedOut") {
        onRequireSignIn();
        return;
      }
      const files = collectImageFilesFromDataTransfer(e.dataTransfer);
      if (files.length) void onAddFiles(files);
    },
    [onAddFiles, onRequireSignIn, onReorder, referenceSession],
  );

  const handleEndStripDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dataTransferIsReferenceReorderDrag(e.dataTransfer)) {
      e.dataTransfer.dropEffect = "move";
      setReorderHover("end");
    }
  }, []);

  const handleEndStripDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropActive(false);
      setReorderHover(null);
      if (referenceSession === "loading") return;
      if (tryReorderDrop(e, onReorder, images.length)) return;
    },
    [images.length, onReorder, referenceSession],
  );

  const anyBusy = images.some(
    (r) => r.uploadStatus === "pending" || r.uploadStatus === "uploading",
  );

  const labelReorderHot =
    reorderDraggingId && reorderHover === "label" && dropActive;

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
        ready).         Drag ready thumbnails to reorder them (on phones, use the arrows under
        each thumbnail). Dropping files from elsewhere still adds new references.
        You can drop images anywhere on the
        page. Generate stays fast
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
        onDragOver={handleDragOverZone}
        onDrop={handleDropZone}
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
              onDragOver={handleLabelDragOver}
              onDrop={handleLabelDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition ${
                dropActive
                  ? labelReorderHot
                    ? "border-emerald-500/90 bg-emerald-50/90 ring-2 ring-emerald-400/50 dark:border-emerald-400/60 dark:bg-emerald-500/15 dark:ring-emerald-400/35"
                    : "border-emerald-500/70 bg-emerald-50/80 dark:border-emerald-400/50 dark:bg-emerald-500/15"
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
            onDragOver={handleLabelDragOver}
            onDrop={handleLabelDrop}
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

        {images.length > 0 ? (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {images.map((r, index) => {
              const busy =
                r.uploadStatus === "pending" || r.uploadStatus === "uploading";
              const failed = r.uploadStatus === "error";
              const ready = r.uploadStatus === "ready";

              if (ready) {
                return (
                  <ReadyReferenceTile
                    key={r.id}
                    r={r}
                    index={index}
                    imageCount={images.length}
                    reorderDraggingId={reorderDraggingId}
                    dropRing={
                      reorderDraggingId !== null &&
                      reorderHover === index &&
                      reorderDraggingId !== r.id
                    }
                    touchUi={touchUi}
                    onReorder={onReorder}
                    onReorderDragStart={setReorderDraggingId}
                    onReorderDragEnd={() => {
                      setReorderDraggingId(null);
                      setReorderHover(null);
                    }}
                    onReorderHover={setReorderHover}
                    onTileDrop={(e) => handleThumbDrop(e, index)}
                    onRemove={onRemove}
                  />
                );
              }

              return (
                <div
                  key={r.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dataTransferMayContainFiles(e.dataTransfer)) {
                      e.dataTransfer.dropEffect = "copy";
                    }
                  }}
                  onDrop={(e) => handleThumbDrop(e, index)}
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
                    draggable={false}
                    className="pointer-events-none h-full w-full object-cover"
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
                  <button
                    type="button"
                    onClick={() => onRemove(r.id)}
                    className="absolute right-1 top-1 z-[2] flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white opacity-100 transition hover:bg-black/85 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Remove image"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              );
            })}
            {reorderDraggingId && !touchUi ? (
              <div
                onDragOver={handleEndStripDragOver}
                onDragLeave={(e) => {
                  const related = e.relatedTarget as Node | null;
                  if (!related || !e.currentTarget.contains(related)) {
                    setReorderHover(null);
                  }
                }}
                onDrop={handleEndStripDrop}
                className={`col-span-full flex min-h-[4.5rem] items-center justify-center rounded-lg border border-dashed px-2 text-center text-[10px] font-medium transition ${
                  reorderHover === "end"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : "border-zinc-300/70 text-zinc-500 dark:border-zinc-600 dark:text-zinc-500"
                }`}
              >
                Drop here to move to end
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
