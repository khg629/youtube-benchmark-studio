import { NextResponse } from "next/server";
import { getAnalysis, getVideo, listComments, saveAnalysis } from "@/lib/db";
import { analyze } from "@/lib/llm";
import { buildAnalysisPrompt } from "@/lib/llm/prompts";
import { readThumbnailAsBase64 } from "@/lib/thumbnails";
import type { Provider } from "@/lib/types";

const VALID: Provider[] = ["claude", "openai", "gemini"];

export async function POST(req: Request) {
  const body = (await req.json()) as { videoId?: string; provider?: string; force?: boolean };
  const videoId = body.videoId;
  const provider = body.provider as Provider | undefined;
  if (!videoId || !provider || !VALID.includes(provider)) {
    return NextResponse.json({ error: "videoId 와 provider(claude|openai|gemini) 필요" }, { status: 400 });
  }
  const video = getVideo(videoId);
  if (!video) return NextResponse.json({ error: "영상을 찾을 수 없음" }, { status: 404 });

  if (!body.force) {
    const cached = getAnalysis(videoId, provider);
    if (cached) return NextResponse.json({ analysis: cached, cached: true });
  }

  const comments = listComments(videoId);
  const prompt = buildAnalysisPrompt(video, comments);
  const image = video.thumbnail_local ? await readThumbnailAsBase64(video.thumbnail_local) : null;

  try {
    const { text, model } = await analyze(provider, prompt, image);
    saveAnalysis({ video_id: videoId, provider, model, prompt, response: text });
    const saved = getAnalysis(videoId, provider)!;
    return NextResponse.json({
      analysis: saved,
      cached: false,
      comments_included: comments.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
