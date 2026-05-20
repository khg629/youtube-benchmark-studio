import { NextResponse } from "next/server";
import { getCommentsMeta, getVideo, listComments, replaceComments } from "@/lib/db";
import { fetchCommentsViaApi } from "@/lib/youtube-data";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const videoId = url.searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId 필요" }, { status: 400 });
  if (!getVideo(videoId)) return NextResponse.json({ error: "영상을 찾을 수 없음" }, { status: 404 });
  const comments = listComments(videoId);
  const meta = getCommentsMeta(videoId);
  return NextResponse.json({ comments, fetched_at: meta.fetched_at, count: meta.count });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    videoId?: string;
    target?: number;
    sort?: "TOP_COMMENTS" | "NEWEST_FIRST";
  };
  const videoId = body.videoId;
  if (!videoId) return NextResponse.json({ error: "videoId 필요" }, { status: 400 });
  if (!getVideo(videoId)) return NextResponse.json({ error: "영상을 찾을 수 없음" }, { status: 404 });
  const target = Math.max(1, Math.min(2000, body.target ?? 100));
  const order = body.sort === "NEWEST_FIRST" ? "time" : "relevance";

  try {
    const { comments, exhausted, topLevelCount, repliesCount } = await fetchCommentsViaApi(videoId, {
      target,
      order,
    });
    replaceComments(videoId, comments);
    return NextResponse.json({
      count: comments.length,
      top_level_count: topLevelCount,
      replies_count: repliesCount,
      exhausted,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
