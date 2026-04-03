import { S3Client } from "@aws-sdk/client-s3";

const TEMP_PREFIX = "temp-files/";

let client: S3Client | null = null;

export function getS3Bucket(): string {
  const b = process.env.AWS_S3_BUCKET?.trim();
  if (!b) throw new Error("AWS_S3_BUCKET is not set.");
  return b;
}

export function getS3Region(): string {
  const r = process.env.AWS_REGION?.trim();
  if (!r) throw new Error("AWS_REGION is not set.");
  return r;
}

export function getS3Client(): S3Client {
  if (client) return client;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set for S3.",
    );
  }
  client = new S3Client({
    region: getS3Region(),
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

/** Keys we issue for browser reference uploads (presigned PUT). */
export function assertAllowedTempReferenceKey(key: string): void {
  const k = key.trim();
  if (!k.startsWith(TEMP_PREFIX)) {
    throw new Error(`S3 key must start with "${TEMP_PREFIX}".`);
  }
  if (k.includes("..") || k.includes("\\") || k.includes("\0")) {
    throw new Error("Invalid S3 key.");
  }
}

export function tempReferenceKey(uniqueId: string, safeFilename: string): string {
  return `${TEMP_PREFIX}refs/${uniqueId}-${safeFilename}`;
}

function encodeS3KeyForUrlPath(key: string): string {
  return key
    .split("/")
    .filter((s) => s.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * HTTPS URL Gemini can fetch as `fileData.fileUri` (see Gemini external URL docs).
 * Set `AWS_S3_PUBLIC_BASE_URL` (no trailing slash) for CloudFront or a custom origin;
 * otherwise uses virtual-hosted–style `https://{bucket}.s3.{region}.amazonaws.com/...`.
 * Objects must be world-readable (bucket policy, CDN, etc.) for Gemini to retrieve them.
 */
export function getS3PublicObjectUrl(key: string): string {
  const k = key.trim();
  if (!k) throw new Error("S3 key is empty.");
  assertAllowedTempReferenceKey(k);
  const path = encodeS3KeyForUrlPath(k);
  const custom = process.env.AWS_S3_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (custom) {
    return `${custom}/${path}`;
  }
  const bucket = getS3Bucket();
  const region = getS3Region();
  return `https://${bucket}.s3.${region}.amazonaws.com/${path}`;
}
