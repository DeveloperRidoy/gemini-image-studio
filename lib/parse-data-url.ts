export function parseDataUrl(
  dataUrl: string,
): { mime: string; buffer: Buffer } | null {
  const t = dataUrl.trim();
  const marker = ";base64,";
  const i = t.indexOf(marker);
  if (i < 0 || !t.toLowerCase().startsWith("data:")) return null;
  const meta = t.slice(5, i);
  const mime = meta.split(";")[0]?.trim() || "image/png";
  const b64 = t.slice(i + marker.length).replace(/\s/g, "");
  try {
    return { mime, buffer: Buffer.from(b64, "base64") };
  } catch {
    return null;
  }
}

export function extensionForMime(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "image/png";
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[base] ?? "png";
}
