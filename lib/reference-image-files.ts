export type ReferenceUploadStatus = "pending" | "uploading" | "ready" | "error";

export type LocalReferenceImage = {
  id: string;
  preview: string;
  mimeType: string;
  /** Original file until S3 upload completes. */
  sourceFile: File;
  uploadStatus: ReferenceUploadStatus;
  /** Public HTTPS URL of the S3 object; sent to Gemini as `fileData.fileUri`. */
  fileUri?: string;
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

/** True when the drag likely carries local files (OS / browser file drag). */
export function dataTransferMayContainFiles(
  dataTransfer: DataTransfer | null,
): boolean {
  if (!dataTransfer?.types) return false;
  const { types } = dataTransfer;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === "Files") return true;
  }
  return false;
}

/** Image files from a drag-and-drop `DataTransfer` (OS files and in-browser file items). */
export function collectImageFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): File[] {
  const out: File[] = [];
  const seen = new Set<string>();

  const push = (f: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    // Same bytes often appear in both `files` and `items` with different `name` (e.g. "" vs "image.png").
    const key = `${f.size}\0${f.lastModified}\0${f.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };

  const items = dataTransfer.items;
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item?.kind !== "file") continue;
      push(item.getAsFile());
    }
  }

  if (out.length === 0 && dataTransfer.files?.length) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      push(dataTransfer.files.item(i));
    }
  }

  return out;
}
