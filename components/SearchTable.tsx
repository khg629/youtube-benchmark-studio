"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MetricBadge } from "./MetricBadge";
import { contribution, daysBetween, exposureProbability, performance } from "@/lib/metrics";
import { formatCount, formatRelativeDate } from "@/lib/format";
import type { ChannelInfo } from "@/lib/channel";
import type { SearchResult } from "@/lib/youtube";

type SearchTableProps = {
  results: SearchResult[];
  savedIds: Set<string>;
  channels: Record<string, ChannelInfo | null>;
  channelsLoading: boolean;
};

type SortKey =
  | "published"
  | "title"
  | "views"
  | "subs"
  | "contribution"
  | "performance"
  | "video_count";

export function SearchTable({ results, savedIds: initialSaved, channels, channelsLoading }: SearchTableProps) {
  const [savedIds, setSavedIds] = useState<Set<string>>(initialSaved);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("published");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [batchBusy, setBatchBusy] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSavedIds(initialSaved);
    setSelected(new Set());
  }, [initialSaved]);

  const rows = useMemo(
    () =>
      results.map((r) => {
        const ch = r.channel_id ? channels[r.channel_id] ?? null : null;
        const subs = ch?.subscriber_count ?? null;
        const views = r.view_count;
        const contrib = contribution(views, subs);
        const perf = performance(views, subs, r.published_at);
        const expo = exposureProbability(views, subs);
        return { r, ch, subs, views, contrib, perf, expo };
      }),
    [results, channels],
  );

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "title":
          return a.r.title.localeCompare(b.r.title) * dir;
        case "views":
          return ((a.views ?? -1) - (b.views ?? -1)) * dir;
        case "subs":
          return ((a.subs ?? -1) - (b.subs ?? -1)) * dir;
        case "contribution":
          return ((a.contrib.value ?? -1) - (b.contrib.value ?? -1)) * dir;
        case "performance":
          return ((a.perf.value ?? -1) - (b.perf.value ?? -1)) * dir;
        case "video_count":
          return ((a.ch?.video_count ?? -1) - (b.ch?.video_count ?? -1)) * dir;
        case "published":
        default: {
          const ad = daysBetween(a.r.published_at) ?? Number.MAX_SAFE_INTEGER;
          const bd = daysBetween(b.r.published_at) ?? Number.MAX_SAFE_INTEGER;
          return (ad - bd) * dir;
        }
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const selectableIds = useMemo(
    () => results.filter((r) => !savedIds.has(r.id)).map((r) => r.id),
    [results, savedIds],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  }

  async function addOne(id: string, url: string, openAfter = false) {
    if (savedIds.has(id) || addingIds.has(id)) return;
    setAddingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        setSavedIds((prev) => new Set(prev).add(id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (openAfter) window.location.href = `/video/${id}`;
      }
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function batchAdd() {
    if (selected.size === 0 || batchBusy) return;
    setBatchBusy(true);
    const ids = Array.from(selected);
    const idToUrl = new Map(results.map((r) => [r.id, r.url]));
    const newlySaved: string[] = [];
    const concurrency = 3;
    let i = 0;
    async function worker() {
      while (i < ids.length) {
        const idx = i++;
        const id = ids[idx];
        const url = idToUrl.get(id);
        if (!url) continue;
        try {
          const res = await fetch("/api/videos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          if (res.ok) newlySaved.push(id);
        } catch {
          // ignore single-item failures
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    setSavedIds((prev) => {
      const next = new Set(prev);
      for (const id of newlySaved) next.add(id);
      return next;
    });
    setSelected(new Set());
    setBatchBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-[color:var(--muted)]">
          {selected.size > 0 ? `${selected.size}개 선택됨` : `${results.length}개 결과`}
        </span>
        {selected.size > 0 && (
          <button
            onClick={batchAdd}
            disabled={batchBusy}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {batchBusy ? "추가 중..." : `선택한 ${selected.size}개 벤치마킹에 추가`}
          </button>
        )}
        {channelsLoading && (
          <span className="text-xs text-[color:var(--muted)]">채널 정보 로딩 중…</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[color:var(--border)]">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[color:var(--card)] text-xs text-[color:var(--muted)]">
            <tr>
              <Th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="전체 선택"
                />
              </Th>
              <Th>썸네일 ({results.length})</Th>
              <Th onClick={() => toggleSort("title")} active={sortKey === "title"} dir={sortDir}>
                제목
              </Th>
              <Th onClick={() => toggleSort("views")} active={sortKey === "views"} dir={sortDir} align="right">
                조회수
              </Th>
              <Th onClick={() => toggleSort("subs")} active={sortKey === "subs"} dir={sortDir} align="right">
                구독자
              </Th>
              <Th onClick={() => toggleSort("contribution")} active={sortKey === "contribution"} dir={sortDir} align="center">
                <span title="조회수 ÷ 구독자 — 구독자 범위를 벗어나 얼마나 퍼졌는가">기여도</span>
              </Th>
              <Th onClick={() => toggleSort("performance")} active={sortKey === "performance"} dir={sortDir} align="center">
                <span title="(조회수÷경과일) ÷ 구독자 — 구독 알림 없이도 자체 성과를 내는가">성과도</span>
              </Th>
              <Th align="center">
                <span title="조회수 스냅샷이 2개 이상 쌓여야 계산됨 (Phase 2)">노출 확률</span>
              </Th>
              <Th onClick={() => toggleSort("video_count")} active={sortKey === "video_count"} dir={sortDir} align="right">
                총 영상 수
              </Th>
              <Th onClick={() => toggleSort("published")} active={sortKey === "published"} dir={sortDir} align="right">
                게시일
              </Th>
              <Th align="center">추가</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ r, ch, subs, views, contrib, perf, expo }) => {
              const isSaved = savedIds.has(r.id);
              const isSelected = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={`border-t border-[color:var(--border)] ${
                    isSaved ? "bg-green-950/10" : "hover:bg-[color:var(--card)]"
                  }`}
                >
                  <Td>
                    {isSaved ? (
                      <span className="text-xs text-green-400" title="벤치마킹에 이미 추가됨">
                        ✓
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(r.id)}
                        aria-label="선택"
                      />
                    )}
                  </Td>
                  <Td>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative block h-14 w-24 overflow-hidden rounded bg-black"
                    >
                      {r.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.thumbnail_url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {r.duration_text && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[10px]">
                          {r.duration_text}
                        </span>
                      )}
                    </a>
                  </Td>
                  <Td>
                    {isSaved ? (
                      <Link href={`/video/${r.id}`} className="line-clamp-2 block min-w-[240px] max-w-md text-sm leading-snug hover:underline">
                        {r.title}
                      </Link>
                    ) : (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-2 block min-w-[240px] max-w-md text-sm leading-snug hover:underline"
                      >
                        {r.title}
                      </a>
                    )}
                  </Td>
                  <Td align="right" nowrap>
                    <div className="text-sm">{formatCount(views)}</div>
                    {r.view_count_text && views == null && (
                      <div className="text-[10px] text-[color:var(--muted)]">{r.view_count_text}</div>
                    )}
                  </Td>
                  <Td align="right" nowrap>
                    <div className="text-sm">
                      {ch ? formatCount(subs) : channelsLoading ? "…" : "-"}
                    </div>
                    <div className="text-[10px] text-[color:var(--muted)]">
                      {r.channel_name ?? "-"}
                    </div>
                  </Td>
                  <Td align="center">
                    <MetricBadge
                      grade={contrib.grade}
                      value={contrib.value}
                      loading={channelsLoading && !ch}
                    />
                  </Td>
                  <Td align="center">
                    <MetricBadge
                      grade={perf.grade}
                      value={perf.value}
                      loading={channelsLoading && !ch}
                    />
                  </Td>
                  <Td align="center">
                    <MetricBadge grade={expo.grade} value={expo.value} />
                  </Td>
                  <Td align="right" nowrap>
                    <span className="text-sm">{ch?.video_count != null ? formatCount(ch.video_count) : "-"}</span>
                  </Td>
                  <Td align="right" nowrap>
                    <div className="text-xs">
                      {r.published_at?.slice(0, 10) ?? r.published_text ?? "-"}
                    </div>
                    {r.published_at && (
                      <div className="text-[10px] text-[color:var(--muted)]">
                        {formatRelativeDate(r.published_at)}
                      </div>
                    )}
                  </Td>
                  <Td align="center" nowrap>
                    {isSaved ? (
                      <Link
                        href={`/video/${r.id}`}
                        className="inline-block whitespace-nowrap rounded-md border border-green-700/40 bg-green-900/20 px-2.5 py-1 text-[11px] text-green-400 hover:bg-green-900/40"
                      >
                        ✓ 저장됨
                      </Link>
                    ) : (
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => addOne(r.id, r.url)}
                          disabled={addingIds.has(r.id)}
                          className="btn-primary whitespace-nowrap rounded-md px-2.5 py-1 text-[11px]"
                        >
                          {addingIds.has(r.id) ? "추가중..." : "+ 추가"}
                        </button>
                        <button
                          onClick={() => addOne(r.id, r.url, true)}
                          disabled={addingIds.has(r.id)}
                          className="whitespace-nowrap rounded-md border border-[color:var(--border)] px-2.5 py-1 text-[11px] text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
                          title="저장 후 상세 페이지로 이동"
                        >
                          상세
                        </button>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
  align?: "left" | "right" | "center";
}) {
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      onClick={onClick}
      className={`${alignCls} whitespace-nowrap px-3 py-3 text-xs font-medium ${
        onClick ? "cursor-pointer select-none hover:text-[color:var(--foreground)]" : ""
      } ${active ? "text-[color:var(--foreground)]" : ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

function Td({
  children,
  align = "left",
  nowrap = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  nowrap?: boolean;
}) {
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td className={`${alignCls} px-3 py-2 align-middle ${nowrap ? "whitespace-nowrap" : ""}`}>
      {children}
    </td>
  );
}
