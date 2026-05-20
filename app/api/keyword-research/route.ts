import { NextResponse } from "next/server";
import {
  fetchGoogleSuggest,
  fetchKeywordTrends,
  fetchLongtailSuggestions,
  type KeywordTrends,
} from "@/lib/keywords";
import { fetchNaverKeywordVolume, naverAdConfigured, type NaverKeywordRow } from "@/lib/naver";
import { fetchAutocomplete } from "@/lib/youtube";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE = 200;
type CacheEntry = {
  at: number;
  payload: {
    keyword: string;
    geo: string;
    timeframe: string;
    trends: KeywordTrends | null;
    googleSuggest: string[];
    youtubeSuggest: string[];
    longtail: string[];
    naver: {
      configured: boolean;
      main: NaverKeywordRow | null;
      related: NaverKeywordRow[];
    };
    errors: string[];
  };
};
const cache = new Map<string, CacheEntry>();

function trim(c: Map<string, CacheEntry>, now: number) {
  for (const [k, v] of c) if (now - v.at > CACHE_TTL_MS) c.delete(k);
  if (c.size > MAX_CACHE) {
    const oldest = [...c.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) c.delete(oldest);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const keyword = (url.searchParams.get("q") ?? "").trim();
  const geo = (url.searchParams.get("geo") ?? "KR").toUpperCase();
  const timeframe = url.searchParams.get("timeframe") ?? "today 12-m";
  const longtail = url.searchParams.get("longtail") === "true";

  if (!keyword) return NextResponse.json({ error: "키워드를 입력하세요." }, { status: 400 });

  const cacheKey = `${keyword.toLowerCase()}::${geo}::${timeframe}::${longtail ? 1 : 0}`;
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true });
  }

  const errors: string[] = [];
  const naverEnabled = naverAdConfigured();
  const settled = await Promise.allSettled([
    fetchKeywordTrends(keyword, geo, timeframe),
    fetchGoogleSuggest(keyword),
    fetchAutocomplete(keyword),
    longtail ? fetchLongtailSuggestions(keyword) : Promise.resolve([] as string[]),
    naverEnabled ? fetchNaverKeywordVolume(keyword) : Promise.resolve(null),
  ]);

  const trends = settled[0].status === "fulfilled" ? settled[0].value : null;
  if (settled[0].status === "rejected") errors.push(`trends: ${String(settled[0].reason)}`);
  const googleSuggest = settled[1].status === "fulfilled" ? settled[1].value : [];
  if (settled[1].status === "rejected") errors.push(`google: ${String(settled[1].reason)}`);
  const youtubeSuggest = settled[2].status === "fulfilled" ? settled[2].value : [];
  if (settled[2].status === "rejected") errors.push(`youtube: ${String(settled[2].reason)}`);
  const longtailList = settled[3].status === "fulfilled" ? settled[3].value : [];
  if (settled[3].status === "rejected") errors.push(`longtail: ${String(settled[3].reason)}`);

  const naverRows = settled[4].status === "fulfilled" ? settled[4].value : null;
  if (settled[4].status === "rejected") errors.push(`naver: ${String(settled[4].reason)}`);

  // Naver는 hintKeyword 자체 + 관련 키워드들을 같이 줌. 첫 행이 입력 키워드 매칭일 확률 높음.
  let naverMain: NaverKeywordRow | null = null;
  let naverRelated: NaverKeywordRow[] = [];
  if (naverRows && naverRows.length > 0) {
    const k = keyword.replace(/\s+/g, "").toLowerCase();
    const idx = naverRows.findIndex((r) => r.keyword.replace(/\s+/g, "").toLowerCase() === k);
    if (idx >= 0) {
      naverMain = naverRows[idx];
      naverRelated = [...naverRows.slice(0, idx), ...naverRows.slice(idx + 1)];
    } else {
      naverMain = naverRows[0];
      naverRelated = naverRows.slice(1);
    }
    // 총 검색량 큰 순으로 정렬
    naverRelated.sort((a, b) => (b.monthlyTotal ?? 0) - (a.monthlyTotal ?? 0));
    naverRelated = naverRelated.slice(0, 100);
  }

  const payload = {
    keyword,
    geo,
    timeframe,
    trends,
    googleSuggest,
    youtubeSuggest,
    longtail: longtailList,
    naver: {
      configured: naverEnabled,
      main: naverMain,
      related: naverRelated,
    },
    errors,
  };

  trim(cache, now);
  cache.set(cacheKey, { at: now, payload });

  return NextResponse.json(payload);
}
