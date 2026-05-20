import { NextResponse } from "next/server";
import { fetchAutocomplete } from "@/lib/youtube";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;
const cache = new Map<string, { suggestions: string[]; at: number }>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 1) return NextResponse.json({ suggestions: [] });

  const key = q.toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ suggestions: hit.suggestions, cached: true });
  }

  if (cache.size > MAX_CACHE) {
    for (const [k, v] of cache) {
      if (now - v.at > CACHE_TTL_MS) cache.delete(k);
    }
    if (cache.size > MAX_CACHE) {
      const oldestKey = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
      if (oldestKey) cache.delete(oldestKey);
    }
  }

  try {
    const suggestions = await fetchAutocomplete(q);
    cache.set(key, { suggestions, at: now });
    return NextResponse.json({ suggestions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `자동완성 실패: ${msg}` }, { status: 500 });
  }
}
