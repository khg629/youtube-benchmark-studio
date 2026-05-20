"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Video } from "@/lib/types";
import { formatCount, formatDuration, formatRelativeDate, viewsPerDay } from "@/lib/format";

export function VideoCard({ video }: { video: Video }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const thumbSrc = video.thumbnail_local
    ? `/api/thumbnails/${video.id}`
    : video.thumbnail_url;
  const vpd = viewsPerDay(video.view_count, video.upload_date);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    if (!confirm(`"${video.title}"\n\n이 영상을 목록에서 삭제할까요?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <Link
      href={`/video/${video.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] transition hover:border-[color:var(--accent)] ${
        deleting ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <button
        type="button"
        onClick={handleDelete}
        aria-label="삭제"
        title="목록에서 삭제"
        className="absolute right-2 top-2 z-10 hidden h-7 w-7 items-center justify-center rounded-full bg-black/70 text-sm text-white transition hover:bg-red-600 group-hover:flex"
      >
        ✕
      </button>
      <div className="relative aspect-video w-full bg-black">
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt={video.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--muted)]">
            썸네일 없음
          </div>
        )}
        {video.duration_seconds != null && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs">
            {formatDuration(video.duration_seconds)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-[color:var(--foreground)]">
          {video.title}
        </h3>
        <p className="text-xs text-[color:var(--muted)]">{video.channel_name ?? "알 수 없음"}</p>
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-[color:var(--muted)]">
          <span>조회수 {formatCount(video.view_count)}</span>
          <span>·</span>
          <span>{formatRelativeDate(video.upload_date)}</span>
          {vpd != null && video.view_count != null && (
            <>
              <span>·</span>
              <span title="일평균 조회수">{formatCount(Math.round(vpd))}/일</span>
            </>
          )}
        </div>
        {video.user_tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {video.user_tags.map((t) => (
              <span
                key={t}
                className="rounded bg-[color:var(--border)] px-1.5 py-0.5 text-[10px] text-[color:var(--muted)]"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
