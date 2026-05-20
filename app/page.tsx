import { AddVideoForm } from "@/components/AddVideoForm";
import { VideoGrid } from "@/components/VideoGrid";
import { allSnapshotsByVideo, listVideos } from "@/lib/db";
import { computeExposure } from "@/lib/snapshots";
import type { Grade } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export type ExposureInfo = {
  value: number | null;
  grade: Grade | null;
  detail?: string;
  snapshotCount: number;
};

export default function HomePage() {
  const videos = listVideos();
  const snapsByVideo = allSnapshotsByVideo();

  const exposures: Record<string, ExposureInfo> = {};
  for (const v of videos) {
    const snaps = snapsByVideo.get(v.id) ?? [];
    const result = computeExposure(snaps, v.upload_date);
    exposures[v.id] = {
      value: result.value,
      grade: result.grade,
      detail: result.detail,
      snapshotCount: snaps.length,
    };
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-3 text-xl font-semibold">참고 영상 추가</h1>
        <AddVideoForm />
      </section>
      <VideoGrid videos={videos} exposures={exposures} />
    </div>
  );
}
