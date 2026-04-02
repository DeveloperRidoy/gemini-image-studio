"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  IMAGE_MODELS,
  IMAGE_SIZE_OPTIONS,
  aspectRatiosForModel,
  getModelDef,
  type ImageModelId,
  type ImageSizeKey,
} from "@/lib/models";
import {
  estimateCost,
  effectiveImageSizeForModel,
  USD_TO_CAD_APPROX,
} from "@/lib/cost-estimate";

type GoogleSearchMode = "off" | "web" | "web_image";

type ApiResult = {
  prompt: string;
  images: string[];
  textParts: string[];
  usage?: Record<string, unknown>;
  error?: string;
};

type BatchPromptField = { id: string; value: string };

function newBatchField(value = ""): BatchPromptField {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, value };
}

type LocalReferenceImage = {
  id: string;
  preview: string;
  mimeType: string;
  data: string;
};

function readFileAsReference(file: File): Promise<{
  mimeType: string;
  data: string;
  preview: string;
}> {
  return new Promise((resolve, reject) => {
    const preview = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({
        mimeType: file.type || "image/png",
        data: base64,
        preview,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const labelCls =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500";
const fieldCls =
  "w-full rounded-xl border border-zinc-700/60 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 shadow-inner shadow-black/20 outline-none ring-0 transition placeholder:text-zinc-600 focus:border-emerald-400/45 focus:bg-zinc-900/90 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40";
const panelCls =
  "rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_20px_50px_-24px_rgba(0,0,0,0.5)] backdrop-blur-xl";
const sectionTitleCls =
  "mb-4 flex items-center gap-2 text-[13px] font-semibold tracking-tight text-zinc-100";

const XL_MEDIA = "(min-width: 1280px)";

function SectionTitle({
  children,
  step,
}: {
  children: ReactNode;
  step: string;
}) {
  return (
    <h2 className={sectionTitleCls}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/25">
        {step}
      </span>
      {children}
    </h2>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function ImageStudio() {
  const [modelId, setModelId] = useState<ImageModelId>(
    "gemini-3.1-flash-image-preview",
  );
  const [prompt, setPrompt] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchPromptFields, setBatchPromptFields] = useState<
    BatchPromptField[]
  >(() => [newBatchField()]);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [imageSize, setImageSize] = useState<ImageSizeKey>("1K");
  const [referenceImages, setReferenceImages] = useState<LocalReferenceImage[]>(
    [],
  );
  const referenceImagesRef = useRef<LocalReferenceImage[]>([]);
  referenceImagesRef.current = referenceImages;

  const [googleSearch, setGoogleSearch] = useState<GoogleSearchMode>("off");
  const [thinkingLevel, setThinkingLevel] = useState<"minimal" | "high">(
    "minimal",
  );
  const [includeThoughts, setIncludeThoughts] = useState(false);
  const [personGeneration, setPersonGeneration] = useState<string>("");
  const [temperature, setTemperature] = useState<string>("");
  const [seed, setSeed] = useState<string>("");
  const [batchApiDiscount, setBatchApiDiscount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ApiResult[] | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const isXl = useMediaQuery(XL_MEDIA);

  const def = getModelDef(modelId);
  const aspectOptions = aspectRatiosForModel(modelId);
  const maxReferenceImages = def.maxReferenceImages;

  useEffect(() => {
    setAspectRatio((ar) => {
      const opts = aspectRatiosForModel(modelId);
      if (!(opts as readonly string[]).includes(ar)) {
        return "1:1";
      }
      return ar;
    });
  }, [modelId]);

  useEffect(() => {
    const max = getModelDef(modelId).maxReferenceImages;
    setReferenceImages((prev) => {
      if (prev.length <= max) return prev;
      const dropped = prev.slice(max);
      dropped.forEach((r) => URL.revokeObjectURL(r.preview));
      return prev.slice(0, max);
    });
  }, [modelId]);

  useEffect(() => {
    return () => {
      referenceImagesRef.current.forEach((r) => URL.revokeObjectURL(r.preview));
    };
  }, []);

  async function addReferenceFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const added: LocalReferenceImage[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) continue;
      if (referenceImages.length + added.length >= maxReferenceImages) break;
      try {
        const { mimeType, data, preview } = await readFileAsReference(file);
        added.push({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
          mimeType,
          data,
          preview,
        });
      } catch {
        /* skip unreadable file */
      }
    }
    if (!added.length) return;
    setReferenceImages((prev) =>
      [...prev, ...added].slice(0, maxReferenceImages),
    );
  }

  function removeReferenceImage(id: string) {
    setReferenceImages((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((r) => r.id !== id);
    });
  }

  function clearReferenceImages() {
    setReferenceImages((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.preview));
      return [];
    });
  }

  const batchValues = useMemo(
    () => batchPromptFields.map((f) => f.value),
    [batchPromptFields],
  );

  const promptsToSend = batchMode
    ? batchPromptFields.map((f) => f.value.trim()).filter((p) => p.length > 0)
    : [prompt.trim()].filter(Boolean);

  const cost = useMemo(() => {
    return estimateCost({
      modelId,
      promptText: prompt,
      batchPrompts: batchMode ? batchValues : undefined,
      batchMode,
      imageSize: effectiveImageSizeForModel(modelId, imageSize),
      referenceImageCount: referenceImages.length,
      thinkingLevel,
      useGoogleSearch: googleSearch !== "off",
      batchApiDiscount,
    });
  }, [
    modelId,
    prompt,
    batchMode,
    batchValues,
    imageSize,
    referenceImages.length,
    thinkingLevel,
    googleSearch,
    batchApiDiscount,
  ]);

  async function onGenerate() {
    setLastError(null);
    setResults(null);
    if (promptsToSend.length < 200) {
      setLastError(
        batchMode
          ? "Add at least one prompt (non-empty text box). "
          : "Enter a prompt with at least 200 characters.",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          prompts: promptsToSend,
          aspectRatio,
          imageSize: def.supportsImageSize
            ? effectiveImageSizeForModel(modelId, imageSize)
            : undefined,
          googleSearch,
          thinkingLevel,
          includeThoughts,
          personGeneration: personGeneration || undefined,
          temperature: temperature === "" ? undefined : Number(temperature),
          seed: seed === "" ? undefined : Number(seed),
          referenceImages:
            referenceImages.length > 0
              ? referenceImages.map((r) => ({
                  mimeType: r.mimeType,
                  data: r.data,
                }))
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLastError(data.error ?? res.statusText);
        return;
      }
      setResults(data.results as ApiResult[]);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  } 

  const inputSections = (
    <>
      <section className={panelCls}>
        <SectionTitle step="1">Model &amp; prompt</SectionTitle>

        <label className="mb-5 block">
          <span className={labelCls}>Model</span>
          <select
            className={fieldCls}
            value={modelId}
            onChange={(e) => {
              setModelId(e.target.value as ImageModelId);
              setAspectRatio("1:1");
              setGoogleSearch("off");
              if (
                e.target.value === "gemini-3-pro-image-preview" &&
                imageSize === "512"
              ) {
                setImageSize("1K");
              }
            }}
          >
            {IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.selectLabel} ({m.apiId})
              </option>
            ))}
          </select>
        </label>

        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={batchMode}
              onChange={(e) => {
                const on = e.target.checked;
                if (on) {
                  setBatchPromptFields([newBatchField(prompt)]);
                } else {
                  const first = batchPromptFields.find((f) => f.value.trim());
                  if (first) {
                    setPrompt(first.value.trim());
                  }
                }
                setBatchMode(on);
              }}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
            />
            <span>Batch mode — one text box per image request</span>
          </label>
        </div>

        {batchMode ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-relaxed text-zinc-500">
                Each box is one API call. Line breaks inside a box are fine.
              </p>
              <button
                type="button"
                onClick={() =>
                  setBatchPromptFields((prev) => [...prev, newBatchField()])
                }
                className="shrink-0 rounded-lg border border-zinc-600/80 bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200"
              >
                + Add prompt
              </button>
            </div>
            {batchPromptFields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-xl border border-zinc-800/90 bg-black/25 p-4 ring-1 ring-white/[0.03]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Prompt {index + 1}
                  </span>
                  {batchPromptFields.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setBatchPromptFields((prev) =>
                          prev.length <= 1
                            ? prev
                            : prev.filter((f) => f.id !== field.id),
                        )
                      }
                      className="text-[11px] font-medium text-red-400/90 transition hover:text-red-300"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <textarea
                  className={`${fieldCls} min-h-[120px] resize-y`}
                  value={field.value}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBatchPromptFields((prev) =>
                      prev.map((f) =>
                        f.id === field.id ? { ...f, value: v } : f,
                      ),
                    );
                  }}
                  placeholder="Describe the image you want…"
                />
              </div>
            ))}
          </div>
        ) : (
          <label className="block">
            <span className={labelCls}>Prompt</span>
            <textarea
              className={`${fieldCls} min-h-[140px] resize-y`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want…"
            />
          </label>
        )}

        <div className="mt-6 border-t border-zinc-800/80 pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Reference images (optional)
            </span>
            {referenceImages.length > 0 ? (
              <button
                type="button"
                onClick={clearReferenceImages}
                className="text-[11px] font-medium text-zinc-500 hover:text-zinc-300"
              >
                Clear all
              </button>
            ) : null}
          </div>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">
            Upload images to edit, compose, or use as style references. Response
            modalities are set automatically (image-only for text-only prompts;
            text+image when references are present). Up to {maxReferenceImages}{" "}
            images for this model.
            {batchMode
              ? " In batch mode, the same references are sent with every prompt."
              : ""}
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            id="ref-images-input"
            onChange={(e) => {
              void addReferenceFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <label
            htmlFor="ref-images-input"
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-600/80 bg-zinc-950/40 px-4 py-8 text-center transition hover:border-emerald-500/40 hover:bg-emerald-500/5"
          >
            <span className="text-sm text-zinc-300">
              Click to upload or drop images
            </span>
            <span className="mt-1 text-[11px] text-zinc-600">
              PNG, JPEG, WebP… · {referenceImages.length}/{maxReferenceImages}
            </span>
          </label>
          {referenceImages.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {referenceImages.map((r) => (
                <div
                  key={r.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.preview}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeReferenceImage(r.id)}
                    className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Remove image"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Output settings */}
      <section className={panelCls}>
        <SectionTitle step="2">Output</SectionTitle>
        <p className="mb-4 rounded-lg border border-zinc-800/80 bg-black/20 px-3 py-2 text-xs text-zinc-400">
          <span className="font-medium text-zinc-300">Response type: </span>
          {referenceImages.length > 0
            ? "TEXT + IMAGE (reference images attached — model may include short text)."
            : "IMAGE-focused output for text-only prompts."}
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Aspect ratio</span>
            <select
              className={fieldCls}
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
            >
              {aspectOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelCls}>Output size</span>
            {def.supportsImageSize ? (
              <select
                className={fieldCls}
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value as ImageSizeKey)}
              >
                {IMAGE_SIZE_OPTIONS.filter((opt) =>
                  def.supports512 ? true : opt.value !== "512",
                ).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-500">
                Fixed ~1024px (1K tier). This model does not expose 2K/4K like
                Gemini 3 image models.
              </div>
            )}
          </label>

          <label className="block">
            <span className={labelCls}>Google Search</span>
            <select
              className={fieldCls}
              value={googleSearch}
              onChange={(e) =>
                setGoogleSearch(e.target.value as GoogleSearchMode)
              }
              disabled={!def.supportsWebGrounding}
            >
              <option value="off">Off</option>
              <option value="web" disabled={!def.supportsWebGrounding}>
                Web search
              </option>
              <option value="web_image" disabled={!def.supportsImageGrounding}>
                Web + Image (Gemini 3.1 Flash)
              </option>
            </select>
          </label>
        </div>
      </section>

      {/* Advanced — collapsed by default */}
      <details className={panelCls}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold tracking-tight text-zinc-200 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-700/50 text-[10px] font-bold text-zinc-400 ring-1 ring-zinc-600/50">
              3
            </span>
            Advanced options
          </span>
          <span className="text-zinc-500">▼</span>
        </summary>
        <div className="mt-5 border-t border-zinc-800/80 pt-5">
          {def.supportsThinking ? (
            <div className="mb-5 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>Thinking</span>
                <select
                  className={fieldCls}
                  value={thinkingLevel}
                  onChange={(e) =>
                    setThinkingLevel(e.target.value as "minimal" | "high")
                  }
                >
                  <option value="minimal">Minimal — faster</option>
                  <option value="high">High — more reasoning</option>
                </select>
              </label>
              <label className="flex cursor-pointer items-end gap-3 pb-1 sm:pb-2">
                <input
                  type="checkbox"
                  checked={includeThoughts}
                  onChange={(e) => setIncludeThoughts(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                />
                <span className="text-sm text-zinc-400">
                  Include thought parts in response (still billed)
                </span>
              </label>
            </div>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className={labelCls}>People</span>
              <select
                className={fieldCls}
                value={personGeneration}
                onChange={(e) => setPersonGeneration(e.target.value)}
              >
                <option value="">Default</option>
                <option value="ALLOW_ALL">ALLOW_ALL</option>
                <option value="ALLOW_ADULT">ALLOW_ADULT</option>
                <option value="ALLOW_NONE">ALLOW_NONE</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Temperature</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                placeholder="—"
                className={fieldCls}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Seed</span>
              <input
                type="number"
                placeholder="—"
                className={fieldCls}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </label>
          </div>
        </div>
      </details>
    </>
  );

  const estimatedCostCard = (
    <div
      className={`${panelCls} border-emerald-500/25 bg-gradient-to-b from-emerald-950/30 via-zinc-900/35 to-zinc-950/50 ring-1 ring-emerald-500/10`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-sm text-emerald-400 ring-1 ring-emerald-500/20"
          aria-hidden
        >
          ◈
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
            Estimated cost
          </h2>
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Indicative only
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">
        Not a bill. Amounts are approximate{" "}
        <span className="text-zinc-400">CAD</span> (USD rates ×{" "}
        {USD_TO_CAD_APPROX}
        ). Google bills in USD — verify on{" "}
        <a
          className="text-emerald-400/90 underline decoration-emerald-500/25 underline-offset-2 hover:text-emerald-300"
          href="https://ai.google.dev/gemini-api/docs/pricing"
          target="_blank"
          rel="noreferrer"
        >
          pricing
        </a>
        .
      </p>
      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-3 border-b border-zinc-800/60 pb-2">
          <dt className="text-zinc-500">Est. modalities</dt>
          <dd className="text-right text-xs text-zinc-300">
            {cost.usesTextAndImageModality ? "TEXT + IMAGE" : "IMAGE"}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-zinc-800/60 pb-2">
          <dt className="text-zinc-500">API calls</dt>
          <dd className="font-mono text-zinc-200">{cost.requestCount}</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-zinc-800/60 pb-2">
          <dt className="text-zinc-500">Input tok / call</dt>
          <dd className="font-mono text-zinc-200">
            {cost.estimatedInputTokensPerRequest}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-zinc-800/60 pb-2">
          <dt className="text-zinc-500">Image out tok / image</dt>
          <dd className="font-mono text-zinc-200">
            {cost.outputImageTokensPerImage}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-zinc-800/60 pb-2">
          <dt className="text-zinc-500">~CAD / call</dt>
          <dd className="font-mono tabular-nums text-emerald-400/95">
            CA${cost.estimatedCadPerRequest.toFixed(4)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 pt-1 font-medium">
          <dt className="text-zinc-300">~Total CAD</dt>
          <dd className="font-mono text-lg tabular-nums text-emerald-300">
            CA${cost.estimatedCadTotal.toFixed(4)}
          </dd>
        </div>
      </dl>
      <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-800/60 bg-black/25 p-3 text-xs text-zinc-400 transition hover:border-zinc-700/80">
        <input
          type="checkbox"
          checked={batchApiDiscount}
          onChange={(e) => setBatchApiDiscount(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500"
        />
        <span>Assume Batch API ~50% token discount</span>
      </label>
      <ul className="mt-4 space-y-2 border-t border-zinc-800/60 pt-4 text-[11px] leading-relaxed text-zinc-500">
        {cost.notes.map((n) => (
          <li key={n} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const resultsSection =
    results && results.length > 0 ? (
      <section className="space-y-5">
        {results.map((r, i) => (
          <article
            key={`${i}-${r.prompt.slice(0, 32)}`}
            className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/35 shadow-xl shadow-black/40 ring-1 ring-white/[0.04]"
          >
            <div className="border-b border-zinc-800/80 bg-zinc-950/60 px-4 py-3">
              <p className="line-clamp-4 font-mono text-[11px] leading-relaxed text-zinc-500">
                {r.prompt}
              </p>
            </div>
            <div className="p-4">
              {r.error ? (
                <p className="text-sm text-red-400">{r.error}</p>
              ) : null}
              {r.textParts.length > 0 ? (
                <div className="mb-4 whitespace-pre-wrap text-sm text-zinc-300">
                  {r.textParts.join("\n")}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-4">
                {r.images.map((src, j) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={j}
                    src={src}
                    alt=""
                    className="max-h-[min(28rem,70vh)] w-auto rounded-xl border border-zinc-700/50 shadow-2xl shadow-black/50 ring-1 ring-white/5"
                  />
                ))}
              </div>
              {r.usage ? (
                <pre className="mt-4 overflow-x-auto rounded-lg border border-zinc-800/80 bg-black/40 p-3 font-mono text-[11px] text-zinc-500">
                  {JSON.stringify(r.usage, null, 2)}
                </pre>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    ) : null;

  const emptyOutput = (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800/90 bg-zinc-950/40 px-6 py-12 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-zinc-900/80 ring-1 ring-zinc-700/60">
        <svg
          className="h-7 w-7 text-zinc-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.25}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-400">No output yet</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-600">
        Generated images and any text from the model will show here.
      </p>
    </div>
  );

  const generateButton = (
    <button
      type="button"
      onClick={onGenerate}
      disabled={loading}
      className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:from-emerald-400 hover:via-emerald-500 hover:to-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {loading ? (
        <>
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Generating…
        </>
      ) : (
        <>
          <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 opacity-0 transition group-hover:opacity-100" />
          Generate images
        </>
      )}
    </button>
  );

  const errorBanner = lastError ? (
    <div
      role="alert"
      className="mb-3 flex gap-3 rounded-xl border border-red-500/35 bg-red-950/50 px-4 py-3 text-sm text-red-100 shadow-lg shadow-red-950/30 backdrop-blur-sm ring-1 ring-red-500/20"
    >
      <svg
        className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <p className="min-w-0 flex-1 leading-relaxed">{lastError}</p>
    </div>
  ) : null;

  const actionFooter = (
    <div className="border-t border-zinc-800/80 bg-zinc-950/90 px-4 py-4 shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/75 sm:px-5">
      {errorBanner}
      {generateButton}
    </div>
  );

  const outputColumnHeader = (
    <div className="shrink-0 border-b border-zinc-800/70 bg-zinc-950/40 px-4 py-3 sm:px-5">
      <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
        Output
      </h2>
      <p className="mt-0.5 text-[11px] text-zinc-500">
        Previews and response metadata
      </p>
    </div>
  );

  return (
    <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-zinc-950"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_100%_80%_at_50%_-30%,rgba(16,185,129,0.12),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_100%_0%,rgba(139,92,246,0.08),transparent_45%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden
      />

      <div className="relative z-0 flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-zinc-800/60 bg-zinc-950/60 px-4 py-4 backdrop-blur-md sm:px-6 sm:py-5">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-zinc-700/50 bg-zinc-900/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]" />
                Gemini API
              </div>
              <h1 className="bg-gradient-to-br from-white via-zinc-100 to-zinc-500 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
                Gemini Image Studio
              </h1>
            </div>
            <p className="max-w-xl text-xs leading-relaxed text-zinc-500 sm:text-right sm:text-sm">
              Generate with the{" "}
              <a
                className="text-emerald-400/90 underline decoration-emerald-500/30 underline-offset-2 transition hover:text-emerald-300"
                href="https://ai.google.dev/gemini-api/docs/image-generation"
                target="_blank"
                rel="noreferrer"
              >
                Gemini API
              </a>
              . Set{" "}
              <code className="rounded-md border border-zinc-700/80 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[11px] text-emerald-200/90 sm:text-[12px]">
                GOOGLE_GENERATIVE_AI_API_KEY
              </code>{" "}
              in{" "}
              <code className="rounded-md border border-zinc-700/80 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300 sm:text-[12px]">
                .env.local
              </code>
              .
            </p>
          </div>
        </header>

        {isXl ? (
          <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-12 divide-x divide-zinc-800/60">
            <div className="col-span-5 flex min-h-0 flex-col bg-zinc-950/30">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-5">{inputSections}</div>
              </div>
              {actionFooter}
            </div>
            <aside className="col-span-3 min-h-0 overflow-y-auto overscroll-y-contain bg-zinc-950/25 px-4 py-4 sm:px-5">
              {estimatedCostCard}
            </aside>
            <div className="col-span-4 flex min-h-0 flex-col bg-zinc-950/20">
              {outputColumnHeader}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5">
                {resultsSection ?? emptyOutput}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-2 pt-3 sm:px-5">
              <div className="mx-auto flex max-w-2xl flex-col gap-5">
                <div className="flex flex-col gap-5">{inputSections}</div>
                {estimatedCostCard}
                <div>
                  {outputColumnHeader}
                  <div className="mt-3">{resultsSection ?? emptyOutput}</div>
                </div>
              </div>
            </div>
            <div className="pb-[env(safe-area-inset-bottom)]">
              {actionFooter}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
