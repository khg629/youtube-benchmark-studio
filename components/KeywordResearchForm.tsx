"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { KeywordTrends, TrendsRelatedItem, TrendsTimePoint } from "@/lib/keywords";
import type { NaverKeywordRow } from "@/lib/naver";

type ResearchResult = {
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
  cached?: boolean;
};

const GEO_OPTIONS = [
  { value: "KR", label: "한국" },
  { value: "US", label: "미국" },
  { value: "JP", label: "일본" },
  { value: "", label: "전세계" },
];

const TIMEFRAME_OPTIONS = [
  { value: "now 7-d", label: "최근 7일" },
  { value: "today 1-m", label: "최근 1개월" },
  { value: "today 3-m", label: "최근 3개월" },
  { value: "today 12-m", label: "최근 12개월" },
  { value: "today 5-y", label: "최근 5년" },
  { value: "all", label: "전체 기간" },
];

export function KeywordResearchForm() {
  const searchParams = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const [geo, setGeo] = useState("KR");
  const [timeframe, setTimeframe] = useState("today 12-m");
  const [longtail, setLongtail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastQueryRef = useRef<string | null>(null);

  async function runQuery(q: string, opts?: { geo?: string; timeframe?: string; longtail?: boolean }) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: trimmed,
        geo: opts?.geo ?? geo,
        timeframe: opts?.timeframe ?? timeframe,
        longtail: (opts?.longtail ?? longtail) ? "true" : "false",
      });
      const res = await fetch(`/api/keyword-research?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "조회 실패");
        setData(null);
      } else {
        setData(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // URL ?q=... 로 들어왔을 때 자동 조회
  useEffect(() => {
    const q = searchParams.get("q");
    if (!q) return;
    if (lastQueryRef.current === q) return;
    lastQueryRef.current = q;
    setKeyword(q);
    runQuery(q);
    // runQuery는 최신 state 참조용 closure — deps에 넣지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    lastQueryRef.current = keyword.trim();
    runQuery(keyword);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="키워드 입력 (예: 다이어트, 캠핑, vlog)"
            className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-sm outline-none focus:border-[color:var(--accent)]"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !keyword.trim()}
            className="btn-primary px-5 py-3 text-sm disabled:opacity-50"
          >
            {busy ? "조회 중..." : "조회"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Select label="지역" value={geo} onChange={setGeo} options={GEO_OPTIONS} />
          <Select label="기간" value={timeframe} onChange={setTimeframe} options={TIMEFRAME_OPTIONS} />
          <label className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
            <input
              type="checkbox"
              checked={longtail}
              onChange={(e) => setLongtail(e.target.checked)}
              className="accent-[color:var(--accent)]"
            />
            롱테일 키워드 폭넓게 수집 (자모/알파벳 확장, 느려질 수 있음)
          </label>
        </div>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && <ResultView data={data} />}
      {!data && !error && (
        <div className="rounded-lg border border-dashed border-[color:var(--border)] py-16 text-center text-sm text-[color:var(--muted)]">
          키워드를 입력해 Google 트렌드와 연관 검색어를 확인하세요.
          <br />
          <span className="text-xs">
            ※ 검색량은 Google Trends 상대값(0–100). 절대 검색 횟수가 아닙니다.
          </span>
        </div>
      )}
    </div>
  );
}

function ResultView({ data }: { data: ResearchResult }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-3 border-b border-[color:var(--border)] pb-3">
        <h2 className="text-lg font-semibold">&quot;{data.keyword}&quot;</h2>
        <span className="text-xs text-[color:var(--muted)]">
          {data.geo || "전세계"} · {data.timeframe}
          {data.cached && " · cached"}
        </span>
        {data.errors.length > 0 && (
          <span className="text-xs text-amber-400">일부 데이터 실패: {data.errors.join(", ")}</span>
        )}
        <Link
          href={`/search?q=${encodeURIComponent(data.keyword)}`}
          className="ml-auto rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-[color:var(--accent)] hover:border-[color:var(--accent)]"
        >
          YouTube 검색 →
        </Link>
      </div>

      <NaverVolumeSection data={data.naver} />

      <TrendsSection trends={data.trends} keyword={data.keyword} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RelatedQueriesCard
          title="Google 트렌드 — 인기 관련 검색어"
          subtitle="기간 내 가장 많이 함께 검색된 키워드"
          items={data.trends?.related.top ?? []}
        />
        <RelatedQueriesCard
          title="Google 트렌드 — 급상승 검색어"
          subtitle="이전 기간 대비 검색량이 급증한 키워드 (값은 증가율 %)"
          items={data.trends?.related.rising ?? []}
          isRising
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SuggestCard
          title="Google 자동완성"
          subtitle="사람들이 실제로 입력하는 검색어"
          items={data.googleSuggest}
        />
        <SuggestCard
          title="YouTube 자동완성"
          subtitle="YouTube 검색창에 함께 뜨는 키워드"
          items={data.youtubeSuggest}
          searchOnYoutube
        />
      </div>

      {data.longtail.length > 0 && (
        <LongtailCard items={data.longtail} keyword={data.keyword} />
      )}
    </div>
  );
}

function formatNum(n: number | null): string {
  if (n == null) return "-";
  if (n === 0) return "<10";
  return n.toLocaleString("ko-KR");
}

function NaverVolumeSection({
  data,
}: {
  data: { configured: boolean; main: NaverKeywordRow | null; related: NaverKeywordRow[] };
}) {
  if (!data.configured) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">절대 검색량 (월간) — Naver 검색광고</h3>
          <Link href="/settings" className="text-xs text-[color:var(--accent)] hover:underline">
            설정 →
          </Link>
        </div>
        <p className="mt-2 text-xs text-[color:var(--muted)]">
          한국어 키워드의 <b>월간 PC/모바일 정확한 검색수</b>를 보려면 Naver 검색광고 API 키가 필요해요.
          무료로 발급 가능 (개인 가입 OK).{" "}
          <a
            href="https://searchad.naver.com/customers"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            네이버 검색광고
          </a>{" "}
          → 도구 → API 사용 관리에서 액세스 라이선스 / 비밀키 / Customer ID 발급 후 설정 페이지에 입력하세요.
        </p>
      </div>
    );
  }
  if (!data.main) {
    return (
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
        <h3 className="text-sm font-semibold">절대 검색량 — Naver</h3>
        <p className="mt-2 text-xs text-[color:var(--muted)]">
          이 키워드에 대한 데이터 없음. (영어 키워드거나 너무 niche할 수 있음)
        </p>
      </div>
    );
  }

  const m = data.main;
  const competitionColor =
    m.competition === "높음"
      ? "text-red-400"
      : m.competition === "중간"
        ? "text-amber-400"
        : m.competition === "낮음"
          ? "text-green-400"
          : "text-[color:var(--muted)]";

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">절대 검색량 — Naver (월간)</h3>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            네이버 검색광고 API. 한국 사용자가 실제로 검색하는 횟수.
          </p>
        </div>
        <span className={`text-xs ${competitionColor}`}>
          {m.competition ? `경쟁: ${m.competition}` : ""}
          {m.avgAdDepth != null ? ` · 광고 ${m.avgAdDepth}개` : ""}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <BigStat label="PC" value={formatNum(m.monthlyPc)} />
        <BigStat label="모바일" value={formatNum(m.monthlyMobile)} />
        <BigStat label="합계" value={formatNum(m.monthlyTotal)} highlight />
      </div>

      {data.related.length > 0 && (
        <details className="mt-5" open>
          <summary className="cursor-pointer text-sm font-semibold">
            연관 키워드 검색량{" "}
            <span className="text-xs font-normal text-[color:var(--muted)]">
              ({data.related.length}개 — 합계 큰 순)
            </span>
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[color:var(--muted)]">
                <tr className="border-b border-[color:var(--border)]">
                  <th className="py-2 text-left font-normal">키워드</th>
                  <th className="py-2 text-right font-normal">PC</th>
                  <th className="py-2 text-right font-normal">모바일</th>
                  <th className="py-2 text-right font-normal">합계</th>
                  <th className="py-2 text-right font-normal">경쟁</th>
                  <th className="py-2 text-right font-normal">다음</th>
                </tr>
              </thead>
              <tbody>
                {data.related.map((r, i) => (
                  <tr
                    key={`${r.keyword}-${i}`}
                    className="border-b border-[color:var(--border)]/40 hover:bg-[color:var(--background)]"
                  >
                    <td className="py-1.5">
                      <Link
                        href={`/keywords?q=${encodeURIComponent(r.keyword)}`}
                        className="hover:underline"
                      >
                        {r.keyword}
                      </Link>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{formatNum(r.monthlyPc)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatNum(r.monthlyMobile)}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {formatNum(r.monthlyTotal)}
                    </td>
                    <td className="py-1.5 text-right text-xs">
                      <span
                        className={
                          r.competition === "높음"
                            ? "text-red-400"
                            : r.competition === "중간"
                              ? "text-amber-400"
                              : r.competition === "낮음"
                                ? "text-green-400"
                                : "text-[color:var(--muted)]"
                        }
                      >
                        {r.competition ?? "-"}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      <Link
                        href={`/search?q=${encodeURIComponent(r.keyword)}`}
                        className="text-xs text-[color:var(--accent)] hover:underline"
                      >
                        검색
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function BigStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-3 ${
        highlight
          ? "border-[color:var(--accent)]/60 bg-[color:var(--accent)]/5"
          : "border-[color:var(--border)] bg-[color:var(--background)]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TrendsSection({ trends, keyword }: { trends: KeywordTrends | null; keyword: string }) {
  if (!trends || trends.timeline.length === 0) {
    return (
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
        <p className="text-sm text-[color:var(--muted)]">
          Google Trends 데이터를 가져오지 못했습니다. (검색량 부족 또는 Google 일시 차단)
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">검색 관심도 추이</h3>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            Google Trends 상대값 (0~100). 100 = 기간 내 최고치.
          </p>
        </div>
        <div className="flex gap-5 text-xs">
          <Stat label="평균" value={trends.averageInterest ?? "-"} />
          <Stat label="최고" value={trends.peakInterest ?? "-"} />
          <Stat label="데이터 수" value={trends.timeline.length} />
        </div>
      </div>
      <TimelineChart timeline={trends.timeline} />
      <p className="mt-2 text-[10px] text-[color:var(--muted)]">
        ※ 이 값은 검색 횟수가 아니라 시점별 상대 인기도(0~100)입니다. 절대 검색수는 위 Naver 섹션 참고.
        <br />
        해외/영어 키워드의 시간별 트렌드 파악에 유용.{" "}
        <Link href={`/search?q=${encodeURIComponent(keyword)}`} className="underline">
          YouTube 검색 →
        </Link>
      </p>
    </div>
  );
}

function TimelineChart({ timeline }: { timeline: TrendsTimePoint[] }) {
  const { width, height, padX, padY } = { width: 800, height: 180, padX: 32, padY: 16 };
  const maxVal = Math.max(100, ...timeline.map((p) => p.value));
  const n = timeline.length;
  const stepX = (width - padX * 2) / Math.max(1, n - 1);

  const points = timeline
    .map((p, i) => {
      const x = padX + i * stepX;
      const y = padY + (height - padY * 2) * (1 - p.value / maxVal);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const area = `M ${padX},${height - padY} L ${points
    .split(" ")
    .join(" L ")} L ${(padX + (n - 1) * stepX).toFixed(1)},${height - padY} Z`;

  const labels = useMemo(() => {
    if (n === 0) return [];
    const targets = [0, Math.floor(n / 2), n - 1];
    return Array.from(new Set(targets)).map((i) => ({
      x: padX + i * stepX,
      text: timeline[i]?.formatted ?? "",
    }));
  }, [timeline, n, padX, stepX]);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ minHeight: 180 }}
      >
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a688ff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#7b57fa" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((v) => {
          const y = padY + (height - padY * 2) * (1 - v / maxVal);
          return (
            <g key={v}>
              <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#2a2a35" strokeDasharray="3 3" />
              <text x={4} y={y + 4} fontSize="10" fill="#888">
                {v}
              </text>
            </g>
          );
        })}
        <path d={area} fill="url(#trendGrad)" />
        <polyline
          fill="none"
          stroke="#a688ff"
          strokeWidth="2"
          points={points}
        />
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={height - 2}
            fontSize="10"
            fill="#888"
            textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

function RelatedQueriesCard({
  title,
  subtitle,
  items,
  isRising,
}: {
  title: string;
  subtitle: string;
  items: TrendsRelatedItem[];
  isRising?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 mb-3 text-xs text-[color:var(--muted)]">{subtitle}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[color:var(--muted)]">데이터 없음</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.slice(0, 25).map((it, i) => {
            const isBreakout = isRising && it.value >= 5000;
            return (
              <li
                key={`${it.query}-${i}`}
                className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-[color:var(--background)]"
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="w-5 text-right text-xs text-[color:var(--muted)]">{i + 1}</span>
                  <Link
                    href={`/search?q=${encodeURIComponent(it.query)}`}
                    className="truncate hover:underline"
                    title={it.query}
                  >
                    {it.query}
                  </Link>
                </span>
                <span
                  className={`shrink-0 text-xs ${
                    isBreakout ? "text-amber-400" : "text-[color:var(--muted)]"
                  }`}
                >
                  {isBreakout ? "급등" : isRising ? `+${it.value}%` : it.value}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SuggestCard({
  title,
  subtitle,
  items,
  searchOnYoutube,
}: {
  title: string;
  subtitle: string;
  items: string[];
  searchOnYoutube?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 mb-3 text-xs text-[color:var(--muted)]">{subtitle}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[color:var(--muted)]">데이터 없음</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <Link
              key={s}
              href={searchOnYoutube ? `/search?q=${encodeURIComponent(s)}` : `/keywords?q=${encodeURIComponent(s)}`}
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1 text-xs text-[color:var(--muted-strong)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)]"
              title={searchOnYoutube ? "YouTube 검색으로" : "이 키워드로 다시 조회"}
            >
              {s}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function LongtailCard({ items, keyword }: { items: string[]; keyword: string }) {
  const filtered = items.filter((s) => s.toLowerCase() !== keyword.toLowerCase());
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
      <h3 className="text-sm font-semibold">
        롱테일 키워드 <span className="text-xs font-normal text-[color:var(--muted)]">({filtered.length}개)</span>
      </h3>
      <p className="mt-0.5 mb-3 text-xs text-[color:var(--muted)]">
        키워드 뒤에 자/모음·알파벳을 붙여 Google 자동완성으로 수집한 확장 키워드. 영상 주제 발굴에 활용하세요.
      </p>
      <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto">
        {filtered.map((s) => (
          <Link
            key={s}
            href={`/search?q=${encodeURIComponent(s)}`}
            className="rounded-full border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1 text-xs text-[color:var(--muted-strong)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)]"
          >
            {s}
          </Link>
        ))}
      </div>
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
