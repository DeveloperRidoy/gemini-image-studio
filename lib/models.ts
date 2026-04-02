/** Gemini image models — see https://ai.google.dev/gemini-api/docs/image-generation */

export const IMAGE_MODELS = [
  {
    id: "gemini-2.5-flash-image",
    /** Shown first in the model dropdown (community nickname). */
    selectLabel: "Nano Banana",
    label: "Gemini 2.5 Flash Image",
    apiId: "gemini-2.5-flash-image",
    supportsImageSize: false,
    supports512: false,
    supportsThinking: false,
    supportsWebGrounding: false,
    supportsImageGrounding: false,
    /** generateContent candidateCount — not supported on image models (API 400). */
    supportsCandidateCount: false,
    /** Doc: works best with up to 3 images as input. */
    maxReferenceImages: 3,
  },
  {
    id: "gemini-3-pro-image-preview",
    selectLabel: "Nano BananaPro",
    label: "Gemini 3 Pro Image",
    apiId: "gemini-3-pro-image-preview",
    supportsImageSize: true,
    supports512: false,
    supportsThinking: true,
    supportsWebGrounding: true,
    supportsImageGrounding: false,
    supportsCandidateCount: false,
    /** Doc: up to 14 reference images in a workflow for Gemini 3 image models. */
    maxReferenceImages: 14,
  },
  {
    id: "gemini-3.1-flash-image-preview",
    selectLabel: "Nano Banana 2",
    label: "Gemini 3.1 Flash Image",
    apiId: "gemini-3.1-flash-image-preview",
    supportsImageSize: true,
    supports512: true,
    supportsThinking: true,
    supportsWebGrounding: true,
    supportsImageGrounding: true,
    supportsCandidateCount: false,
    maxReferenceImages: 14,
  },
] as const;

export type ImageModelId = (typeof IMAGE_MODELS)[number]["id"];

export function getModelDef(id: string) {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[2];
}

/**
 * Shared table for Gemini 2.5 Flash Image and Gemini 3 Pro Image Preview
 * (official aspect ratio tables — no 1:4, 4:1, 1:8, 8:1; those are 3.1 Flash only).
 */
const ASPECT_RATIOS_FLASH25_AND_3PRO = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

export const ASPECT_RATIOS_25 = ASPECT_RATIOS_FLASH25_AND_3PRO;
export const ASPECT_RATIOS_3_PRO = ASPECT_RATIOS_FLASH25_AND_3PRO;

/**
 * Gemini 3.1 Flash Image Preview — full table including 1:4, 4:1, 1:8, 8:1.
 */
export const ASPECT_RATIOS_31_FLASH = [
  ...ASPECT_RATIOS_FLASH25_AND_3PRO,
  "1:4",
  "4:1",
  "1:8",
  "8:1",
] as const;

export type AspectRatio =
  | (typeof ASPECT_RATIOS_25)[number]
  | (typeof ASPECT_RATIOS_31_FLASH)[number];

export type ImageSizeKey = "512" | "1K" | "2K" | "4K";

export const IMAGE_SIZE_OPTIONS: { value: ImageSizeKey; label: string }[] = [
  { value: "512", label: "512 (0.5K) — Gemini 3.1 Flash only" },
  { value: "1K", label: "1K (default)" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
];

/** Aspect ratio options for the selected model (must match API tables per model). */
export function aspectRatiosForModel(modelId: ImageModelId): readonly string[] {
  if (modelId === "gemini-2.5-flash-image") return ASPECT_RATIOS_25;
  if (modelId === "gemini-3-pro-image-preview") return ASPECT_RATIOS_3_PRO;
  return ASPECT_RATIOS_31_FLASH;
}
