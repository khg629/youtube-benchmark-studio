import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { CommentInsightPanel } from "@/components/CommentInsightPanel";
import { CommentsPanel } from "@/components/CommentsPanel";
import { ExposurePanel } from "@/components/ExposurePanel";
import { ScriptInsightPanel } from "@/components/ScriptInsightPanel";
import { VideoEditor } from "@/components/VideoEditor";
import {
  getAnalyses,
  getCommentInsights,
  getCommentsMeta,
  getScriptInsights,
  getTranscript,
  getVideo,
  listComments,
  listSnapshots,
} from "@/lib/db";
import { computeExposure } from "@/lib/snapshots";
import { formatCount, formatDuration, formatRelativeDate } from "@/lib/format";
import { providerStatus } from "@/lib/llm";
import type { Provider } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = getVideo(id);
  if (!video) notFound();
  const analyses = getAnalyses(id);
  const insights = getCommentInsights(id);
  const scriptInsights = getScriptInsights(id);
  const transcript = getTranscript(id);
  const comments = listComments(id);
  const commentsMeta = getCommentsMeta(id);
  const snapshots = listSnapshots(id);
  const exposure = computeExposure(snapshots, video.upload_date);
  const providers = providerStatus();
  const availability: Record<Provider, boolean> = {
    claude: false,
    openai: false,
    gemini: false,
  };
  for (const p of providers) availability[p.provider] = p.available;

  const thumbSrc = video.thumbnail_local
    ? `/api/thumbnails/${video.id}`
    : video.thumbnail_url;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
        ← 대시보드로
      </Link>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]">
          {thumbSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc} alt={video.title} className="aspect-video w-full object-cover" />
          )}
          <div className="p-5">
            <h1 className="text-xl font-semibold leading-snug">{video.title}</h1>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {video.channel_name ?? "알 수 없음"}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--muted)]">
              <span>조회수 {formatCount(video.view_count)}</span>
              <span>좋아요 {formatCount(video.like_count)}</span>
              <span>길이 {formatDuration(video.duration_seconds)}</span>
              <span>
                업로드 {video.upload_date?.slice(0, 10) ?? "-"} ({formatRelativeDate(video.upload_date)})
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs hover:text-[color:var(--foreground)]"
              >
                YouTube에서 보기 ↗
              </a>
              <a
                href={`/api/download/${video.id}`}
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs hover:text-[color:var(--foreground)]"
                title="최고 해상도 mp4. yt-dlp+ffmpeg로 머지하므로 영상 길이에 비례해 시간이 걸립니다."
              >
                다운로드 ↓
              </a>
            </div>
            {video.description && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[color:var(--muted)]">
                  설명 펼치기
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--muted)]">
                  {video.description}
                </p>
              </details>
            )}
            {video.tags.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-[color:var(--muted)]">
                  YouTube 태그 ({video.tags.length})
                </summary>
                <div className="mt-2 flex flex-wrap gap-1">
                  {video.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-[color:var(--border)] px-2 py-0.5 text-xs text-[color:var(--muted)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>

        <VideoEditor
          videoId={video.id}
          initialNote={video.my_note ?? ""}
          initialTags={video.user_tags}
        />
      </div>

      <div>
        <ExposurePanel
          videoId={video.id}
          initialSnapshots={snapshots}
          initialExposure={{ value: exposure.value, grade: exposure.grade, detail: exposure.detail }}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">LLM 분석</h2>
        <AnalysisPanel
          videoId={video.id}
          initialAnalyses={analyses}
          providerAvailability={availability}
          commentCount={commentsMeta.count}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">스크립트 분석 — 훅·전개·시청 유지</h2>
        <ScriptInsightPanel
          videoId={video.id}
          initialTranscript={transcript}
          initialInsights={scriptInsights}
          providerAvailability={availability}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">댓글 인사이트 — 다음 영상 아이디어</h2>
        <CommentInsightPanel
          videoId={video.id}
          initialInsights={insights}
          providerAvailability={availability}
          commentCount={commentsMeta.count}
        />
      </div>

      <div>
        <CommentsPanel
          videoId={video.id}
          videoUrl={video.url}
          initialComments={comments}
          initialFetchedAt={commentsMeta.fetched_at}
        />
      </div>
    </div>
  );
}
