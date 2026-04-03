export type ReferenceUploadStatus = "pending" | "uploading" | "ready" | "error";

export type LocalReferenceImage = {
  id: string;
  preview: string;
  mimeType: string;
  /** Original file until S3 + Gemini registration completes. */
  sourceFile: File;
  uploadStatus: ReferenceUploadStatus;
  /** From Gemini Files API once `uploadStatus === "ready"`. */
  fileUri?: string;
  geminiMimeType?: string;
  uploadError?: string;
};

export function fileToLocalReference(file: File): LocalReferenceImage {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    preview: URL.createObjectURL(file),
    mimeType: file.type || "image/png",
    sourceFile: file,
    uploadStatus: "pending",
  };
}

/** Image files from a drag-and-drop `DataTransfer` (OS files and in-browser file items). */
export function collectImageFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): File[] {
  const out: File[] = [];
  const seen = new Set<string>();

  const push = (f: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    const key = `${f.name}-${f.size}-${f.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };

  if (dataTransfer.files?.length) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      push(dataTransfer.files.item(i));
    }
  }

  if (dataTransfer.items?.length) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item?.kind !== "file") continue;
      push(item.getAsFile());
    }
  }

  return out;
}
