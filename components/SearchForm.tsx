"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SearchResultCard } from "./SearchResultCard";
import { SearchTable } from "./SearchTable";
import type { ChannelInfo } from "@/lib/channel";
import type { SearchResult } from "@/lib/youtube";

type ViewMode = "card" | "table";
const VIEW_KEY = "search-view-mode";

const SUB_OPTIONS: { value: string; label: string; max: number | null }[] = [
  { value: "all", label: "전체", max: null },
  { value: "10k", label: "1만명 미만", max: 10_000 },
  { value: "30k", label: "3만명 미만", max: 30_000 },
  { value: "50k", label: "5만명 미만", max: 50_000 },
  { value: "100k", label: "10만명 미만", max: 100_000 },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "relevance", label: "관련도" },
  { value: "view_count", label: "조회수 많은순" },
  { value: "upload_date", label: "최신순" },
  { value: "rating", label: "평점순" },
];

const DATE_OPTIONS: { value: string; label: string; api: string; maxDays: number | null }[] = [
  { value: "6m", label: "최근 6개월", api: "year", maxDays: 180 },
  { value: "3m", label: "최근 3개월", api: "year", maxDays: 90 },
  { value: "month", label: "이번 달", api: "month", maxDays: null },
  { value: "week", label: "이번 주", api: "week", maxDays: null },
  { value: "today", label: "오늘", api: "today", maxDays: null },
  { value: "year", label: "올해 전체", api: "year", maxDays: null },
  { value: "all", label: "전체 기간", api: "all", maxDays: null },
];

const DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "전체 길이" },
  { value: "short", label: "< 4분 (쇼츠 포함)" },
  { value: "medium", label: "4~20분" },
  { value: "long", label: "> 20분" },
];

const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "kr", label: "한국" },
  { value: "global", label: "해외" },
];

// 한글 자모/음절 범위. 제목 기준으로만 판단.
// 채널명은 YouTube가 lang=ko 요청 시 "외 N명", "및" 같은 한국어 UI 단어를
// 영어 채널명에 자동 삽입하므로 신뢰할 수 없음.
const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/;
function isKoreanContent(r: SearchResult): boolean {
  return HANGUL_RE.test(r.title);
}

const PAGE_SIZE = 50;
const MAX_RESULTS = 1000;
const FILTER_TARGET = 30; // 필터 켰을 때 자동으로 채울 목표 결과 수
const STATE_KEY = "search-state-v1";

export function SearchForm({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState("relevance");
  const [uploadDate, setUploadDate] = useState("6m");
  const [duration, setDuration] = useState("all");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [activeQuery, setActiveQuery] = useState<{ q: string; sort: string; uploadDate: string; duration: string } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [subFilter, setSubFilter] = useState<string>("all");
  const [region, setRegion] = useState<string>("all");
  const [channels, setChannels] = useState<Record<string, ChannelInfo | null>>({});
  const [channelsLoading, setChannelsLoading] = useState(false);
  const fetchedChannelIds = useRef<Set<string>>(new Set());
  const hydrated = useRef(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const initialQueryRan = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "card" || saved === "table") setViewMode(saved);
  }, []);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        query?: string;
        sort?: string;
        uploadDate?: string;
        duration?: string;
        subFilter?: string;
        region?: string;
        results?: SearchResult[];
        savedIds?: string[];
        activeQuery?: { q: string; sort: string; uploadDate: string; duration: string };
        exhausted?: boolean;
        channels?: Record<string, ChannelInfo | null>;
      };
      if (typeof s.query === "string") setQuery(s.query);
      if (typeof s.sort === "string") setSort(s.sort);
      if (typeof s.uploadDate === "string") setUploadDate(s.uploadDate);
      if (typeof s.duration === "string") setDuration(s.duration);
      if (typeof s.subFilter === "string") setSubFilter(s.subFilter);
      if (typeof s.region === "string") setRegion(s.region);
      if (Array.isArray(s.results)) setResults(s.results);
      if (Array.isArray(s.savedIds)) setSavedIds(new Set(s.savedIds));
      if (s.activeQuery) setActiveQuery(s.activeQuery);
      if (typeof s.exhausted === "boolean") setExhausted(s.exhausted);
      if (s.channels) {
        setChannels(s.channels);
        for (const id of Object.keys(s.channels)) fetchedChannelIds.current.add(id);
      }
    } catch {
      // ignore corrupted state
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current || results === null) return;
    try {
      const payload = {
        query,
        sort,
        uploadDate,
        duration,
        subFilter,
        region,
        results,
        savedIds: Array.from(savedIds),
        activeQuery,
        exhausted,
        channels,
      };
      sessionStorage.setItem(STATE_KEY, JSON.stringify(payload));
    } catch {
      // quota exceeded, ignore
    }
  }, [query, sort, uploadDate, duration, subFilter, region, results, savedIds, activeQuery, exhausted, channels]);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    const q = initialQuery.trim();
    if (!q || initialQueryRan.current) return;
    initialQueryRan.current = true;
    setExhausted(false);
    startTransition(() => {
      runSearch(q);
    });
    // runSearch는 최신 state 참조용 closure — deps에 넣지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.suggestions)) setSuggestions(data.suggestions.slice(0, 12));
      } catch {
        // aborted or network error — ignore
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const runningFetchesRef = useRef(0);
  useEffect(() => {
    if (!results || results.length === 0) return;

    async function fetchOnce(ids: string[]): Promise<Record<string, ChannelInfo | null>> {
      const res = await fetch("/api/channel-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: ids }),
      });
      const data = await res.json();
      return (data.channels ?? {}) as Record<string, ChannelInfo | null>;
    }

    async function run() {
      const toFetch = Array.from(
        new Set(
          results!
            .map((r) => r.channel_id)
            .filter(
              (id): id is string =>
                Boolean(id) && id !== "N/A" && !fetchedChannelIds.current.has(id!),
            ),
        ),
      );
      if (toFetch.length === 0) return;
      for (const id of toFetch) fetchedChannelIds.current.add(id);
      runningFetchesRef.current++;
      setChannelsLoading(true);

      try {
        // 결과는 항상 merge (additive). 이전 effect가 cancel 돼도 fetch 결과는 버리지 않음.
        const first = await fetchOnce(toFetch);
        setChannels((prev) => ({ ...prev, ...first }));

        const failed = Object.entries(first)
          .filter(([, v]) => v === null)
          .map(([k]) => k);
        if (failed.length > 0) {
          await new Promise((r) => setTimeout(r, 1500));
          for (const id of failed) fetchedChannelIds.current.delete(id);
          const retried = await fetchOnce(failed);
          for (const id of failed) fetchedChannelIds.current.add(id);
          setChannels((prev) => ({ ...prev, ...retried }));
        }
      } catch (err) {
        // 실패 시 fetchedChannelIds 에서 제거해 재시도 가능하게
        for (const id of toFetch) fetchedChannelIds.current.delete(id);
        console.warn("[channel-info] fetch 실패:", err);
      } finally {
        runningFetchesRef.current--;
        if (runningFetchesRef.current === 0) setChannelsLoading(false);
      }
    }

    run();
  }, [results]);

  const subMax = useMemo(() => SUB_OPTIONS.find((o) => o.value === subFilter)?.max ?? null, [subFilter]);
  const dateMaxDays = useMemo(
    () => DATE_OPTIONS.find((o) => o.value === uploadDate)?.maxDays ?? null,
    [uploadDate],
  );

  const filteredResults = useMemo(() => {
    if (!results) return results;
    if (subMax == null && dateMaxDays == null && region === "all") return results;
    const cutoff = dateMaxDays != null ? Date.now() - dateMaxDays * 86400000 : null;
    return results.filter((r) => {
      if (cutoff != null) {
        if (r.published_at) {
          const t = new Date(r.published_at).getTime();
          if (!isNaN(t) && t < cutoff) return false;
        }
      }
      if (subMax != null) {
        // 다중 작성자 영상 등 채널 ID가 없거나 "N/A" 인 경우 → 구독자 검증 불가, 제외
        if (!r.channel_id || r.channel_id === "N/A") return false;
        const ch = channels[r.channel_id];
        if (ch === undefined) {
          // 아직 채널 정보 로딩 안 됨. 로딩 중이면 일단 통과(나중에 재평가됨).
          if (!channelsLoading) return false;
        } else {
          if (ch === null) return false; // 조회 실패 → 검증 불가, 제외
          if (ch.subscriber_count == null) return false;
          if (ch.subscriber_count >= subMax) return false;
        }
      }
      if (region !== "all") {
        const isKr = isKoreanContent(r);
        if (region === "kr" && !isKr) return false;
        if (region === "global" && isKr) return false;
      }
      return true;
    });
  }, [results, channels, channelsLoading, subMax, dateMaxDays, region]);

  const hiddenCount = useMemo(() => {
    if (!results || !filteredResults) return 0;
    return results.length - filteredResults.length;
  }, [results, filteredResults]);

  async function runSearch(q: string) {
    setError(null);
    const dateOpt = DATE_OPTIONS.find((o) => o.value === uploadDate);
    const params = new URLSearchParams({
      q,
      sort,
      upload: dateOpt?.api ?? "all",
      duration,
      pageSize: String(PAGE_SIZE),
    });
    try {
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "검색 실패");
        setResults([]);
        setExhausted(true);
      } else {
        fetchedChannelIds.current = new Set();
        setChannels({});
        setResults(data.results);
        setSavedIds(new Set<string>(data.saved_ids));
        setExhausted(Boolean(data.exhausted));
        setActiveQuery({ q, sort, uploadDate, duration });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
      setExhausted(true);
    }
  }

  async function loadMore() {
    if (!activeQuery || loadingMore || exhausted) return;
    if ((results?.length ?? 0) >= MAX_RESULTS) return;
    setLoadingMore(true);
    setError(null);
    const remaining = MAX_RESULTS - (results?.length ?? 0);
    const dateOpt = DATE_OPTIONS.find((o) => o.value === activeQuery.uploadDate);
    const params = new URLSearchParams({
      q: activeQuery.q,
      sort: activeQuery.sort,
      upload: dateOpt?.api ?? "all",
      duration: activeQuery.duration,
      pageSize: String(Math.min(PAGE_SIZE, remaining)),
      more: "true",
    });
    try {
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "더 불러오기 실패");
      } else {
        setResults((prev) => {
          const prevList = prev ?? [];
          const seen = new Set(prevList.map((r) => r.id));
          const combined = [...prevList];
          for (const r of data.results as SearchResult[]) {
            if (combined.length >= MAX_RESULTS) break;
            if (!seen.has(r.id)) combined.push(r);
          }
          return combined;
        });
        setSavedIds((prev) => {
          const next = new Set(prev);
          for (const id of data.saved_ids as string[]) next.add(id);
          return next;
        });
        setExhausted(Boolean(data.exhausted));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setExhausted(false);
    startTransition(() => {
      runSearch(q);
    });
  }

  function pickSuggestion(s: string) {
    setQuery(s);
    setExhausted(false);
    startTransition(() => {
      runSearch(s);
    });
  }

  // 자동 더보기: 필터가 켜진 상태에서 표시 결과가 목표 미만이면 다음 페이지를 자동으로 가져옴
  // 단, 채널 정보 로딩 중이면 대기 — 사전 판단 없이 호출하면 불필요하게 더 많은 페이지를 받게 됨
  const hasActiveFilter = subMax != null || dateMaxDays != null || region !== "all";
  const filteredCount = filteredResults?.length ?? 0;
  const totalLoaded = results?.length ?? 0;
  const autoLoading =
    hasActiveFilter &&
    (loadingMore || channelsLoading) &&
    filteredCount < FILTER_TARGET &&
    totalLoaded < MAX_RESULTS;
  useEffect(() => {
    if (!hasActiveFilter) return;
    if (loadingMore || pending) return;
    if (channelsLoading) return; // 채널 정보 로딩 끝날 때까지 대기 (sub 필터 정확 적용 위해)
    if (exhausted) return;
    if (!activeQuery) return;
    if (totalLoaded === 0 || totalLoaded >= MAX_RESULTS) return;
    if (filteredCount >= FILTER_TARGET) return;
    loadMore();
    // loadMore는 closure로 최신 state를 참조하므로 deps에 넣지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveFilter, loadingMore, pending, channelsLoading, exhausted, activeQuery, totalLoaded, filteredCount]);

  const totalShown = results?.length ?? 0;
  const canLoadMore = !exhausted && totalShown > 0 && totalShown < MAX_RESULTS;

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색할 키워드 입력 (예: 브이로그, 게임 리뷰)"
            className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-sm outline-none focus:border-[color:var(--accent)]"
          />
          <button type="submit" disabled={pending || !query.trim()} className="btn-primary px-5 py-3 text-sm">
            {pending ? "검색 중..." : "검색"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Select label="정렬" value={sort} onChange={setSort} options={SORT_OPTIONS} />
          <Select label="기간" value={uploadDate} onChange={setUploadDate} options={DATE_OPTIONS} />
          <Select label="길이" value={duration} onChange={setDuration} options={DURATION_OPTIONS} />
          <Select label="구독자" value={subFilter} onChange={setSubFilter} options={SUB_OPTIONS} />
          <Select label="지역" value={region} onChange={setRegion} options={REGION_OPTIONS} />
          <div className="ml-auto flex gap-1 rounded-md border border-[color:var(--border)] p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded px-2 py-1 ${
                viewMode === "table" ? "bg-[color:var(--accent)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              }`}
              title="테이블 뷰"
            >
              ☰ 테이블
            </button>
            <button
              type="button"
              onClick={() => setViewMode("card")}
              className={`rounded px-2 py-1 ${
                viewMode === "card" ? "bg-[color:var(--accent)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              }`}
              title="카드 뷰"
            >
              ▦ 카드
            </button>
          </div>
        </div>
      </form>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[color:var(--muted)]">관련 인기 검색어</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSuggestion(s)}
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1 text-xs text-[color:var(--muted-strong)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {results === null ? (
        <div className="rounded-lg border border-dashed border-[color:var(--border)] py-16 text-center text-sm text-[color:var(--muted)]">
          키워드를 입력하고 검색하세요. 필터로 정렬·기간·길이·구독자를 조정할 수 있습니다.
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[color:var(--border)] py-16 text-center text-sm text-[color:var(--muted)]">
          검색 결과가 없습니다.
        </div>
      ) : (
        <>
          {hiddenCount > 0 && (
            <p className="text-xs text-[color:var(--muted)]">
              필터로 {hiddenCount}개 숨김 ({filteredResults?.length ?? 0}/{results.length} 표시)
            </p>
          )}
          {viewMode === "table" ? (
            <SearchTable
              results={filteredResults ?? []}
              savedIds={savedIds}
              channels={channels}
              channelsLoading={channelsLoading}
            />
          ) : (
            <>
              <p className="text-xs text-[color:var(--muted)]">{filteredResults?.length ?? 0}개 결과</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {(filteredResults ?? []).map((r) => (
                  <SearchResultCard key={r.id} result={r} initiallySaved={savedIds.has(r.id)} />
                ))}
              </div>
            </>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            {autoLoading ? (
              <p className="text-xs text-[color:var(--muted)]">
                필터 조건 맞는 결과 {filteredCount}/{FILTER_TARGET}개 — 자동으로 더 찾는 중...
              </p>
            ) : canLoadMore ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-5 py-2.5 text-sm hover:border-[color:var(--accent)] disabled:opacity-50"
              >
                {loadingMore
                  ? "불러오는 중..."
                  : `더보기 (+${Math.min(PAGE_SIZE, MAX_RESULTS - totalShown)}개)`}
              </button>
            ) : totalShown >= MAX_RESULTS ? (
              <p className="text-xs text-[color:var(--muted)]">
                최대 {MAX_RESULTS}개까지 표시했습니다
                {hasActiveFilter && filteredCount < FILTER_TARGET ? ` (필터 통과 ${filteredCount}개)` : ""}.
              </p>
            ) : exhausted && totalShown > 0 ? (
              <p className="text-xs text-[color:var(--muted)]">
                모든 결과를 불러왔습니다
                {hasActiveFilter ? ` (필터 통과 ${filteredCount}개)` : ""}.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-[color:var(--muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-2 py-1.5 text-sm outline-none focus:border-[color:var(--accent)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
