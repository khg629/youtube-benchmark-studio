"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MetricBadge } from "./MetricBadge";
import { formatCount, formatDateTime } from "@/lib/format";
import type { Grade } from "@/lib/metrics";
import type { Snapshot } from "@/lib/types";

export function ExposurePanel({
  videoId,
  initialSnapshots,
  initialExposure,
}: {
  videoId: string;
  initialSnapshots: Snapshot[];
  initialExposure: { value: number | null; grade: Grade | null; detail?: string };
}) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots);
  const [exposure, setExposure] = useState(initialExposure);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/snapshot`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "실패");
      } else {
        setSnapshots((s) => [...s, data.snapshot]);
        setExposure({
          value: data.exposure.value,
          grade: data.exposure.grade,
          detail: data.exposure.detail,
        });
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const latest = snapshots[snapshots.length - 1] ?? null;
  const first = snapshots[0] ?? null;

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">노출 확률 · 조회수 추적</h3>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            스냅샷을 2개 이상 쌓으면 계산됩니다. 최근 속도가 평균보다 빠르면 알고리즘이 지금도 밀어주고
            있다는 신호입니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MetricBadge grade={exposure.grade} value={exposure.value} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-[color:var(--background)]/50 p-3 text-xs">
        <div>
          <div className="text-[color:var(--muted)]">스냅샷</div>
          <div className="mt-0.5 text-sm">{snapshots.length}회</div>
        </div>
        <div>
          <div className="text-[color:var(--muted)]">최근 스냅샷</div>
          <div className="mt-0.5 text-sm">
            {latest ? formatDateTime(latest.captured_at) : "-"}
          </div>
        </div>
        {first && latest && snapshots.length >= 2 && (
          <>
            <div>
              <div className="text-[color:var(--muted)]">조회수 변화</div>
              <div className="mt-0.5 text-sm">
                {formatCount(first.view_count)} → {formatCount(latest.view_count)} (+
                {formatCount(latest.view_count - first.view_count)})
              </div>
            </div>
            <div>
              <div className="text-[color:var(--muted)]">계산값</div>
              <div className="mt-0.5 text-sm">
                {exposure.value != null
                  ? `최근 속도가 평균의 ${exposure.value.toFixed(2)}배`
                  : exposure.detail ?? "-"}
              </div>
            </div>
          </>
        )}
      </div>

      {exposure.detail && exposure.grade == null && (
        <p className="mt-3 text-xs text-yellow-400">{exposure.detail}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={refresh}
          disabled={busy}
          className="btn-primary px-4 py-1.5 text-xs"
        >
          {busy ? "수집 중..." : "📸 지금 스냅샷 찍기"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {snapshots.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-[color:var(--muted)]">
            스냅샷 이력 ({snapshots.length}개) 펼치기
          </summary>
          <table className="mt-2 w-full text-xs">
            <thead className="text-[color:var(--muted)]">
              <tr>
                <th className="py-1 text-left">수집 시각</th>
                <th className="py-1 text-right">조회수</th>
                <th className="py-1 text-right">좋아요</th>
              </tr>
            </thead>
            <tbody>
              {[...snapshots].reverse().map((s, i, arr) => {
                const prev = arr[i + 1];
                const delta = prev ? s.view_count - prev.view_count : 0;
                return (
                  <tr key={s.id} className="border-t border-[color:var(--border)]">
                    <td className="py-1">{formatDateTime(s.captured_at)}</td>
                    <td className="py-1 text-right">
                      {formatCount(s.view_count)}
                      {prev && delta > 0 && (
                        <span className="ml-1 text-green-400">+{formatCount(delta)}</span>
                      )}
                    </td>
                    <td className="py-1 text-right">
                      {s.like_count != null ? formatCount(s.like_count) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
