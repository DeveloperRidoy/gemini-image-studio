import { GetObjectCommand } from "@aws-sdk/client-s3";
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/allowed-emails";
import { uploadBufferToGeminiFiles } from "@/lib/gemini-file-upload";
import {
  assertAllowedTempReferenceKey,
  getS3Bucket,
  getS3Client,
} from "@/lib/s3-config";

/** Matches largest model reference cap in lib/models.ts */
const MAX_KEYS = 14;

export const maxDuration = 120;

async function s3BodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body || typeof body !== "object") {
    throw new Error("Empty S3 object body.");
  }
  const withTransform = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof withTransform.transformToByteArray === "function") {
    const arr = await withTransform.transformToByteArray();
    return Buffer.from(arr);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    throw new Error("Empty S3 object body.");
  }
  return Buffer.concat(chunks);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAllowedEmail(session.user.email)) {
    return NextResponse.json(
      { error: "Sign in with an allowed Google account." },
      { status: 401 },
    );
  }

  const rawKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  const apiKey = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY in .env.local",
      },
      { status: 500 },
    );
  }

  let body: { s3Keys?: string[] };
  try {
    body = (await req.json()) as { s3Keys?: string[] };
  } catch {
    return NextResponse.json(
      { error: 'Expected JSON: { "s3Keys": string[] }.' },
      { status: 400 },
    );
  }

  const s3Keys = Array.isArray(body.s3Keys) ? body.s3Keys : [];
  if (s3Keys.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one S3 object key in s3Keys." },
      { status: 400 },
    );
  }
  if (s3Keys.length > MAX_KEYS) {
    return NextResponse.json(
      { error: `At most ${MAX_KEYS} reference images.` },
      { status: 400 },
    );
  }

  let s3;
  let bucket: string;
  try {
    for (const key of s3Keys) {
      assertAllowedTempReferenceKey(key);
    }
    s3 = getS3Client();
    bucket = getS3Bucket();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });
  const files: { fileUri: string; mimeType: string; name: string }[] = [];

  for (const key of s3Keys) {
    let obj;
    try {
      obj = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key.trim() }),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `Could not read S3 object (${key}): ${message}` },
        { status: 502 },
      );
    }

    let buffer: Buffer;
    try {
      buffer = await s3BodyToBuffer(obj.Body);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `S3 body read failed (${key}): ${message}` },
        { status: 502 },
      );
    }

    const mime =
      (obj.ContentType ?? "").trim().toLowerCase() || "application/octet-stream";
    if (!mime.startsWith("image/")) {
      return NextResponse.json(
        {
          error: `S3 object is not an image (${key}).`,
        },
        { status: 400 },
      );
    }

    const base = key.replace(/^.*\//, "").slice(0, 200) || "reference";

    try {
      const uploaded = await uploadBufferToGeminiFiles({
        ai,
        buffer,
        mimeType: mime,
        displayName: base,
      });
      files.push(uploaded);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  return NextResponse.json({ files });
}
