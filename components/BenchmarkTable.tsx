"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MetricBadge } from "./MetricBadge";
import { contribution, daysBetween, performance } from "@/lib/metrics";
import { formatCount, formatRelativeDate } from "@/lib/format";
import type { ChannelInfo } from "@/lib/channel";
import type { Video } from "@/lib/types";
import type { ExposureInfo } from "@/app/page";

type SortKey =
  | "added"
  | "published"
  | "title"
  | "views"
  | "subs"
  | "contribution"
  | "performance"
  | "video_count";

export function BenchmarkTable({
  videos,
  channels,
  channelsLoading,
  exposures,
}: {
  videos: Video[];
  channels: Record<string, ChannelInfo | null>;
  channelsLoading: boolean;
  exposures: Record<string, ExposureInfo>;
}) {
  const router = useRouter();
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function refreshAll() {
    if (refreshingAll) return;
    setRefreshingAll(true);
    setRefreshMsg("스냅샷 수집 중...");
    try {
      const res = await fetch("/api/snapshots/refresh-all", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRefreshMsg(
          `${data.ok.length}/${data.total} 영상 스냅샷 완료${
            data.failed.length > 0 ? ` (실패 ${data.failed.length})` : ""
          }`,
        );
        router.refresh();
      } else {
        setRefreshMsg(`실패: ${data.error ?? "알 수 없는 오류"}`);
      }
    } catch (err) {
      setRefreshMsg(`실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshingAll(false);
      setTimeout(() => setRefreshMsg(null), 4000);
    }
  }
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const rows = useMemo(
    () =>
      videos.map((v) => {
        const ch = v.channel_id ? channels[v.channel_id] ?? null : null;
        const subs = ch?.subscriber_count ?? null;
        const views = v.view_count;
        const contrib = contribution(views, subs);
        const perf = performance(views, subs, v.upload_date);
        const expo = exposures[v.id] ?? { value: null, grade: null, snapshotCount: 0 };
        return { v, ch, subs, views, contrib, perf, expo };
      }),
    [videos, channels],
  );

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "title":
          return a.v.title.localeCompare(b.v.title) * dir;
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
        case "published": {
          const ad = daysBetween(a.v.upload_date) ?? Number.MAX_SAFE_INTEGER;
          const bd = daysBetween(b.v.upload_date) ?? Number.MAX_SAFE_INTEGER;
          return (ad - bd) * dir;
        }
        case "added":
        default:
          return a.v.created_at.localeCompare(b.v.created_at) * -1 * dir;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const allSelected = videos.length > 0 && videos.every((v) => selected.has(v.id));

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
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
    else setSelected(new Set(videos.map((v) => v.id)));
  }

  async function deleteOne(id: string) {
    if (deletingIds.has(id)) return;
    if (!confirm("이 영상을 벤치마킹 목록에서 삭제할까요?")) return;
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/videos/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function batchDelete() {
    if (selected.size === 0 || batchBusy) return;
    if (!confirm(`선택한 ${selected.size}개 영상을 삭제할까요?`)) return;
    setBatchBusy(true);
    const ids = Array.from(selected);
    try {
      await Promise.all(
        ids.map((id) => fetch(`/api/videos/${id}`, { method: "DELETE" })),
      );
      setSelected(new Set());
      router.refresh();
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-[color:var(--muted)]">
          {selected.size > 0 ? `${selected.size}개 선택됨` : `${videos.length}개`}
        </span>
        {selected.size > 0 && (
          <button
            onClick={batchDelete}
            disabled={batchBusy}
            className="rounded-md border border-red-900/40 bg-red-950/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50"
          >
            {batchBusy ? "삭제 중..." : `선택한 ${selected.size}개 삭제`}
          </button>
        )}
        {channelsLoading && (
          <span className="text-xs text-[color:var(--muted)]">채널 정보 로딩 중…</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {refreshMsg && <span className="text-xs text-[color:var(--muted)]">{refreshMsg}</span>}
          <button
            onClick={refreshAll}
            disabled={refreshingAll || videos.length === 0}
            className="whitespace-nowrap rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-xs hover:border-[color:var(--accent)] disabled:opacity-50"
            title="저장된 모든 영상의 현재 조회수를 스냅샷으로 저장 (노출 확률 계산용)"
          >
            {refreshingAll ? "수집 중..." : "📸 전체 스냅샷 새로고침"}
          </button>
        </div>
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
              <Th>썸네일 ({videos.length})</Th>
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
                <span title="조회수 ÷ 구독자">기여도</span>
              </Th>
              <Th onClick={() => toggleSort("performance")} active={sortKey === "performance"} dir={sortDir} align="center">
                <span title="(조회수÷경과일) ÷ 구독자">성과도</span>
              </Th>
              <Th align="center">
                <span title="Phase 2에서 스냅샷 추적 기반으로 계산됨">노출 확률</span>
              </Th>
              <Th onClick={() => toggleSort("video_count")} active={sortKey === "video_count"} dir={sortDir} align="right">
                총 영상 수
              </Th>
              <Th onClick={() => toggleSort("published")} active={sortKey === "published"} dir={sortDir} align="right">
                게시일
              </Th>
              <Th onClick={() => toggleSort("added")} active={sortKey === "added"} dir={sortDir} align="right">
                추가일
              </Th>
              <Th align="center">액션</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ v, ch, subs, views, contrib, perf, expo }) => {
              const thumbSrc = v.thumbnail_local
                ? `/api/thumbnails/${v.id}`
                : v.thumbnail_url;
              return (
                <tr
                  key={v.id}
                  className="border-t border-[color:var(--border)] hover:bg-[color:var(--card)]"
                >
                  <Td>
                    <input
                      type="checkbox"
                      checked={selected.has(v.id)}
                      onChange={() => toggleSelect(v.id)}
                      aria-label="선택"
                    />
                  </Td>
                  <Td>
                    <Link
                      href={`/video/${v.id}`}
                      className="relative block h-14 w-24 overflow-hidden rounded bg-black"
                    >
                      {thumbSrc && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbSrc}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {v.duration_seconds != null && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[10px]">
                          {formatDuration(v.duration_seconds)}
                        </span>
                      )}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/video/${v.id}`}
                      className="line-clamp-2 block min-w-[240px] max-w-md text-sm leading-snug hover:underline"
                    >
                      {v.title}
                    </Link>
                    {v.user_tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {v.user_tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-[color:var(--border)] px-1 py-0.5 text-[9px] text-[color:var(--muted)]"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td align="right" nowrap>
                    <span className="text-sm">{formatCount(views)}</span>
                  </Td>
                  <Td align="right" nowrap>
                    <div className="text-sm">
                      {ch ? formatCount(subs) : channelsLoading ? "…" : "-"}
                    </div>
                    <div className="text-[10px] text-[color:var(--muted)]">
                      {v.channel_name ?? "-"}
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
                    <div
                      title={
                        expo.detail ??
                        `스냅샷 ${expo.snapshotCount}개${
                          expo.value != null ? ` · 최근 속도가 평균의 ${expo.value.toFixed(2)}배` : ""
                        }`
                      }
                    >
                      <MetricBadge grade={expo.grade} value={expo.value} />
                      {expo.grade == null && expo.snapshotCount > 0 && (
                        <div className="mt-0.5 text-[9px] text-[color:var(--muted)]">
                          {expo.snapshotCount === 1 ? "1회" : `${expo.snapshotCount}회`}
                        </div>
                      )}
                    </div>
                  </Td>
                  <Td align="right" nowrap>
                    <span className="text-sm">
                      {ch?.video_count != null ? formatCount(ch.video_count) : "-"}
                    </span>
                  </Td>
                  <Td align="right" nowrap>
                    <div className="text-xs">
                      {v.upload_date?.slice(0, 10) ?? "-"}
                    </div>
                    {v.upload_date && (
                      <div className="text-[10px] text-[color:var(--muted)]">
                        {formatRelativeDate(v.upload_date)}
                      </div>
                    )}
                  </Td>
                  <Td align="right" nowrap>
                    <div className="text-[10px] text-[color:var(--muted)]">
                      {formatRelativeDate(v.created_at)}
                    </div>
                  </Td>
                  <Td align="center" nowrap>
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={`/video/${v.id}`}
                        className="whitespace-nowrap rounded-md border border-[color:var(--border)] px-2.5 py-1 text-[11px] hover:text-[color:var(--foreground)]"
                      >
                        상세
                      </Link>
                      <button
                        onClick={() => deleteOne(v.id)}
                        disabled={deletingIds.has(v.id)}
                        className="whitespace-nowrap rounded-md border border-red-900/40 px-2.5 py-1 text-[11px] text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                        title="삭제"
                      >
                        {deletingIds.has(v.id) ? "..." : "삭제"}
                      </button>
                    </div>
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

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
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
