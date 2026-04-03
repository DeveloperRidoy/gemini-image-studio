import { FileState, GoogleGenAI } from "@google/genai";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 45;

export type GeminiUploadedFile = {
  fileUri: string;
  mimeType: string;
  name: string;
};

/**
 * Upload bytes to the Gemini Files API and wait until the file is ACTIVE.
 */
export async function uploadBufferToGeminiFiles(params: {
  ai: GoogleGenAI;
  buffer: Buffer;
  mimeType: string;
  displayName: string;
}): Promise<GeminiUploadedFile> {
  const { ai, buffer, mimeType, displayName } = params;
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });

  let created;
  try {
    created = await ai.files.upload({
      file: blob,
      config: {
        mimeType,
        displayName: displayName.slice(0, 512) || "reference",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Gemini file upload failed: ${message}`);
  }

  const name = created.name;
  if (!name) {
    throw new Error("Upload succeeded but file name was missing.");
  }

  let state = created.state;
  let latest = created;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (state === FileState.ACTIVE) break;
    if (state === FileState.FAILED) {
      throw new Error(`File processing failed for ${name}.`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      latest = await ai.files.get({ name });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Could not poll file status: ${message}`);
    }
    state = latest.state;
  }

  if (state !== FileState.ACTIVE) {
    throw new Error(
      "Image file did not become ready in time. Try a smaller image or retry.",
    );
  }

  const uri = latest.uri;
  if (!uri) {
    throw new Error("File is active but has no URI — try again.");
  }

  return {
    fileUri: uri,
    mimeType: latest.mimeType ?? mimeType,
    name,
  };
}
