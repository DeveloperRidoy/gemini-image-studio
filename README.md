# Gemini Image Studio

A full-height **Next.js** web app for generating and editing images with Google’s **Gemini API** (`@google/genai`). It wraps `generateContent` for image-capable models, exposes model-specific options (aspect ratio, resolution, grounding, thinking), and shows **approximate cost estimates in CAD** before you run a job.

---

## Features

| Area                 | Details                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Models**           | Gemini 2.5 Flash Image, Gemini 3 Pro Image (preview), Gemini 3.1 Flash Image (preview). Each entry in `lib/models.ts` has a short `selectLabel` for the dropdown plus the real `apiId` in parentheses.     |
| **Prompts**          | Single prompt or **batch mode** (one API request per non-empty prompt box).                                                                                                                                |
| **Reference images** | Optional uploads (base64 to the API). Model caps enforced (e.g. 3 for 2.5 Flash, 14 for Gemini 3.x image models). With references, the API uses **TEXT + IMAGE** response modalities.                      |
| **Output**           | Aspect ratio per official tables; output size **512 / 1K / 2K / 4K** where the model supports it (512 only on 3.1 Flash).                                                                                  |
| **Grounding**        | **Google Search** off, web-only, or web + image search (where supported—image search on Gemini 3.1 Flash only).                                                                                            |
| **Advanced**         | Thinking level, optional thought parts in the response, person-generation policy, temperature, seed—when the model supports them.                                                                          |
| **Cost**             | Client-side estimate from token tables + USD/M rates in `lib/cost-estimate.ts`, shown as **CAD** via `USD_TO_CAD_APPROX`. Not a bill; Google prices in USD.                                                |
| **UI**               | **≥1280px (`xl`)**: three columns—scrollable inputs, estimated cost, scrollable output. **&lt;1280px**: stacked layout with a fixed bottom bar for validation errors + **Generate** (inputs scroll above). |

---

## Tech stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router), React 19
- **SDK**: [`@google/genai`](https://www.npmjs.com/package/@google/genai) — `GoogleGenAI`, `generateContent`, `ThinkingLevel`, `imageConfig`, tools for Google Search
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (`@import "tailwindcss"` in `app/globals.css`)
- **Fonts**: [Geist](https://vercel.com/font) via `next/font/google` in `app/layout.tsx`
- **Language**: TypeScript

---

## Project structure

```text
app/
  layout.tsx          # Root layout, dark theme, Geist fonts
  page.tsx            # Renders <ImageStudio />
  globals.css         # Tailwind v4 + theme tokens
  api/generate/
    route.ts          # POST handler: validates body, calls Gemini per prompt
components/
  ImageStudio.tsx     # Main UI: state, cost memo, fetch /api/generate, layout
lib/
  models.ts           # IMAGE_MODELS, aspect ratios, image size options, getModelDef()
  cost-estimate.ts    # estimateCost(), effectiveImageSizeForModel(), USD→CAD display
```

---

## Configuration

Create **`.env.local`** in the project root (never commit secrets):

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

The API route also accepts **`GEMINI_API_KEY`** as a fallback (`GOOGLE_GENERATIVE_AI_API_KEY` is checked first).

See Google’s docs for [API keys](https://ai.google.dev/gemini-api/docs/api-key) and [image generation](https://ai.google.dev/gemini-api/docs/image-generation).

---

## How generation works

1. **`ImageStudio`** collects settings and calls `POST /api/generate` with JSON (`modelId`, `prompts[]`, `aspectRatio`, optional `imageSize`, `googleSearch`, `thinkingLevel`, `referenceImages`, etc.).
2. **`app/api/generate/route.ts`**:
   - Resolves the API key from env.
   - Validates prompts, aspect ratio for the model, reference image count, and grounding mode.
   - Builds **`contents`**: plain string for text-only, or `[{ text }, { inlineData }, …]` when references exist.
   - Builds **`config`**: `responseModalities` (`["IMAGE"]` vs `["TEXT","IMAGE"]`), `imageConfig` (aspect ratio, optional `imageSize`, `personGeneration`), optional `thinkingConfig`, optional `tools` for Google Search.
   - Loops **one `generateContent` call per prompt** (batch = multiple requests). Each result collects inline image parts as `data:image/...;base64,...` URLs and text parts separately; usage metadata is passed through when present.
3. **Errors** for a single prompt are caught and returned as `error` on that result object so other batch items can still succeed.

Serverless timeout is raised with `export const maxDuration = 300` (seconds) for long runs.

---

## Request flow (Mermaid)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant UI as ImageStudio
  participant R as POST /api/generate
  participant G as Gemini API

  U->>UI: Configure model, prompts, options
  UI->>UI: estimateCost() client-side
  UI->>R: POST JSON body
  R->>R: Validate prompts, aspect ratio, refs, grounding mode
  R->>R: buildContents() + buildConfig()
  loop One request per prompt (batch = multiple loops)
    R->>G: generateContent(model, contents, config)
    G-->>R: candidates, usageMetadata
    R->>R: Map parts to data URLs + text; attach usage
  end
  R-->>UI: JSON { results[], model }
  UI-->>U: Render images, optional text, per-item errors
```

On the server, **text-only** prompts send `contents` as a string; **with reference images**, `contents` is a `Part[]` of `text` + `inlineData` chunks (see `buildContents` in `app/api/generate/route.ts`).

---

## Model capabilities (by `apiId`)

Derived from `IMAGE_MODELS` in `lib/models.ts`. UI disables options the model does not support.

| `apiId`                          | `selectLabel` (dropdown) | Output size in UI            | **512** tier | Thinking | Google Search (web) | Web + Image search | Max ref images | Aspect ratios                                    |
| -------------------------------- | ------------------------ | ---------------------------- | :----------: | :------: | :-----------------: | :----------------: | :------------: | ------------------------------------------------ |
| `gemini-2.5-flash-image`         | Nano Banana              | Fixed ~1K (no size selector) |      —       |    No    |         No          |         No         |     **3**      | Base set (11 ratios)                             |
| `gemini-3-pro-image-preview`     | Nano BananaPro           | 1K / 2K / 4K                 |      No      |   Yes    |         Yes         |         No         |     **14**     | Base set (11 ratios)                             |
| `gemini-3.1-flash-image-preview` | Nano Banana 2            | 512 / 1K / 2K / 4K           |     Yes      |   Yes    |         Yes         |        Yes         |     **14**     | Base set + `1:4`, `4:1`, `1:8`, `8:1` (15 total) |

**Legend**

- **Base set**: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` (see `aspectRatiosForModel()`).
- **512**: Only **3.1 Flash** exposes the 512 / “0.5K” tier in the UI (`supports512`).
- **Grounding**: `web_image` (web + image search) requires `supportsImageGrounding` — only **3.1 Flash** in this app.

---

## Client-side validation

The UI enforces a **minimum prompt length in single-prompt mode** (200 characters) before calling the API. **Batch mode** requires at least one non-empty prompt box instead. The API itself only requires non-empty trimmed prompts.

---

## Cost estimation (`lib/cost-estimate.ts`)

- Uses documented **output image token counts per size** (512 / 1K / 2K / 4K) and approximate **USD per million tokens** per model.
- Adjusts for **reference images** (extra input tokens, TEXT+IMAGE modality), **high thinking** (uplift where applicable), optional **Batch API 50% discount** checkbox, and **Google Search** (note that search may add uncaptured charges).
- Exposes **USD** internally and **CAD** for display (`estimatedCadPerRequest`, `estimatedCadTotal`) using **`USD_TO_CAD_APPROX`** (edit this constant to refresh the rough exchange rate).

---

## Scripts

| Command         | Purpose                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `npm run dev`   | Dev server ([Turbopack](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)) |
| `npm run build` | Production build                                                                                    |
| `npm run start` | Run production server                                                                               |
| `npm run lint`  | ESLint                                                                                              |

Open [http://localhost:3000](http://localhost:3000) after `npm run dev`.

---

## Deployment

Deploy like any Next.js app (e.g. [Vercel](https://vercel.com/docs)). Set **`GOOGLE_GENERATIVE_AI_API_KEY`** (or `GEMINI_API_KEY`) in the host’s environment variables. Confirm the platform allows long-running functions if you rely on `maxDuration` for slow generations.

---

## References

- [Gemini API — Image generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini API — Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Next.js Documentation](https://nextjs.org/docs)

---

## License

Private project (`"private": true` in `package.json`). Adjust as needed for your use case.
