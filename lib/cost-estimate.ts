/**
 * Cost estimation uses:
 * - Output image token counts from https://ai.google.dev/gemini-api/docs/image-generation (tables, Mar 2026)
 * - USD/M token rates — approximate; confirm at https://ai.google.dev/gemini-api/docs/pricing
 * - CAD display: USD totals × USD_TO_CAD_APPROX (rough FX; Google bills in USD).
 */

import type { ImageModelId, ImageSizeKey } from "./models";

/** Approximate USD→CAD multiplier for showing prices in Canadian dollars (update occasionally). */
export const USD_TO_CAD_APPROX = 1.38;

/** Documented output image tokens per generated image (same for all aspect ratios in the official table). */
const OUTPUT_IMAGE_TOKENS_BY_SIZE: Record<ImageSizeKey, number> = {
  "512": 747,
  "1K": 1120,
  "2K": 1680,
  "4K": 2520,
};

/**
 * Approximate USD per 1M tokens (Developer API). Image output uses image-output rates where applicable.
 * Update when Google publishes new prices.
 */
const USD_PER_MILLION: Record<
  ImageModelId,
  { input: number; outputImage: number; outputText: number }
> = {
  "gemini-2.5-flash-image": {
    input: 0.15,
    outputImage: 60,
    outputText: 2.5,
  },
  "gemini-3-pro-image-preview": {
    input: 1.25,
    outputImage: 120,
    outputText: 12,
  },
  "gemini-3.1-flash-image-preview": {
    input: 0.25,
    outputImage: 60,
    outputText: 10,
  },
};

/** Rough input-token bump per reference image (not from official table). */
const APPROX_INPUT_TOKENS_PER_REF_IMAGE = 400;

function estimateInputTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export type CostEstimateInput = {
  modelId: ImageModelId;
  /** Single prompt, or ignored when batchPrompts is set. */
  promptText: string;
  /** When set, batch mode: one entry per line (empty lines ignored). */
  batchPrompts?: string[];
  /** True when UI is in batch mode (even before lines are filled). */
  batchMode?: boolean;
  imageSize: ImageSizeKey;
  /** With reference images, API uses TEXT+IMAGE response modalities (rough text output estimate). */
  referenceImageCount: number;
  /** Thinking increases billed tokens; multiplier is a rough guide only. */
  thinkingLevel: "minimal" | "high";
  useGoogleSearch: boolean;
};

export type CostEstimate = {
  requestCount: number;
  estimatedInputTokensPerRequest: number;
  outputImageTokensPerImage: number;
  estimatedOutputTextTokensPerRequest: number;
  /** Per-request USD (excluding uncertain surcharges). */
  estimatedUsdPerRequest: number;
  /** Total for all requests in the run. */
  estimatedUsdTotal: number;
  /** Same as USD fields, scaled for CAD display. */
  estimatedCadPerRequest: number;
  estimatedCadTotal: number;
  /** True when reference images imply TEXT+IMAGE modalities. */
  usesTextAndImageModality: boolean;
  notes: string[];
};

export function estimateCost(params: CostEstimateInput): CostEstimate {
  const rates = USD_PER_MILLION[params.modelId];

  const batch = params.batchPrompts?.filter((s) => s.trim().length > 0) ?? [];
  const isBatch = params.batchMode === true;
  const requestCount = isBatch ? batch.length : 1;

  let estimatedInputTokensPerRequest =
    batch.length > 0
      ? Math.max(
          1,
          Math.ceil(
            batch.reduce((sum, line) => sum + estimateInputTokens(line), 0) /
              batch.length,
          ),
        )
      : estimateInputTokens(params.promptText);

  const refCount = Math.max(0, params.referenceImageCount);
  estimatedInputTokensPerRequest +=
    refCount * APPROX_INPUT_TOKENS_PER_REF_IMAGE;

  const size: ImageSizeKey =
    params.modelId === "gemini-2.5-flash-image" ? "1K" : params.imageSize;

  const outputImageTokensPerImage = OUTPUT_IMAGE_TOKENS_BY_SIZE[size];

  const thinkingMultiplier =
    params.thinkingLevel === "high" &&
    params.modelId !== "gemini-2.5-flash-image"
      ? 1.12
      : 1;

  const usesTextAndImageModality = refCount > 0;
  const estimatedOutputTextTokensPerRequest = usesTextAndImageModality
    ? 120
    : 0;

  const inputUsd =
    (estimatedInputTokensPerRequest / 1_000_000) * rates.input;
  const imageUsd =
    (outputImageTokensPerImage / 1_000_000) *
    rates.outputImage *
    thinkingMultiplier;
  const textUsd =
    (estimatedOutputTextTokensPerRequest / 1_000_000) * rates.outputText;

  let estimatedUsdPerRequest = inputUsd + imageUsd + textUsd;

  const notes: string[] = [
    `Token rates are in USD on Google’s pricing page; CAD here ≈ USD × ${USD_TO_CAD_APPROX}.`,
    `Output image tokens (${size}): ${outputImageTokensPerImage} per generated image (docs table).`,
    usesTextAndImageModality
      ? "Reference images: response uses TEXT+IMAGE modalities (estimated)."
      : "Text-only prompt: response uses IMAGE-only output (estimated).",
    `Rates are approximate; verify on the pricing page.`,
  ];

  if (refCount > 0) {
    notes.push(
      `Reference images: +~${refCount * APPROX_INPUT_TOKENS_PER_REF_IMAGE} input tokens (rough).`,
    );
  }

  if (params.useGoogleSearch) {
    notes.push(
      "Google Search grounding may add billed search/tool tokens not included in this estimate.",
    );
  }

  if (isBatch && batch.length > 1) {
    notes.push(
      "Batch mode runs one interactive generateContent call per prompt (no separate Batch API discount).",
    );
  }

  if (thinkingMultiplier > 1) {
    notes.push(
      "High thinking: applied ~12% uplift on image output charge; thinking tokens are billed separately in practice.",
    );
  }

  estimatedUsdPerRequest =
    Math.round(estimatedUsdPerRequest * 1_000_000) / 1_000_000;
  const estimatedUsdTotal =
    requestCount === 0
      ? 0
      : Math.round(estimatedUsdPerRequest * requestCount * 1_000_000) /
        1_000_000;

  const estimatedCadPerRequest =
    Math.round(estimatedUsdPerRequest * USD_TO_CAD_APPROX * 1_000_000) /
    1_000_000;
  const estimatedCadTotal =
    requestCount === 0
      ? 0
      : Math.round(estimatedUsdTotal * USD_TO_CAD_APPROX * 1_000_000) /
        1_000_000;

  return {
    requestCount,
    estimatedInputTokensPerRequest,
    outputImageTokensPerImage,
    estimatedOutputTextTokensPerRequest,
    estimatedUsdPerRequest,
    estimatedUsdTotal,
    estimatedCadPerRequest,
    estimatedCadTotal,
    usesTextAndImageModality,
    notes,
  };
}

export function effectiveImageSizeForModel(
  modelId: ImageModelId,
  selected: ImageSizeKey,
): ImageSizeKey {
  if (modelId === "gemini-2.5-flash-image") return "1K";
  if (modelId === "gemini-3-pro-image-preview" && selected === "512")
    return "1K";
  return selected;
}
