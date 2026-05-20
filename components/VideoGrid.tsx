"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChannelInfo } from "@/lib/channel";
import type { Video } from "@/lib/types";
import { viewsPerDay } from "@/lib/format";
import { BenchmarkTable } from "./BenchmarkTable";
import { VideoCard } from "./VideoCard";
import type { ExposureInfo } from "@/app/page";

type Sort = "added" | "views" | "uploaded" | "vpd";
type ViewMode = "card" | "table";
const VIEW_KEY = "dashboard-view-mode";

export function VideoGrid({
  videos,
  exposures,
}: {
  videos: Video[];
  exposures: Record<string, ExposureInfo>;
}) {
  const [sort, setSort] = useState<Sort>("added");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [channels, setChannels] = useState<Record<string, ChannelInfo | null>>({});
  const [channelsLoading, setChannelsLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "card" || saved === "table") setViewMode(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "table") return;
    const ids = Array.from(
      new Set(
        videos.map((v) => v.channel_id).filter((id): id is string => Boolean(id)),
      ),
    );
    if (ids.length === 0) return;
    let cancelled = false;

    async function fetchOnce(ids: string[]): Promise<Record<string, ChannelInfo | null>> {
      const res = await fetch("/api/channel-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: ids }),
      });
      const data = await res.json();
      return (data.channels ?? {}) as Record<string, ChannelInfo | null>;
    }

    setChannelsLoading(true);
    (async () => {
      try {
        const first = await fetchOnce(ids);
        if (cancelled) return;
        setChannels((prev) => ({ ...prev, ...first }));
        const failed = Object.entries(first)
          .filter(([, v]) => v === null)
          .map(([k]) => k);
        if (failed.length > 0) {
          await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;
          const retried = await fetchOnce(failed);
          if (cancelled) return;
          setChannels((prev) => ({ ...prev, ...retried }));
        }
      } finally {
        if (!cancelled) setChannelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videos, viewMode]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const v of videos) for (const t of v.user_tags) s.add(t);
    return Array.from(s).sort();
  }, [videos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = videos.filter((v) => {
      if (activeTag && !v.user_tags.includes(activeTag)) return false;
      if (!q) return true;
      return (
        v.title.toLowerCase().includes(q) ||
        (v.channel_name ?? "").toLowerCase().includes(q)
      );
    });
    arr = [...arr];
    switch (sort) {
      case "added":
        arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case "views":
        arr.sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));
        break;
      case "uploaded":
        arr.sort((a, b) => (b.upload_date ?? "").localeCompare(a.upload_date ?? ""));
        break;
      case "vpd":
        arr.sort(
          (a, b) =>
            (viewsPerDay(b.view_count, b.upload_date) ?? 0) -
            (viewsPerDay(a.view_count, a.upload_date) ?? 0),
        );
        break;
    }
    return arr;
  }, [videos, query, sort, activeTag]);

  if (videos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--border)] py-16 text-center text-sm text-[color:var(--muted)]">
        아직 영상이 없습니다. 위에 YouTube URL을 붙여넣거나 검색 페이지에서 추가하세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="제목/채널 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-48 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        />
        {viewMode === "card" && (
          <div className="flex gap-1 rounded-md border border-[color:var(--border)] p-1 text-xs">
            {([
              ["added", "추가순"],
              ["views", "조회수"],
              ["uploaded", "업로드순"],
              ["vpd", "조회수/일"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`rounded px-2 py-1 ${
                  sort === key ? "bg-[color:var(--accent)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded px-2 py-1 text-xs ${
                activeTag === null ? "bg-[color:var(--foreground)] text-[color:var(--background)]" : "bg-[color:var(--card)] text-[color:var(--muted)]"
              }`}
            >
              전체
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTag(t === activeTag ? null : t)}
                className={`rounded px-2 py-1 text-xs ${
                  activeTag === t ? "bg-[color:var(--foreground)] text-[color:var(--background)]" : "bg-[color:var(--card)] text-[color:var(--muted)]"
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto text-xs text-[color:var(--muted)]">
          {filtered.length} / {videos.length} 개
        </span>
        <div className="flex gap-1 rounded-md border border-[color:var(--border)] p-1 text-xs">
          <button
            onClick={() => setViewMode("table")}
            className={`rounded px-2 py-1 ${
              viewMode === "table" ? "bg-[color:var(--accent)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            }`}
          >
            ☰ 테이블
          </button>
          <button
            onClick={() => setViewMode("card")}
            className={`rounded px-2 py-1 ${
              viewMode === "card" ? "bg-[color:var(--accent)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            }`}
          >
            ▦ 카드
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <BenchmarkTable
          videos={filtered}
          channels={channels}
          channelsLoading={channelsLoading}
          exposures={exposures}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
