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

/** Custom payload so in-app reference reordering is not treated as a new file upload. */
export const REFERENCE_REORDER_MIME = "application/x-gemini-ref-reorder";

export function dataTransferIsReferenceReorderDrag(
  dataTransfer: DataTransfer | null,
): boolean {
  if (!dataTransfer?.types) return false;
  const { types } = dataTransfer;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === REFERENCE_REORDER_MIME) return true;
  }
  return false;
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

/** Reorder list by stable id: `toIndex` is insert-before (0 … length); `length` appends at end. */
export function reorderLocalReferencesById<T extends { id: string }>(
  prev: T[],
  draggedId: string,
  toIndex: number,
): T[] {
  const fromIndex = prev.findIndex((r) => r.id === draggedId);
  if (fromIndex < 0) return prev;
  const next = [...prev];
  const [moved] = next.splice(fromIndex, 1);
  const lenAfterRemove = next.length;
  if (toIndex >= lenAfterRemove) {
    next.push(moved);
    return next;
  }
  let insert = toIndex;
  if (fromIndex < toIndex) insert = toIndex - 1;
  next.splice(insert, 0, moved);
  return next;
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
