import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentConfig,
  type Part,
} from "@google/genai";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/allowed-emails";
import {
  aspectRatiosForModel,
  getModelDef,
  type ImageModelId,
  type ImageSizeKey,
} from "@/lib/models";

export const maxDuration = 300;

type ReferenceImagePayload = {
  mimeType: string;
  data: string;
};

type GenerateBody = {
  modelId: ImageModelId;
  prompts: string[];
  aspectRatio: string;
  imageSize?: ImageSizeKey;
  googleSearch: "off" | "web" | "web_image";
  thinkingLevel: "minimal" | "high";
  includeThoughts: boolean;
  personGeneration?: "ALLOW_ALL" | "ALLOW_ADULT" | "ALLOW_NONE";
  temperature?: number;
  seed?: number;
  referenceImages?: ReferenceImagePayload[];
};

function buildContents(
  prompt: string,
  refs: ReferenceImagePayload[] | undefined,
): string | Part[] {
  if (!refs?.length) return prompt;
  const parts: Part[] = [{ text: prompt }];
  for (const r of refs) {
    parts.push({
      inlineData: {
        mimeType: r.mimeType || "image/png",
        data: r.data,
      },
    });
  }
  return parts;
}

function buildConfig(
  params: GenerateBody,
  hasReferenceImages: boolean,
): GenerateContentConfig {
  const def = getModelDef(params.modelId);
  const modalities = hasReferenceImages ? ["TEXT", "IMAGE"] : ["IMAGE"];

  const imageConfig: GenerateContentConfig["imageConfig"] = {
    aspectRatio: params.aspectRatio,
  };

  if (def.supportsImageSize && params.imageSize) {
    let size: string = params.imageSize === "512" ? "512" : params.imageSize;
    if (size === "512" && !def.supports512) {
      size = "1K";
    }
    imageConfig.imageSize = size;
  }

  if (params.personGeneration) {
    imageConfig.personGeneration = params.personGeneration;
  }

  const config: GenerateContentConfig = {
    responseModalities: modalities,
    imageConfig,
  };

  if (params.temperature !== undefined) {
    config.temperature = params.temperature;
  }
  if (params.seed !== undefined) {
    config.seed = params.seed;
  }

  if (def.supportsThinking) {
    config.thinkingConfig = {
      thinkingLevel:
        params.thinkingLevel === "high"
          ? ThinkingLevel.HIGH
          : ThinkingLevel.MINIMAL,
      includeThoughts: params.includeThoughts,
    };
  }

  if (params.googleSearch !== "off" && def.supportsWebGrounding) {
    if (params.googleSearch === "web" || !def.supportsImageGrounding) {
      config.tools = [{ googleSearch: {} }];
    } else {
      config.tools = [
        {
          googleSearch: {
            searchTypes: {
              webSearch: {},
              imageSearch: {},
            },
          },
        },
      ];
    }
  }

  return config;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAllowedEmail(session.user.email)) {
    return NextResponse.json(
      { error: "Sign in with an allowed Google account to generate images." },
      { status: 401 },
    );
  }

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY in .env.local",
      },
      { status: 500 },
    );
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompts = (body.prompts ?? []).map((p) => p.trim()).filter(Boolean);
  if (prompts.length === 0) {
    return NextResponse.json(
      { error: "At least one prompt is required" },
      { status: 400 },
    );
  }

  const def = getModelDef(body.modelId);

  const allowedAspects = aspectRatiosForModel(body.modelId);
  if (!allowedAspects.includes(body.aspectRatio)) {
    return NextResponse.json(
      {
        error: `Aspect ratio "${body.aspectRatio}" is not supported for ${def.apiId}.`,
      },
      { status: 400 },
    );
  }

  const refsRaw = body.referenceImages ?? [];
  const referenceImages = refsRaw.slice(0, def.maxReferenceImages);
  const hasReferenceImages = referenceImages.length > 0;
  if (body.googleSearch === "web_image" && !def.supportsImageGrounding) {
    return NextResponse.json(
      {
        error:
          "Web + Image search grounding is only supported on Gemini 3.1 Flash Image (gemini-3.1-flash-image-preview).",
      },
      { status: 400 },
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const config = buildConfig(body, hasReferenceImages);
  const model = def.apiId;

  const results: {
    prompt: string;
    images: string[];
    textParts: string[];
    usage?: Record<string, unknown>;
    error?: string;
  }[] = [];

  for (const prompt of prompts) {
    try {
      const contents = buildContents(prompt, referenceImages);
      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });

      const images: string[] = [];
      const textParts: string[] = [];
      for (const candidate of response.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          if (part.thought) continue;
          if (part.text) textParts.push(part.text);
          if (part.inlineData?.data) {
            const mime = part.inlineData.mimeType ?? "image/png";
            images.push(`data:${mime};base64,${part.inlineData.data}`);
          }
        }
      }

      const usage = response.usageMetadata
        ? {
            promptTokenCount: response.usageMetadata.promptTokenCount,
            candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
            totalTokenCount: response.usageMetadata.totalTokenCount,
            thoughtsTokenCount: response.usageMetadata.thoughtsTokenCount,
          }
        : undefined;

      results.push({ prompt, images, textParts, usage });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ prompt, images: [], textParts: [], error: message });
    }
  }

  return NextResponse.json({ results, model });
}
