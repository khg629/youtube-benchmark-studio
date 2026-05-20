import { NextResponse } from "next/server";
import {
  getScriptInsight,
  getTranscript,
  getVideo,
  saveScriptInsight,
} from "@/lib/db";
import { analyze } from "@/lib/llm";
import { buildScriptInsightPrompt } from "@/lib/llm/prompts";
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

  const transcript = getTranscript(videoId);
  if (!transcript || transcript.segment_count === 0) {
    return NextResponse.json(
      { error: "먼저 자막을 가져와주세요" },
      { status: 400 },
    );
  }

  if (!body.force) {
    const cached = getScriptInsight(videoId, provider);
    // 캐시는 자막 세그먼트 수가 같을 때만 사용
    if (cached && cached.segment_count === transcript.segment_count) {
      return NextResponse.json({ insight: cached, cached: true });
    }
  }

  const prompt = buildScriptInsightPrompt(video, transcript);

  try {
    const { text, model } = await analyze(provider, prompt, null);
    saveScriptInsight({
      video_id: videoId,
      provider,
      model,
      prompt,
      response: text,
      segment_count: transcript.segment_count,
    });
    const saved = getScriptInsight(videoId, provider)!;
    return NextResponse.json({ insight: saved, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
