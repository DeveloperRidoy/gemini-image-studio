import { randomBytes } from "crypto";
import { getToken } from "next-auth/jwt";
import type { JWT } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/allowed-emails";
import { refreshGoogleAccessToken } from "@/lib/google-refresh-access-token";
import {
  extensionForMime,
  parseDataUrl,
} from "@/lib/parse-data-url";

export const maxDuration = 60;

type Body = {
  dataUrl?: string;
  filename?: string;
};

function safeFilename(name: string, ext: string): string {
  const base = name
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  const stem = base.length > 0 ? base : "gemini-image";
  const e = ext.replace(/^\./, "").slice(0, 5) || "png";
  return `${stem}.${e}`;
}

function buildMultipartRelated(
  boundary: string,
  metadata: { name: string },
  mime: string,
  fileBuffer: Buffer,
): Buffer {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
  return Buffer.concat([head, fileBuffer, tail]);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAllowedEmail(session.user.email)) {
    return NextResponse.json(
      { error: "Sign in with an allowed Google account." },
      { status: 401 },
    );
  }

  const secret =
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Server auth is not configured (AUTH_SECRET)." },
      { status: 500 },
    );
  }

  let jwtPayload = (await getToken({ req, secret })) as JWT | null;
  if (jwtPayload?.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      {
        error:
          "Google session expired. Sign out and sign in again, then retry Drive upload.",
      },
      { status: 401 },
    );
  }

  const exp = jwtPayload?.expires_at;
  const stale =
    !jwtPayload?.access_token ||
    (typeof exp === "number" && Date.now() / 1000 > exp - 90);
  if (stale && jwtPayload?.refresh_token) {
    jwtPayload = await refreshGoogleAccessToken(jwtPayload);
  }

  const accessToken = jwtPayload?.access_token;
  if (
    !accessToken ||
    typeof accessToken !== "string" ||
    jwtPayload?.error === "RefreshAccessTokenError"
  ) {
    return NextResponse.json(
      {
        error:
          "No Google access token. Sign out and sign in again to grant Google Drive access.",
      },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dataUrl = body.dataUrl?.trim();
  if (!dataUrl) {
    return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid data URL (expected base64 image)" },
      { status: 400 },
    );
  }

  const { mime, buffer } = parsed;
  const ext = extensionForMime(mime);
  const filename = safeFilename(
    (body.filename ?? "gemini-image").replace(/\.[a-z0-9]+$/i, ""),
    ext,
  );

  const boundary = `gemini_img_${randomBytes(24).toString("hex")}`;
  const multipart = buildMultipartRelated(
    boundary,
    { name: filename },
    mime,
    buffer,
  );

  const uploadUrl =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink";

  const driveRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: new Uint8Array(multipart),
  });

  const driveJson = (await driveRes.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    webViewLink?: string;
    error?: { message?: string; code?: number };
  };

  if (!driveRes.ok) {
    const msg =
      driveJson.error?.message ??
      (typeof driveJson === "object" ? JSON.stringify(driveJson) : "Drive error");
    const status = driveRes.status === 403 || driveRes.status === 401 ? 403 : 502;
    return NextResponse.json(
      {
        error:
          status === 403
            ? "Google Drive refused the upload. Sign out, sign in again, and accept Drive permissions."
            : `Drive upload failed: ${msg}`,
      },
      { status },
    );
  }

  return NextResponse.json({
    id: driveJson.id,
    name: driveJson.name,
    mimeType: driveJson.mimeType,
    webViewLink: driveJson.webViewLink ?? null,
  });
}
