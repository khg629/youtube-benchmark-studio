import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSynthesis, getVideo, saveSynthesis } from "@/lib/db";
import { analyzeMulti } from "@/lib/llm";
import { buildSynthesisPrompt } from "@/lib/llm/prompts";
import { readThumbnailAsBase64 } from "@/lib/thumbnails";
import type { Provider, Video } from "@/lib/types";

const VALID: Provider[] = ["claude", "openai", "gemini"];
const MAX_THUMBNAILS = 12; // 비용 통제

function makeCacheKey(videoIds: string[]): string {
  const sorted = [...videoIds].sort().join(",");
  return crypto.createHash("sha256").update(sorted).digest("hex").slice(0, 32);
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    videoIds?: string[];
    provider?: string;
    force?: boolean;
    includeThumbnails?: boolean;
  };
  const provider = body.provider as Provider | undefined;
  const videoIds = Array.isArray(body.videoIds) ? body.videoIds.filter((s) => typeof s === "string") : [];
  const includeThumbnails = body.includeThumbnails !== false; // 기본 true

  if (!provider || !VALID.includes(provider)) {
    return NextResponse.json({ error: "provider 가 필요합니다" }, { status: 400 });
  }
  if (videoIds.length < 3) {
    return NextResponse.json({ error: "최소 3개 영상이 필요합니다" }, { status: 400 });
  }

  const cacheKey = makeCacheKey(videoIds) + (includeThumbnails ? "_t" : "_n");
  if (!body.force) {
    const cached = getSynthesis(cacheKey, provider);
    if (cached) return NextResponse.json({ synthesis: cached, cached: true });
  }

  const videos: Video[] = [];
  for (const id of videoIds) {
    const v = getVideo(id);
    if (v) videos.push(v);
  }
  if (videos.length < 3) {
    return NextResponse.json({ error: "유효한 영상이 부족합니다" }, { status: 400 });
  }

  // 썸네일 픽: 조회수 상위 N개
  const thumbnailVideos = includeThumbnails
    ? [...videos]
        .filter((v) => v.thumbnail_local)
        .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
        .slice(0, MAX_THUMBNAILS)
    : [];
  const images: { base64: string; mime: string }[] = [];
  const thumbnailVideoIds: string[] = [];
  for (const v of thumbnailVideos) {
    if (!v.thumbnail_local) continue;
    const img = await readThumbnailAsBase64(v.thumbnail_local);
    if (img) {
      images.push(img);
      thumbnailVideoIds.push(v.id);
    }
  }

  const prompt = buildSynthesisPrompt(videos, thumbnailVideoIds);

  try {
    const { text, model } = await analyzeMulti(provider, prompt, images);
    saveSynthesis({
      cache_key: cacheKey,
      provider,
      model,
      video_ids_json: JSON.stringify(videoIds),
      prompt,
      response: text,
      video_count: videos.length,
    });
    const saved = getSynthesis(cacheKey, provider)!;
    return NextResponse.json({
      synthesis: saved,
      cached: false,
      thumbnail_count: images.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
