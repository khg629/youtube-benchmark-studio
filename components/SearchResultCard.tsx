"use client";

import Link from "next/link";
import { useState } from "react";
import type { SearchResult } from "@/lib/youtube";

export function SearchResultCard({
  result,
  initiallySaved,
}: {
  result: SearchResult;
  initiallySaved: boolean;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(openAfter = false) {
    if (saved || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.url }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        if (openAfter) window.location.href = `/video/${result.id}`;
      }
      else setError(data.error ?? "추가 실패");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] transition hover:border-[color:var(--accent)]">
      <a
        href={result.url}
        target="_blank"
        rel="noreferrer"
        className="relative block aspect-video w-full bg-black"
      >
        {result.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.thumbnail_url}
            alt={result.title}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--muted)]">
            썸네일 없음
          </div>
        )}
        {result.duration_text && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs">
            {result.duration_text}
          </span>
        )}
        {result.is_live && (
          <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold">
            LIVE
          </span>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{result.title}</h3>
        <p className="text-xs text-[color:var(--muted)]">{result.channel_name ?? "알 수 없음"}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[color:var(--muted)]">
          {result.view_count_text && <span>{result.view_count_text}</span>}
          {result.view_count_text && result.published_text && <span>·</span>}
          {result.published_text && <span>{result.published_text}</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {saved ? (
            <Link
              href={`/video/${result.id}`}
              className="flex-1 rounded-md border border-green-700/50 bg-green-900/20 px-3 py-2 text-center text-xs text-green-400"
            >
              ✓ 벤치마킹 목록에 있음
            </Link>
          ) : (
            <>
              <button
                onClick={() => add(false)}
                disabled={busy}
                className="btn-primary flex-1 px-3 py-2 text-xs"
              >
                {busy ? "추가 중..." : "＋ 추가"}
              </button>
              <button
                onClick={() => add(true)}
                disabled={busy}
                className="rounded-md border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
                title="저장한 뒤 상세 페이지에서 댓글·자막·LLM 분석을 이어갑니다"
              >
                상세
              </button>
            </>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
