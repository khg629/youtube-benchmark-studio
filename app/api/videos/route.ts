import { NextResponse } from "next/server";
import { addSnapshot, getVideo, listVideos, upsertVideo } from "@/lib/db";
import { downloadThumbnail } from "@/lib/thumbnails";
import { fetchVideoMetadata, parseVideoId } from "@/lib/youtube";

export async function GET() {
  return NextResponse.json({ videos: listVideos() });
}

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "URL 이 비어 있습니다" }, { status: 400 });
  }

  const videoId = parseVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: "YouTube URL 에서 영상 ID를 찾을 수 없습니다" }, { status: 400 });
  }

  const existing = getVideo(videoId);
  if (existing) {
    return NextResponse.json({ video: existing, reused: true });
  }

  try {
    const meta = await fetchVideoMetadata(videoId);
    let thumbLocal: string | null = null;
    if (meta.thumbnail_url) {
      const dl = await downloadThumbnail(videoId, meta.thumbnail_url);
      thumbLocal = dl?.localPath ?? null;
    }
    const saved = upsertVideo({
      id: meta.id,
      url: meta.url,
      title: meta.title,
      channel_name: meta.channel_name,
      channel_id: meta.channel_id,
      thumbnail_url: meta.thumbnail_url,
      thumbnail_local: thumbLocal,
      view_count: meta.view_count,
      like_count: meta.like_count,
      duration_seconds: meta.duration_seconds,
      upload_date: meta.upload_date,
      description: meta.description,
      tags: meta.tags,
    });
    // 첫 스냅샷 자동 저장 (노출 확률 추적 시작점)
    if (meta.view_count != null) {
      addSnapshot(meta.id, { view_count: meta.view_count, like_count: meta.like_count });
    }
    return NextResponse.json({ video: saved, reused: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `영상 정보 조회 실패: ${msg}` }, { status: 500 });
  }
}
