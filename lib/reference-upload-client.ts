/**
 * Browser-side: presign → S3 PUT → register with Gemini Files API.
 * Used when adding reference images (not on generate).
 */

export type ReferenceGeminiFile = { fileUri: string; mimeType: string };

export async function uploadReferenceFilesViaS3(
  slots: { mimeType: string; sourceFile: File }[],
): Promise<ReferenceGeminiFile[]> {
  if (slots.length === 0) return [];

  const presignRes = await fetch("/api/s3/presign-reference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: slots.map((r) => ({
        contentType: r.mimeType,
        size: r.sourceFile.size,
        filename: r.sourceFile.name || "reference.png",
      })),
    }),
  });
  const presignText = await presignRes.text();
  let presignJson: {
    error?: string;
    uploads?: { key: string; uploadUrl: string; contentType: string }[];
  };
  try {
    presignJson = presignText ? JSON.parse(presignText) : {};
  } catch {
    const preview = presignText.slice(0, 80).replace(/\s+/g, " ");
    throw new Error(
      `Could not presign S3 uploads (${presignRes.status}): ${preview || "non-JSON response"}`,
    );
  }
  if (!presignRes.ok || !presignJson.uploads?.length) {
    throw new Error(
      presignJson.error ??
        `Presign failed (HTTP ${presignRes.status}). Check AWS env vars.`,
    );
  }

  for (let i = 0; i < presignJson.uploads.length; i++) {
    const u = presignJson.uploads[i];
    const file = slots[i]?.sourceFile;
    if (!file) break;
    const putRes = await fetch(u.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": u.contentType },
    });
    if (!putRes.ok) {
      throw new Error(
        putRes.status === 403
          ? "S3 rejected the upload (403). Check bucket CORS and IAM permissions for PutObject."
          : `S3 upload failed (HTTP ${putRes.status}). If this is a browser error, add CORS on the bucket for your app origin.`,
      );
    }
  }

  const regRes = await fetch("/api/gemini/reference-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      s3Keys: presignJson.uploads.map((x) => x.key),
    }),
  });
  const regText = await regRes.text();
  let regJson: {
    error?: string;
    files?: { fileUri: string; mimeType: string }[];
  };
  try {
    regJson = regText ? JSON.parse(regText) : {};
  } catch {
    const preview = regText.slice(0, 80).replace(/\s+/g, " ");
    throw new Error(
      `Gemini registration failed (${regRes.status}): ${preview || "non-JSON response"}`,
    );
  }
  if (!regRes.ok || !regJson.files?.length) {
    throw new Error(
      regJson.error ??
        `Register references with Gemini failed (HTTP ${regRes.status}).`,
    );
  }

  return regJson.files.map((f) => ({
    fileUri: f.fileUri,
    mimeType: f.mimeType || "image/png",
  }));
}
