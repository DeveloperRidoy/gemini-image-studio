"use client";

import { Upload, X } from "lucide-react";
import { useCallback, useId, useState } from "react";
import type { LocalReferenceImage } from "@/lib/reference-image-files";
import { collectImageFilesFromDataTransfer } from "@/lib/reference-image-files";

const labelMetaCls =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500";

type Props = {
  batchMode: boolean;
  maxReferenceImages: number;
  images: LocalReferenceImage[];
  onAddFiles: (files: FileList | File[] | null) => void | Promise<void>;
  onRemove: (id: string) => void;
  onClearAll: () => void;
};

export function ReferenceImagesField({
  batchMode,
  maxReferenceImages,
  images,
  onAddFiles,
  onRemove,
  onClearAll,
}: Props) {
  const inputId = useId();
  const [dropActive, setDropActive] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropActive(false);
      const files = collectImageFilesFromDataTransfer(e.dataTransfer);
      if (files.length) void onAddFiles(files);
    },
    [onAddFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setDropActive(false);
    }
  }, []);

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
        Upload images to edit, compose, or use as style references. Response
        modalities are set automatically (image-only for text-only prompts;
        text+image when references are present). Up to {maxReferenceImages}{" "}
        images for this model.
        {batchMode
          ? " In batch mode, the same references are sent with every prompt."
          : ""}
      </p>

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
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
            {dropActive ? "Drop images here" : "Click to upload or drop images"}
          </span>
          <span className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-600">
            PNG, JPEG, WebP… · {images.length}/{maxReferenceImages}
          </span>
        </label>
      </div>

      {images.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {images.map((r) => (
            <div
              key={r.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200/90 bg-zinc-100 dark:border-zinc-700/80 dark:bg-zinc-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.preview}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white opacity-100 transition hover:bg-black/85 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="Remove image"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
