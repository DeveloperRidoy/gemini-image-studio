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

/** Keys we issue for reference uploads (S3 presign + Gemini import). */
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
