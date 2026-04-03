"use client";

import { CloudUpload, Download, ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

const actionBtnCls =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:border-emerald-400/55 hover:bg-emerald-50/90 hover:text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:pointer-events-none disabled:opacity-45 dark:border-zinc-600/80 dark:bg-zinc-800/55 dark:text-zinc-100 dark:shadow-none dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-100";

function extensionFromDataUrl(dataUrl: string): string {
  const m = /^data:([^;,]+);/i.exec(dataUrl);
  if (!m) return "png";
  const mime = m[1].trim().toLowerCase();
  if (mime.includes("jpeg") || mime === "image/jpg") return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "png";
}

async function downloadDataUrl(dataUrl: string, filename: string) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Props = {
  dataUrl: string;
  filenameBase: string;
};

export function GeneratedImageActions({ dataUrl, filenameBase }: Props) {
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveMessage, setDriveMessage] = useState<{
    type: "ok" | "err";
    text: string;
    link?: string;
  } | null>(null);

  const ext = extensionFromDataUrl(dataUrl);
  const downloadName = `${filenameBase}.${ext}`;

  const onDownload = useCallback(() => {
    void downloadDataUrl(dataUrl, downloadName);
  }, [dataUrl, downloadName]);

  const onDrive = useCallback(async () => {
    setDriveMessage(null);
    setDriveLoading(true);
    try {
      const res = await fetch("/api/drive/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl,
          filename: filenameBase,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        webViewLink?: string | null;
        name?: string;
      };
      if (!res.ok) {
        setDriveMessage({
          type: "err",
          text: data.error ?? "Upload failed",
        });
        return;
      }
      setDriveMessage({
        type: "ok",
        text: data.name ? `Saved as “${data.name}”` : "Saved to Google Drive",
        link: data.webViewLink ?? undefined,
      });
    } catch (e) {
      setDriveMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setDriveLoading(false);
    }
  }, [dataUrl, filenameBase]);

  return (
    <div className="flex min-w-0 max-w-full flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onDownload}
          className={actionBtnCls}
          title="Download image"
        >
          <Download
            className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
            strokeWidth={1.5}
          />
          Download
        </button>
        <button
          type="button"
          onClick={() => void onDrive()}
          disabled={driveLoading}
          className={actionBtnCls}
          title="Upload this image to your Google Drive"
        >
          {driveLoading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={1.5} />
          ) : (
            <CloudUpload
              className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400"
              strokeWidth={1.5}
            />
          )}
          {driveLoading ? "Saving…" : "Save to Drive"}
        </button>
      </div>
      {driveMessage ? (
        <p
          className={`max-w-full text-balance break-words text-center text-[11px] leading-relaxed ${
            driveMessage.type === "ok"
              ? "text-emerald-700 dark:text-emerald-400/95"
              : "text-red-600 dark:text-red-400/95"
          }`}
        >
          {driveMessage.text}
          {driveMessage.link ? (
            <>
              {" "}
              <a
                href={driveMessage.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium underline decoration-emerald-500/35 underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-300"
              >
                Open in Drive
                <ExternalLink className="inline h-3 w-3" strokeWidth={2} />
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export function slugFromPrompt(prompt: string, maxLen = 36): string {
  const s = prompt
    .slice(0, maxLen)
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return s.length > 0 ? s : "image";
}
