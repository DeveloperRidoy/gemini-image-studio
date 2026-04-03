/**
 * Browser-side: presign → S3 PUT → use public HTTPS object URLs in generateContent
 * (`fileData.fileUri`), per Gemini external URL input.
 */

export type ReferenceFileUrl = { fileUri: string; mimeType: string };

export async function uploadReferenceFilesViaS3(
  slots: { mimeType: string; sourceFile: File }[],
): Promise<ReferenceFileUrl[]> {
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
    uploads?: {
      key: string;
      uploadUrl: string;
      contentType: string;
      publicUrl: string;
    }[];
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

  return presignJson.uploads.map((u, i) => ({
    fileUri: u.publicUrl,
    mimeType: u.contentType || slots[i]?.mimeType || "image/png",
  }));
}
