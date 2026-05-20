// Google Trends / Google Suggest 기반 키워드 리서치.
// 비공식 엔드포인트라 가끔 429/403이 날 수 있음 — 호출부에서 graceful 처리.

const TRENDS_BASE = "https://trends.google.com/trends/api";
const TRENDS_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

function stripTrendsPrefix(text: string): string {
  // Trends는 응답 앞에 )]}',\n 가 붙음 (XSSI 방지용)
  return text.replace(/^\)\]\}',?\s*/, "");
}

// NID cookie 없이 trends API를 호출하면 거의 항상 429.
// 첫 호출 시 trends 홈에서 받아 메모리에 캐싱한다.
let _trendsCookie: string | null = null;
let _trendsCookieAt = 0;
const COOKIE_TTL_MS = 60 * 60 * 1000; // 1시간마다 갱신 (실제 만료는 훨씬 김)

async function getTrendsCookie(force = false): Promise<string | null> {
  const now = Date.now();
  if (!force && _trendsCookie && now - _trendsCookieAt < COOKIE_TTL_MS) {
    return _trendsCookie;
  }
  try {
    const res = await fetch("https://trends.google.com/trends/?geo=KR", {
      headers: {
        "User-Agent": TRENDS_UA,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
      },
      redirect: "follow",
    });
    // fetch 표준상 getSetCookie() 가 모든 Set-Cookie 헤더를 배열로 반환
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = headers.getSetCookie ? headers.getSetCookie() : [];
    const nid = setCookies
      .map((c) => c.split(";")[0])
      .find((c) => c.startsWith("NID="));
    if (nid) {
      _trendsCookie = nid;
      _trendsCookieAt = now;
      return nid;
    }
  } catch {
    // 무시
  }
  return _trendsCookie; // 이전 값 있으면 그거라도 사용
}

async function trendsJSON<T>(
  path: string,
  params: Record<string, string>,
  retried = false,
): Promise<T | null> {
  const qs = new URLSearchParams(params).toString();
  const cookie = await getTrendsCookie();
  const res = await fetch(`${TRENDS_BASE}${path}?${qs}`, {
    headers: {
      "User-Agent": TRENDS_UA,
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
      Referer: "https://trends.google.com/trends/explore",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (res.status === 429 && !retried) {
    // cookie 만료/회전 가능성 — 강제 갱신 후 1회 재시도
    await getTrendsCookie(true);
    return trendsJSON<T>(path, params, true);
  }
  if (!res.ok) return null;
  const body = await res.text();
  try {
    return JSON.parse(stripTrendsPrefix(body)) as T;
  } catch {
    return null;
  }
}

export type TrendsTimePoint = { time: string; value: number; formatted: string };
export type TrendsRelatedItem = { query: string; value: number; link?: string; extracted?: number };
export type TrendsRelated = { top: TrendsRelatedItem[]; rising: TrendsRelatedItem[] };

export type KeywordTrends = {
  geo: string;
  timeframe: string;
  timeline: TrendsTimePoint[];
  averageInterest: number | null;
  peakInterest: number | null;
  related: TrendsRelated;
};

type TrendsWidget = {
  id: string;
  token: string;
  request: unknown;
};

type ExploreResponse = {
  widgets: TrendsWidget[];
};

type TimelineResponse = {
  default?: {
    timelineData?: {
      time: string;
      formattedTime?: string;
      formattedAxisTime?: string;
      value: number[];
      hasData?: boolean[];
    }[];
  };
};

type RelatedResponse = {
  default?: {
    rankedList?: {
      rankedKeyword?: {
        query: string;
        value: number;
        link?: string;
        formattedValue?: string;
        extractedValue?: number;
      }[];
    }[];
  };
};

async function explore(keyword: string, geo: string, timeframe: string): Promise<ExploreResponse | null> {
  const req = {
    comparisonItem: [{ keyword, geo, time: timeframe }],
    category: 0,
    property: "",
  };
  return trendsJSON<ExploreResponse>("/explore", {
    hl: "ko",
    tz: "-540",
    req: JSON.stringify(req),
  });
}

async function timeline(widget: TrendsWidget): Promise<TrendsTimePoint[]> {
  const data = await trendsJSON<TimelineResponse>("/widgetdata/multiline", {
    hl: "ko",
    tz: "-540",
    req: JSON.stringify(widget.request),
    token: widget.token,
  });
  const rows = data?.default?.timelineData ?? [];
  return rows.map((r) => ({
    time: r.time,
    value: r.value?.[0] ?? 0,
    formatted: r.formattedAxisTime ?? r.formattedTime ?? "",
  }));
}

async function related(widget: TrendsWidget): Promise<TrendsRelated> {
  const data = await trendsJSON<RelatedResponse>("/widgetdata/relatedsearches", {
    hl: "ko",
    tz: "-540",
    req: JSON.stringify(widget.request),
    token: widget.token,
  });
  const lists = data?.default?.rankedList ?? [];
  const pick = (idx: number): TrendsRelatedItem[] =>
    (lists[idx]?.rankedKeyword ?? []).map((k) => ({
      query: k.query,
      value: k.value,
      link: k.link,
      extracted: k.extractedValue,
    }));
  return { top: pick(0), rising: pick(1) };
}

export async function fetchKeywordTrends(
  keyword: string,
  geo: string = "KR",
  timeframe: string = "today 12-m",
): Promise<KeywordTrends | null> {
  const exp = await explore(keyword, geo, timeframe);
  if (!exp?.widgets) return null;
  const ts = exp.widgets.find((w) => w.id === "TIMESERIES");
  const rel = exp.widgets.find((w) => w.id === "RELATED_QUERIES");

  const [timelinePts, relatedQueries] = await Promise.all([
    ts ? timeline(ts) : Promise.resolve([] as TrendsTimePoint[]),
    rel ? related(rel) : Promise.resolve({ top: [], rising: [] } as TrendsRelated),
  ]);

  let average: number | null = null;
  let peak: number | null = null;
  if (timelinePts.length > 0) {
    const sum = timelinePts.reduce((a, p) => a + p.value, 0);
    average = Math.round((sum / timelinePts.length) * 10) / 10;
    peak = timelinePts.reduce((m, p) => Math.max(m, p.value), 0);
  }

  return {
    geo,
    timeframe,
    timeline: timelinePts,
    averageInterest: average,
    peakInterest: peak,
    related: relatedQueries,
  };
}

// Google 웹 검색 자동완성 (YouTube 가 아닌 일반 웹)
// client=chrome + oe=utf-8 → UTF-8 JSON 응답 (firefox 클라이언트는 한국어에 EUC-KR 반환해 깨짐)
export async function fetchGoogleSuggest(query: string, hl: string = "ko"): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = `https://suggestqueries.google.com/complete/search?client=chrome&hl=${hl}&oe=utf-8&q=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "ko-KR,ko;q=0.9" } });
  if (!res.ok) return [];
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of parsed[1] as unknown[]) {
    if (typeof s !== "string") continue;
    const t = s.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    if (t.toLowerCase() === trimmed.toLowerCase()) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

// "a 키워드", "키워드 a", "키워드 ㄱ" 식의 알파벳/자음 prefix 자동완성을 모아
// 롱테일 키워드를 폭넓게 수집. (Keyword Planner 대안)
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const HANGUL_CONSONANTS = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ".split("");

export async function fetchLongtailSuggestions(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const hangul = /[가-힯]/.test(trimmed);
  const seeds = hangul ? HANGUL_CONSONANTS : ALPHABET;

  const tasks: Promise<string[]>[] = [
    fetchGoogleSuggest(trimmed),
    ...seeds.map((s) => fetchGoogleSuggest(`${trimmed} ${s}`)),
  ];
  const results = await Promise.all(tasks.map((p) => p.catch(() => [] as string[])));

  const out: string[] = [];
  const seen = new Set<string>();
  for (const arr of results) {
    for (const s of arr) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}
