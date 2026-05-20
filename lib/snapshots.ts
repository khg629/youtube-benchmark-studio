import { addSnapshot, getVideo, latestSnapshot, listSnapshots } from "./db";
import { daysBetween, type Grade, type MetricValue } from "./metrics";
import type { Snapshot } from "./types";
import { fetchVideoMetadata } from "./youtube";

export async function takeSnapshot(videoId: string): Promise<Snapshot> {
  const video = getVideo(videoId);
  if (!video) throw new Error("영상을 찾을 수 없습니다");
  const meta = await fetchVideoMetadata(videoId);
  if (meta.view_count == null) throw new Error("조회수를 가져올 수 없습니다");
  return addSnapshot(videoId, {
    view_count: meta.view_count,
    like_count: meta.like_count,
  });
}

/**
 * 노출 확률 = 최근 속도 / 평균 속도
 *
 * 최근 속도: 마지막 두 스냅샷 사이의 조회수 증가 / 간격(일)
 * 평균 속도: 최신 스냅샷의 조회수 / 업로드 후 경과일
 *
 * 스냅샷이 2개 미만 또는 간격이 너무 좁으면 null.
 */
export function computeExposure(
  snapshots: Snapshot[],
  uploadDate: string | null,
): MetricValue & { detail?: string } {
  if (snapshots.length < 2) {
    return {
      value: null,
      grade: null,
      detail: snapshots.length === 1 ? "스냅샷 1개 — 다시 수집 필요" : "스냅샷 없음",
    };
  }
  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots[snapshots.length - 2];

  const recentMs = new Date(latest.captured_at).getTime() - new Date(previous.captured_at).getTime();
  const recentDays = recentMs / 86400000;
  if (recentDays < 0.25) {
    // 6시간 미만은 불안정
    return { value: null, grade: null, detail: "간격이 너무 짧음 (6시간 이상 필요)" };
  }
  const recentViews = latest.view_count - previous.view_count;
  const recentVelocity = recentViews / recentDays;

  const totalDays = daysBetween(uploadDate, new Date(latest.captured_at).getTime());
  if (totalDays == null || totalDays <= 0) {
    return { value: null, grade: null, detail: "업로드 날짜 정보 없음" };
  }
  const avgVelocity = latest.view_count / totalDays;
  if (avgVelocity <= 0) {
    return { value: null, grade: null };
  }

  const ratio = recentVelocity / avgVelocity;
  const grade: Grade =
    ratio >= 5
      ? "best"
      : ratio >= 2
        ? "great"
        : ratio >= 1
          ? "good"
          : ratio >= 0.5
            ? "normal"
            : ratio >= 0.2
              ? "bad"
              : "worst";
  return { value: ratio, grade };
}

export function getExposureForVideo(videoId: string): MetricValue & { detail?: string; snapshotCount: number } {
  const video = getVideo(videoId);
  if (!video) return { value: null, grade: null, snapshotCount: 0, detail: "영상 없음" };
  const snaps = listSnapshots(videoId);
  const result = computeExposure(snaps, video.upload_date);
  return { ...result, snapshotCount: snaps.length };
}

/**
 * 모든 영상의 스냅샷을 새로 찍는다. 동시성 제한.
 */
export async function takeSnapshotsForAll(videoIds: string[]): Promise<{
  ok: string[];
  failed: { id: string; error: string }[];
}> {
  const ok: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < videoIds.length) {
      const id = videoIds[cursor++];
      try {
        await takeSnapshot(id);
        ok.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, videoIds.length) }, worker));
  return { ok, failed };
}

export { latestSnapshot };
