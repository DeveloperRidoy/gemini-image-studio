const STORAGE_KEY = "gemini-image-studio:daily-usage";

export type DailyUsage = {
  date: string;
  imageCount: number;
  totalCad: number;
};

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function loadDailyUsage(): DailyUsage {
  const today = localDateKey();
  if (typeof window === "undefined") {
    return { date: today, imageCount: 0, totalCad: 0 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: today, imageCount: 0, totalCad: 0 };
    const parsed = JSON.parse(raw) as DailyUsage;
    if (parsed.date !== today) {
      return { date: today, imageCount: 0, totalCad: 0 };
    }
    return {
      date: today,
      imageCount: Math.max(0, Math.floor(Number(parsed.imageCount) || 0)),
      totalCad: Math.max(0, Number(parsed.totalCad) || 0),
    };
  } catch {
    return { date: today, imageCount: 0, totalCad: 0 };
  }
}

function persist(u: DailyUsage) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
}

/** Add images and estimated CAD for the current local day. */
export function appendDailyGeneration(
  imageCount: number,
  estimatedCad: number,
): DailyUsage {
  const today = localDateKey();
  const prev = loadDailyUsage();
  const base =
    prev.date === today
      ? prev
      : { date: today, imageCount: 0, totalCad: 0 };
  const next: DailyUsage = {
    date: today,
    imageCount: base.imageCount + Math.max(0, imageCount),
    totalCad: base.totalCad + Math.max(0, estimatedCad),
  };
  persist(next);
  return next;
}
