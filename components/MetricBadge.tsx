import { GRADE_COLOR, GRADE_LABEL, formatMetric, type Grade } from "@/lib/metrics";

export function MetricBadge({
  grade,
  value,
  loading,
}: {
  grade: Grade | null;
  value: number | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-[color:var(--border)]" />
      </div>
    );
  }
  if (!grade) {
    return <span className="text-sm text-[color:var(--muted)]">-</span>;
  }
  return (
    <div
      className="flex flex-col items-center leading-tight"
      title={value != null ? `값: ${formatMetric(value)}` : undefined}
    >
      <span className={`h-1 w-1 rounded-full ${GRADE_COLOR[grade].replace("text-", "bg-")}`} />
      <span className={`mt-0.5 text-xs font-semibold ${GRADE_COLOR[grade]}`}>
        {GRADE_LABEL[grade]}
      </span>
    </div>
  );
}
