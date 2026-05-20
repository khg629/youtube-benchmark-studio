import { NextResponse } from "next/server";
import { getTranscript, getVideo, saveTranscript } from "@/lib/db";
import { fetchTranscript } from "@/lib/transcript";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId 필요" }, { status: 400 });
  const t = getTranscript(videoId);
  return NextResponse.json({ transcript: t });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { videoId?: string; force?: boolean };
  const videoId = body.videoId;
  if (!videoId) return NextResponse.json({ error: "videoId 필요" }, { status: 400 });
  const video = getVideo(videoId);
  if (!video) return NextResponse.json({ error: "영상을 찾을 수 없음" }, { status: 404 });

  if (!body.force) {
    const cached = getTranscript(videoId);
    if (cached && cached.segment_count > 0) {
      return NextResponse.json({ transcript: cached, cached: true });
    }
  }

  try {
    const fetched = await fetchTranscript(videoId);
    if (fetched.is_empty) {
      return NextResponse.json(
        {
          error: "이 영상에서 자막을 추출하지 못했습니다 (자막 비공개 또는 미지원)",
          available_languages: fetched.available_languages,
        },
        { status: 422 },
      );
    }
    saveTranscript({
      video_id: videoId,
      language: fetched.language,
      available_languages: fetched.available_languages,
      segments: fetched.segments,
    });
    const saved = getTranscript(videoId)!;
    return NextResponse.json({ transcript: saved, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
