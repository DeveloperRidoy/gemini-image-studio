import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/allowed-emails";
import { getS3Bucket, getS3Client, tempReferenceKey } from "@/lib/s3-config";

/** Matches largest model reference cap in lib/models.ts */
const MAX_ITEMS = 14;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PRESIGN_EXPIRES_SEC = 15 * 60;

function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").slice(0, 180);
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.length > 0 ? cleaned : "image.bin";
}

type PresignItem = {
  contentType?: string;
  filename?: string;
  size?: number;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAllowedEmail(session.user.email)) {
    return NextResponse.json(
      { error: "Sign in with an allowed Google account." },
      { status: 401 },
    );
  }

  let body: { items?: PresignItem[] };
  try {
    body = (await req.json()) as { items?: PresignItem[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json(
      { error: 'Send { "items": [{ "contentType", "size", "filename?" }] }.' },
      { status: 400 },
    );
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `At most ${MAX_ITEMS} reference images per request.` },
      { status: 400 },
    );
  }

  let s3;
  let bucket: string;
  try {
    s3 = getS3Client();
    bucket = getS3Bucket();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const uploads: {
    key: string;
    uploadUrl: string;
    contentType: string;
  }[] = [];

  for (const item of items) {
    const contentType = (item.contentType ?? "").trim().toLowerCase();
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Each item needs an image/* contentType." },
        { status: 400 },
      );
    }
    const size =
      typeof item.size === "number" && Number.isFinite(item.size)
        ? item.size
        : -1;
    if (size <= 0 || size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `Each file size must be between 1 and ${MAX_FILE_BYTES} bytes.`,
        },
        { status: 400 },
      );
    }

    const safeName = sanitizeFilename(
      typeof item.filename === "string" ? item.filename : "reference.png",
    );
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const key = tempReferenceKey(id, safeName);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });

    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUrl(s3, command, {
        expiresIn: PRESIGN_EXPIRES_SEC,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `Could not create upload URL: ${message}` },
        { status: 500 },
      );
    }

    uploads.push({ key, uploadUrl, contentType });
  }

  return NextResponse.json({ uploads });
}
