import { NextResponse } from "next/server";
import { getCommentInsight, getVideo, listComments, saveCommentInsight } from "@/lib/db";
import { analyze } from "@/lib/llm";
import { buildCommentInsightPrompt } from "@/lib/llm/prompts";
import type { Provider } from "@/lib/types";

const VALID: Provider[] = ["claude", "openai", "gemini"];

export async function POST(req: Request) {
  const body = (await req.json()) as { videoId?: string; provider?: string; force?: boolean };
  const videoId = body.videoId;
  const provider = body.provider as Provider | undefined;
  if (!videoId || !provider || !VALID.includes(provider)) {
    return NextResponse.json(
      { error: "videoId 와 provider(claude|openai|gemini) 필요" },
      { status: 400 },
    );
  }
  const video = getVideo(videoId);
  if (!video) return NextResponse.json({ error: "영상을 찾을 수 없음" }, { status: 404 });

  const comments = listComments(videoId);
  if (comments.length === 0) {
    return NextResponse.json(
      { error: "댓글이 수집되지 않았습니다. 먼저 댓글 패널에서 댓글을 가져와주세요." },
      { status: 400 },
    );
  }

  if (!body.force) {
    const cached = getCommentInsight(videoId, provider);
    // 캐시는 댓글 수가 같을 때만 사용 (댓글이 새로 수집되었으면 재분석)
    if (cached && cached.comment_count === comments.length) {
      return NextResponse.json({ insight: cached, cached: true });
    }
  }

  const prompt = buildCommentInsightPrompt(video, comments);

  try {
    const { text, model } = await analyze(provider, prompt, null);
    saveCommentInsight({
      video_id: videoId,
      provider,
      model,
      prompt,
      response: text,
      comment_count: comments.length,
    });
    const saved = getCommentInsight(videoId, provider)!;
    return NextResponse.json({
      insight: saved,
      cached: false,
      comment_count: comments.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
