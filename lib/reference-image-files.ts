export type LocalReferenceImage = {
  id: string;
  preview: string;
  mimeType: string;
  data: string;
};

export function readFileAsReference(file: File): Promise<{
  mimeType: string;
  data: string;
  preview: string;
}> {
  return new Promise((resolve, reject) => {
    const preview = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({
        mimeType: file.type || "image/png",
        data: base64,
        preview,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
