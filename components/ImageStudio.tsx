"use client";

import {
  AlertTriangle,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  LogIn,
  Plus,
  Sparkles,
} from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
} from "@/lib/cost-estimate";
import {
  appendDailyGeneration,
  loadDailyUsage,
  type DailyUsage,
} from "@/lib/daily-usage-storage";
import {
  fileToLocalReference,
  type LocalReferenceImage,
} from "@/lib/reference-image-files";
import { uploadReferenceFilesViaS3 } from "@/lib/reference-upload-client";
import { DailyUsagePill } from "@/components/DailyUsagePill";
import { EstimatedCostPopover } from "@/components/EstimatedCostPopover";
import { ReferenceImagesField } from "@/components/ReferenceImagesField";
import {
  GeneratedImageActions,
  slugFromPrompt,
} from "@/components/GeneratedImageActions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

type GoogleSearchMode = "off" | "web" | "web_image";

type ApiResult = {
  prompt: string;
  images: string[];
  textParts: string[];
  usage?: Record<string, unknown>;
  error?: string;
  /** True while this batch row is still waiting on the API */
  pending?: boolean;
};

type BatchPromptField = { id: string; value: string };

function newBatchField(value = ""): BatchPromptField {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, value };
}

/** Optional header/footer wrap each non-empty batch row for the API. */
function composeBatchRowPrompt(
  headerRaw: string,
  coreTrimmed: string,
  footerRaw: string,
): string {
  const h = headerRaw.trim();
  const f = footerRaw.trim();
  const parts: string[] = [];
  if (h) parts.push(h);
  if (coreTrimmed) parts.push(coreTrimmed);
  if (f) parts.push(f);
  return parts.join("\n\n");
}

type GenerateJsonBody = {
  error?: string;
  results?: ApiResult[];
};

/**
 * Vercel/proxies often return HTML or plain text for 413/504; `res.json()` then throws
 * and batch rows stay pending. Read text first and parse safely.
 */
async function readGenerateApiResponse(res: Response): Promise<{
  ok: boolean;
  status: number;
  data: GenerateJsonBody | null;
  parseError: string | null;
}> {
  const text = await res.text();
  if (!text.trim()) {
    return {
      ok: res.ok,
      status: res.status,
      data: null,
      parseError: `Empty response (HTTP ${res.status}).`,
    };
  }
  try {
    const data = JSON.parse(text) as GenerateJsonBody;
    return { ok: res.ok, status: res.status, data, parseError: null };
  } catch {
    const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
    return {
      ok: res.ok,
      status: res.status,
      data: null,
      parseError:
        preview.length > 0
          ? `Non-JSON response (HTTP ${res.status}): ${preview}${text.length > 120 ? "…" : ""}`
          : `Invalid response body (HTTP ${res.status}).`,
    };
  }
}

function humanizeGenerateFailure(
  status: number,
  parseError: string | null,
  apiError: string | undefined,
  statusText: string,
): string {
  if (apiError?.trim()) return apiError.trim();
  if (status === 413) {
    return "Request too large for the host (HTTP 413). Try fewer or smaller reference images, or compress uploads.";
  }
  if (status === 504) {
    return "Gateway timeout (HTTP 504). Try fewer references, a shorter prompt, or retry.";
  }
  if (parseError) return parseError;
  return statusText.trim() || `Request failed (HTTP ${status}).`;
}

const labelCls =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-500";
const fieldCls =
  "w-full rounded-xl border border-zinc-200/90 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none ring-0 transition placeholder:text-zinc-400 focus:border-emerald-500/50 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-100 dark:shadow-inner dark:shadow-black/20 dark:placeholder:text-zinc-600 dark:focus:border-emerald-400/45 dark:focus:bg-zinc-900/90 dark:focus:ring-emerald-500/20";
const panelCls =
  "rounded-2xl border border-zinc-200/80 bg-white/75 p-5 shadow-sm shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/40 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_20px_50px_-24px_rgba(0,0,0,0.5)]";
const sectionTitleCls =
  "mb-4 flex items-center gap-2 text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100";
const checkboxCls =
  "h-4 w-4 rounded border-zinc-300 bg-white text-emerald-600 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-900 dark:text-emerald-500 dark:focus:ring-emerald-500/30";

function SectionTitle({
  children,
  step,
}: {
  children: ReactNode;
  step: string;
}) {
  return (
    <h2 className={sectionTitleCls}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400 dark:ring-emerald-500/25">
        {step}
      </span>
      {children}
    </h2>
  );
}

export function ImageStudio() {
  const { data: session, status: sessionStatus } = useSession();
  const [modelId, setModelId] = useState<ImageModelId>(
    "gemini-3.1-flash-image-preview",
  );
  const [prompt, setPrompt] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchPromptFields, setBatchPromptFields] = useState<
    BatchPromptField[]
  >(() => [newBatchField()]);
  const [batchHeaderPrompt, setBatchHeaderPrompt] = useState("");
  const [batchFooterPrompt, setBatchFooterPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [imageSize, setImageSize] = useState<ImageSizeKey>("1K");
  const [referenceImages, setReferenceImages] = useState<LocalReferenceImage[]>(
    [],
  );
  const referenceImagesRef = useRef<LocalReferenceImage[]>([]);
  referenceImagesRef.current = referenceImages;

  /** After "Add prompt", focus the new textarea (cleared once handled). */
  const pendingFocusBatchFieldIdRef = useRef<string | null>(null);

  const [googleSearch, setGoogleSearch] = useState<GoogleSearchMode>("off");
  const [thinkingLevel, setThinkingLevel] = useState<"minimal" | "high">(
    "minimal",
  );
  const [includeThoughts, setIncludeThoughts] = useState(false);
  const [personGeneration, setPersonGeneration] = useState<string>("");
  const [temperature, setTemperature] = useState<string>("");
  const [seed, setSeed] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ApiResult[] | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage | null>(null);

  useEffect(() => {
    setDailyUsage(loadDailyUsage());
  }, []);

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

  useEffect(() => {
    if (!authGateOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAuthGateOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authGateOpen]);

  useLayoutEffect(() => {
    if (!batchMode) return;
    const id = pendingFocusBatchFieldIdRef.current;
    if (!id) return;
    pendingFocusBatchFieldIdRef.current = null;
    const el = document.getElementById(
      `batch-prompt-${id}`,
    ) as HTMLTextAreaElement | null;
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [batchMode, batchPromptFields]);

  const processReferencesBatch = useCallback(
    async (slots: LocalReferenceImage[]) => {
      if (slots.length === 0) return;
      const ids = new Set(slots.map((s) => s.id));

      setReferenceImages((prev) =>
        prev.map((r) =>
          ids.has(r.id)
            ? { ...r, uploadStatus: "uploading", uploadError: undefined }
            : r,
        ),
      );

      try {
        const files = await uploadReferenceFilesViaS3(
          slots.map((s) => ({ mimeType: s.mimeType, sourceFile: s.sourceFile })),
        );

        setReferenceImages((prev) =>
          prev.map((r) => {
            if (!ids.has(r.id)) return r;
            const idx = slots.findIndex((s) => s.id === r.id);
            const f = files[idx];
            if (!f) {
              return {
                ...r,
                uploadStatus: "error",
                uploadError: "Missing file in presign/upload response.",
              };
            }
            return {
              ...r,
              uploadStatus: "ready",
              fileUri: f.fileUri,
              uploadError: undefined,
            };
          }),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setReferenceImages((prev) =>
          prev.map((r) =>
            ids.has(r.id)
              ? { ...r, uploadStatus: "error", uploadError: msg }
              : r,
          ),
        );
      }
    },
    [],
  );

  function addReferenceFiles(source: FileList | File[] | null) {
    if (!source?.length) return;
    if (sessionStatus === "loading") return;
    if (!session?.user) {
      setAuthGateOpen(true);
      return;
    }
    const candidates = Array.from(source).filter((f) =>
      f.type.startsWith("image/"),
    );
    const processed: LocalReferenceImage[] = [];
    for (const file of candidates) {
      try {
        processed.push(fileToLocalReference(file));
      } catch {
        /* skip unreadable file */
      }
    }
    if (!processed.length) return;

    const prevCount = referenceImagesRef.current.length;
    const accepted: LocalReferenceImage[] = [];
    let i = 0;
    while (
      i < processed.length &&
      prevCount + accepted.length < maxReferenceImages
    ) {
      accepted.push(processed[i]);
      i++;
    }
    for (; i < processed.length; i++) {
      URL.revokeObjectURL(processed[i].preview);
    }
    if (!accepted.length) return;

    setReferenceImages((prev) => [...prev, ...accepted]);
    queueMicrotask(() => {
      void processReferencesBatch(accepted);
    });
  }

  function retryReferenceUpload(id: string) {
    if (sessionStatus === "loading") return;
    if (!session?.user) {
      setAuthGateOpen(true);
      return;
    }
    const slot = referenceImagesRef.current.find((r) => r.id === id);
    if (!slot || slot.uploadStatus === "ready") return;
    const nextSlot: LocalReferenceImage = {
      ...slot,
      uploadStatus: "pending",
      uploadError: undefined,
      fileUri: undefined,
    };
    setReferenceImages((prev) =>
      prev.map((r) => (r.id === id ? nextSlot : r)),
    );
    queueMicrotask(() => {
      void processReferencesBatch([nextSlot]);
    });
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

  const batchComposedPrompts = useMemo(() => {
    if (!batchMode) return [];
    return batchPromptFields
      .map((f) => {
        const core = f.value.trim();
        if (!core) return null;
        return composeBatchRowPrompt(
          batchHeaderPrompt,
          core,
          batchFooterPrompt,
        );
      })
      .filter((p): p is string => p !== null);
  }, [batchMode, batchHeaderPrompt, batchFooterPrompt, batchPromptFields]);

  const promptsToSend = batchMode
    ? batchComposedPrompts
    : [prompt.trim()].filter(Boolean);

  const cost = useMemo(() => {
    return estimateCost({
      modelId,
      promptText: prompt,
      batchPrompts: batchMode ? batchComposedPrompts : undefined,
      batchMode,
      imageSize: effectiveImageSizeForModel(modelId, imageSize),
      referenceImageCount: referenceImages.length,
      thinkingLevel,
      useGoogleSearch: googleSearch !== "off",
    });
  }, [
    modelId,
    prompt,
    batchMode,
    batchComposedPrompts,
    imageSize,
    referenceImages.length,
    thinkingLevel,
    googleSearch,
  ]);

  const referenceBlockGenerate =
    referenceImages.length > 0 &&
    referenceImages.some((r) => r.uploadStatus !== "ready");

  async function onGenerate() {
    setLastError(null);
    setResults(null);
    if (sessionStatus === "loading") return;
    if (!session?.user) {
      setAuthGateOpen(true);
      return;
    }
    if (referenceBlockGenerate) {
      const busy = referenceImages.some(
        (r) =>
          r.uploadStatus === "pending" || r.uploadStatus === "uploading",
      );
      setLastError(
        busy
          ? "Wait for reference images to finish uploading before generating."
          : "Remove failed reference images or tap Retry, then generate again.",
      );
      return;
    }
    if (batchMode) {
      if (promptsToSend.length === 0) {
        setLastError("Add at least one prompt (non-empty text box). ");
        return;
      }
    } else {
      const single = promptsToSend[0] ?? "";
      if (single.length < 200) {
        setLastError("Enter a prompt with at least 200 characters.");
        return;
      }
    }

    let promptsQueue: string[] = [];

    setLoading(true);
    try {
      promptsQueue = batchMode
        ? promptsToSend
        : [promptsToSend[0] ?? ""].filter(Boolean);

      const referenceFileRefs: { fileUri: string; mimeType: string }[] | undefined =
        referenceImages.length > 0
          ? referenceImages.map((r) => ({
              fileUri: r.fileUri as string,
              mimeType: r.mimeType,
            }))
          : undefined;

      const requestPayloadBase = {
        modelId,
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
        referenceFileRefs,
      };

      if (batchMode && promptsQueue.length > 0) {
        setResults(
          promptsQueue.map((p) => ({
            prompt: p,
            images: [],
            textParts: [],
            pending: true,
          })),
        );
      }

      const markBatchFailed = (
        failedIndex: number,
        failedPrompt: string,
        message: string,
      ) => {
        if (!batchMode) return;
        setResults((prev) => {
          if (!prev || prev.length !== promptsQueue.length) return prev;
          return prev.map((r, idx) => {
            if (idx === failedIndex) {
              return {
                prompt: failedPrompt,
                images: [],
                textParts: [],
                error: message,
                pending: false,
              };
            }
            if (idx > failedIndex && r.pending) {
              return {
                ...r,
                pending: false,
                error: "Skipped — a previous request failed.",
              };
            }
            return r;
          });
        });
      };

      const completedForBilling: ApiResult[] = [];

      for (let i = 0; i < promptsQueue.length; i++) {
        const p = promptsQueue[i];
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...requestPayloadBase,
            prompts: [p],
          }),
        });
        const { ok, status, data, parseError } =
          await readGenerateApiResponse(res);
        const failMessage = humanizeGenerateFailure(
          status,
          parseError,
          data?.error,
          res.statusText,
        );

        if (parseError !== null || !ok || !data) {
          setLastError(failMessage);
          markBatchFailed(i, p, failMessage);
          const imageCount = completedForBilling.reduce(
            (acc, r) => acc + (r.error ? 0 : r.images.length),
            0,
          );
          if (imageCount > 0 && promptsQueue.length > 0) {
            const promptsWithImages = completedForBilling.filter(
              (r) => r.images.length > 0,
            ).length;
            const cadToAdd =
              (cost.estimatedCadTotal / promptsQueue.length) *
              promptsWithImages;
            setDailyUsage(appendDailyGeneration(imageCount, cadToAdd));
          }
          return;
        }

        const raw = data.results?.[0];
        const row: ApiResult = raw
          ? { ...raw, pending: false }
          : {
              prompt: p,
              images: [],
              textParts: [],
              error: "Empty response",
              pending: false,
            };
        completedForBilling.push(row);

        if (batchMode) {
          setResults((prev) => {
            if (!prev || prev.length !== promptsQueue.length) {
              return prev;
            }
            const next = [...prev];
            next[i] = row;
            return next;
          });
        } else {
          setResults([row]);
        }
      }

      if (batchMode) {
        const imageCount = completedForBilling.reduce(
          (acc, r) => acc + (r.error ? 0 : r.images.length),
          0,
        );
        if (imageCount > 0 && promptsQueue.length > 0) {
          const promptsWithImages = completedForBilling.filter(
            (r) => r.images.length > 0,
          ).length;
          const cadToAdd =
            (cost.estimatedCadTotal / promptsQueue.length) * promptsWithImages;
          setDailyUsage(appendDailyGeneration(imageCount, cadToAdd));
        }
      } else {
        const row = completedForBilling[0];
        const imageCount = row
          ? row.error
            ? 0
            : row.images.length
          : 0;
        if (imageCount > 0) {
          setDailyUsage(
            appendDailyGeneration(imageCount, cost.estimatedCadTotal),
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      setResults((prev) => {
        if (!prev?.length || !prev.some((r) => r.pending)) return prev;
        return prev.map((r) =>
          r.pending ? { ...r, pending: false, error: msg } : r,
        );
      });
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

        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-950/40">
          <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
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
              className={checkboxCls}
            />
            <span>Batch mode — one text box per image request</span>
          </label>
        </div>

        {batchMode ? (
          <div className="space-y-4">
            <label className="block">
              <span className={labelCls}>Batch header (optional)</span>
              <textarea
                className={`${fieldCls} min-h-[80px] resize-y`}
                value={batchHeaderPrompt}
                onChange={(e) => setBatchHeaderPrompt(e.target.value)}
                placeholder="Added above each prompt when this field has text…"
              />
            </label>
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-500">
              Each box is one API call. Line breaks inside a box are fine.
              Optional header and footer wrap every non-empty prompt.
            </p>
            {batchPromptFields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-4 ring-1 ring-zinc-200/40 dark:border-zinc-800/90 dark:bg-black/25 dark:ring-white/[0.03]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-500">
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
                      className="text-[11px] font-medium text-red-600 transition hover:text-red-700 dark:text-red-400/90 dark:hover:text-red-300"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <textarea
                  id={`batch-prompt-${field.id}`}
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
            <button
              type="button"
              onClick={() => {
                const field = newBatchField();
                pendingFocusBatchFieldIdRef.current = field.id;
                setBatchPromptFields((prev) => [...prev, field]);
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300/90 bg-zinc-50/60 py-3 text-xs font-medium text-zinc-700 transition hover:border-emerald-400/55 hover:bg-emerald-50/50 dark:border-zinc-600/80 dark:bg-zinc-950/40 dark:text-zinc-200 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200 sm:w-auto sm:justify-start sm:px-4"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add prompt
            </button>
            <label className="block">
              <span className={labelCls}>Batch footer (optional)</span>
              <textarea
                className={`${fieldCls} min-h-[80px] resize-y`}
                value={batchFooterPrompt}
                onChange={(e) => setBatchFooterPrompt(e.target.value)}
                placeholder="Added below each prompt when this field has text…"
              />
            </label>
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

        <ReferenceImagesField
          batchMode={batchMode}
          maxReferenceImages={maxReferenceImages}
          images={referenceImages}
          onAddFiles={addReferenceFiles}
          onRemove={removeReferenceImage}
          onClearAll={clearReferenceImages}
          onRetryUpload={retryReferenceUpload}
          referenceSession={
            sessionStatus === "loading"
              ? "loading"
              : session?.user
                ? "signedIn"
                : "signedOut"
          }
          onRequireSignIn={() => setAuthGateOpen(true)}
        />
      </section>

      {/* Output settings */}
      <section className={panelCls}>
        <SectionTitle step="2">Output</SectionTitle>
        <p className="mb-4 rounded-lg border border-zinc-200/80 bg-zinc-50/90 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800/80 dark:bg-black/20 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-300">
            Response type:{" "}
          </span>
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
              <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800/80 dark:bg-zinc-950/50 dark:text-zinc-500">
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
      <details className={`${panelCls} group`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold tracking-tight text-zinc-800 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-200/80 text-[10px] font-bold text-zinc-600 ring-1 ring-zinc-300/80 dark:bg-zinc-700/50 dark:text-zinc-400 dark:ring-zinc-600/50">
              3
            </span>
            Advanced options
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180"
            strokeWidth={2}
          />
        </summary>
        <div className="mt-5 border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80">
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
                  className={checkboxCls}
                />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
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
                placeholder=""
                className={fieldCls}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Seed</span>
              <input
                type="number"
                placeholder=""
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

  const resultsSection =
    results && results.length > 0 ? (
      <section className="space-y-5">
        {results.map((r, i) => (
          <article
            key={`result-${i}`}
            className="overflow-hidden rounded-2xl border border-zinc-200/85 bg-white/80 shadow-lg shadow-zinc-900/10 ring-1 ring-zinc-200/50 dark:border-zinc-800/80 dark:bg-zinc-900/35 dark:shadow-xl dark:shadow-black/40 dark:ring-white/[0.04]"
          >
            <div className="border-b border-zinc-200/80 bg-zinc-50/90 px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-950/60">
              <p className="line-clamp-4 font-mono text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-500">
                {r.prompt}
              </p>
            </div>
            <div className="p-4">
              {r.pending ? (
                <div
                  className="flex min-h-[min(12rem,40vh)] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300/80 bg-zinc-50/80 py-10 dark:border-zinc-700/70 dark:bg-zinc-950/50"
                  aria-busy
                  aria-label="Generating image for this prompt"
                >
                  <Loader2
                    className="h-9 w-9 animate-spin text-emerald-600 dark:text-emerald-400"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Generating…
                  </p>
                </div>
              ) : (
                <>
                  {r.error ? (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {r.error}
                    </p>
                  ) : null}
                  {r.textParts.length > 0 ? (
                    <div className="mb-4 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-300">
                      {r.textParts.join("\n")}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-start justify-center gap-6">
                    {r.images.map((src, j) => (
                      <figure
                        key={j}
                        className="m-0 flex min-w-0 max-w-full flex-col items-center gap-2.5"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt=""
                          className="h-auto max-h-[min(28rem,70vh)] w-auto max-w-full object-contain rounded-xl border border-zinc-200/90 shadow-lg shadow-zinc-900/15 ring-1 ring-zinc-200/40 dark:border-zinc-700/50 dark:shadow-2xl dark:shadow-black/50 dark:ring-white/5"
                        />
                        <GeneratedImageActions
                          dataUrl={src}
                          filenameBase={`gemini-${i + 1}-img-${j + 1}-${slugFromPrompt(r.prompt)}`}
                        />
                      </figure>
                    ))}
                  </div>
                  {r.usage ? (
                    <pre className="mt-4 overflow-x-auto rounded-lg border border-zinc-200/80 bg-zinc-50 p-3 font-mono text-[11px] text-zinc-600 dark:border-zinc-800/80 dark:bg-black/40 dark:text-zinc-500">
                      {JSON.stringify(r.usage, null, 2)}
                    </pre>
                  ) : null}
                </>
              )}
            </div>
          </article>
        ))}
      </section>
    ) : null;

  const emptyOutput = (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300/90 bg-zinc-50/70 px-6 py-12 text-center dark:border-zinc-800/90 dark:bg-zinc-950/40">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/90 dark:bg-zinc-900/80 dark:ring-zinc-700/60">
        <ImageIcon
          className="h-7 w-7 text-zinc-400 dark:text-zinc-600"
          strokeWidth={1.25}
          aria-hidden
        />
      </div>
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
        No output yet
      </p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-500 dark:text-zinc-600">
        Generated images and any text from the model will show here.
      </p>
    </div>
  );

  const generateButton = (
    <button
      type="button"
      onClick={onGenerate}
      disabled={loading || referenceBlockGenerate}
      className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/25 transition hover:from-emerald-400 hover:via-emerald-500 hover:to-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-45 dark:shadow-emerald-950/40 dark:focus-visible:ring-emerald-400/50"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
          Generating…
        </>
      ) : (
        <>
          <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 opacity-0 transition group-hover:opacity-100" />
          <Sparkles className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2} />
          Generate images
        </>
      )}
    </button>
  );

  const errorBanner = lastError ? (
    <div
      role="alert"
      className="mb-3 flex gap-3 rounded-xl border border-red-200/90 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-md shadow-red-900/10 backdrop-blur-sm ring-1 ring-red-200/60 dark:border-red-500/35 dark:bg-red-950/50 dark:text-red-100 dark:shadow-lg dark:shadow-red-950/30 dark:ring-red-500/20"
    >
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
        strokeWidth={2}
        aria-hidden
      />
      <p className="min-w-0 flex-1 leading-relaxed">{lastError}</p>
    </div>
  ) : null;

  const actionFooter = (
    <div className="border-t border-zinc-200/85 bg-white/90 px-4 py-4 shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.6)] dark:supports-[backdrop-filter]:bg-zinc-950/75 sm:px-5">
      {errorBanner}
      {generateButton}
    </div>
  );

  const outputColumnHeader = (
    <div className="shrink-0 border-b border-zinc-200/80 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800/70 dark:bg-zinc-950/40 sm:px-5">
      <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Output
      </h2>
      <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-500">
        Previews and response metadata
      </p>
    </div>
  );

  const authGateDialog =
    authGateOpen ? (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm transition hover:bg-zinc-900/45 dark:bg-zinc-950/70 dark:hover:bg-zinc-950/75"
          aria-label="Close sign-in prompt"
          onClick={() => setAuthGateOpen(false)}
        />
        <div
          role="dialog"
          aria-modal
          aria-labelledby="auth-gate-title"
          className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-2xl shadow-zinc-900/15 ring-1 ring-zinc-200/60 backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/95 dark:shadow-black/50 dark:ring-white/[0.06]"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
            <LogIn
              className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>
          <h2
            id="auth-gate-title"
            className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Sign in to generate
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Generating images requires signing in with Google. Only accounts on
            the project owner&apos;s allowed list can use this app—if you are
            not on that list, sign-in may succeed but generation will still be
            blocked.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setAuthGateOpen(false)}
              className="rounded-xl border border-zinc-200/90 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-600/80 dark:bg-zinc-800/50 dark:text-zinc-200 dark:shadow-none dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:focus-visible:ring-emerald-400/50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthGateOpen(false);
                void signIn("google", {
                  callbackUrl:
                    typeof window !== "undefined" ? window.location.href : "/",
                });
              }}
              className="rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/25 transition hover:from-emerald-400 hover:via-emerald-500 hover:to-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 dark:shadow-emerald-950/30 dark:focus-visible:ring-emerald-400/50"
            >
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {authGateDialog}
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-zinc-50 dark:bg-zinc-950"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_100%_80%_at_50%_-30%,rgba(16,185,129,0.14),transparent_55%)] dark:bg-[radial-gradient(ellipse_100%_80%_at_50%_-30%,rgba(16,185,129,0.12),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_100%_0%,rgba(139,92,246,0.06),transparent_45%)] dark:bg-[radial-gradient(ellipse_60%_50%_at_100%_0%,rgba(139,92,246,0.08),transparent_45%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(59,130,246,0.04),transparent_50%)] dark:bg-[radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden
      />

      <div className="relative z-0 flex min-h-0 flex-1 flex-col">
        <header className="relative z-30 shrink-0 border-b border-zinc-200/80 bg-white/70 px-4 py-4 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/60 sm:px-6 sm:py-5">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900/60 dark:text-zinc-400 dark:shadow-none">
                <Sparkles
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  strokeWidth={2}
                />
                Gemini API
              </div>
              <h1 className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-600 bg-clip-text text-2xl font-semibold tracking-tight text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-500 sm:text-3xl">
                Gemini Image Studio
              </h1>
            </div>
            <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2">
              {dailyUsage ? <DailyUsagePill usage={dailyUsage} /> : null}
              <EstimatedCostPopover cost={cost} />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col xl:grid xl:grid-cols-12 xl:grid-rows-1 xl:min-h-0 xl:divide-x xl:divide-zinc-200/70 dark:xl:divide-zinc-800/60">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50/40 dark:bg-zinc-950/30 xl:col-span-7 xl:min-h-0">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-2 pt-3 sm:px-5 xl:py-4">
              <div className="mx-auto flex max-w-2xl flex-col gap-5 xl:mx-0 xl:max-w-none">
                {inputSections}
              </div>
              <div className="mx-auto mt-6 max-w-2xl xl:mt-0 xl:hidden">
                {outputColumnHeader}
                <div className="mt-3">{resultsSection ?? emptyOutput}</div>
              </div>
            </div>
            <div className="hidden shrink-0 xl:block">{actionFooter}</div>
          </div>
          <div className="hidden min-h-0 min-w-0 flex-col bg-zinc-50/25 dark:bg-zinc-950/20 xl:col-span-5 xl:col-start-8 xl:flex xl:min-h-0">
            {outputColumnHeader}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5">
              {resultsSection ?? emptyOutput}
            </div>
          </div>
          <div className="shrink-0 pb-[env(safe-area-inset-bottom)] xl:hidden">
            {actionFooter}
          </div>
        </div>
      </div>
    </div>
  );
}
