export type Grade = "best" | "great" | "good" | "normal" | "bad" | "worst";

export const GRADE_LABEL: Record<Grade, string> = {
  best: "Best",
  great: "Great",
  good: "Good",
  normal: "Normal",
  bad: "Bad",
  worst: "Worst",
};

export const GRADE_COLOR: Record<Grade, string> = {
  best: "text-sky-400",
  great: "text-green-400",
  good: "text-lime-400",
  normal: "text-neutral-400",
  bad: "text-orange-400",
  worst: "text-red-500",
};

export function daysBetween(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(1, Math.floor((now - t) / 86400000));
}

export interface MetricInput {
  view_count: number | null;
  subscriber_count: number | null;
  published_at: string | null;
}

export interface MetricValue {
  value: number | null;
  grade: Grade | null;
}

/**
 * 6단계 등급 분류. thresholds = [best, great, good, normal, bad]
 * 각 임계값 이상이면 해당 등급. 최하는 worst.
 */
function grade(value: number, thresholds: [number, number, number, number, number]): Grade {
  const [best, great, good, normal, bad] = thresholds;
  if (value >= best) return "best";
  if (value >= great) return "great";
  if (value >= good) return "good";
  if (value >= normal) return "normal";
  if (value >= bad) return "bad";
  return "worst";
}

export function contribution(views: number | null, subs: number | null): MetricValue {
  if (views == null || subs == null || subs <= 0) return { value: null, grade: null };
  const v = views / subs;
  return { value: v, grade: grade(v, [30, 5, 1.5, 0.5, 0.15]) };
}

export function performance(
  views: number | null,
  subs: number | null,
  publishedAt: string | null,
): MetricValue {
  const days = daysBetween(publishedAt);
  if (views == null || subs == null || subs <= 0 || days == null || days <= 0) {
    return { value: null, grade: null };
  }
  const v = views / days / subs;
  return { value: v, grade: grade(v, [3, 1, 0.05, 0.015, 0.005]) };
}

/**
 * 노출 확률: 스냅샷 기반으로 lib/snapshots.ts에서 별도 계산.
 */
export function exposureProbability(_views: number | null, _subs: number | null): MetricValue {
  return { value: null, grade: null };
}

export function formatMetric(v: number | null): string {
  if (v == null) return "-";
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3);
}
