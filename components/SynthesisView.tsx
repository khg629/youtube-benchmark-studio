"use client";

import { useMemo, useState } from "react";
import { AnalysisMarkdown } from "./AnalysisMarkdown";
import { formatDateTime } from "@/lib/format";
import type { Provider, Synthesis, Video } from "@/lib/types";

const TABS: { provider: Provider; label: string }[] = [
  { provider: "claude", label: "Claude" },
  { provider: "openai", label: "ChatGPT" },
  { provider: "gemini", label: "Gemini" },
];

export function SynthesisView({
  videos,
  providerAvailability,
}: {
  videos: Video[];
  providerAvailability: Record<Provider, boolean>;
}) {
  const [active, setActive] = useState<Provider>("claude");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(videos.map((v) => v.id)));
  const [includeThumbnails, setIncludeThumbnails] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Synthesis | null>(null);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const v of videos) for (const t of v.user_tags) s.add(t);
    return Array.from(s).sort();
  }, [videos]);

  const visibleVideos = useMemo(() => {
    if (!activeTag) return videos;
    return videos.filter((v) => v.user_tags.includes(activeTag));
  }, [videos, activeTag]);

  function toggleAll() {
    if (selectedIds.size === visibleVideos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleVideos.map((v) => v.id)));
    }
  }
  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyTagFilter(tag: string | null) {
    setActiveTag(tag);
    if (tag == null) {
      setSelectedIds(new Set(videos.map((v) => v.id)));
    } else {
      setSelectedIds(new Set(videos.filter((v) => v.user_tags.includes(tag)).map((v) => v.id)));
    }
  }

  async function run(force: boolean) {
    if (busy) return;
    if (selectedIds.size < 3) {
      setError("최소 3개 영상을 선택하세요");
      return;
    }
    if (!providerAvailability[active]) {
      setError("이 LLM 의 API 키가 설정되어 있지 않습니다");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoIds: Array.from(selectedIds),
          provider: active,
          force,
          includeThumbnails,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "분석 실패");
      } else {
        setResult(data.synthesis);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (videos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--border)] py-16 text-center text-sm text-[color:var(--muted)]">
        분석할 영상이 없습니다. 먼저 대시보드에서 영상을 추가하세요.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      {/* 영상 선택 패널 */}
      <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
        <div className="flex items-center justify-between text-sm">
          <h2 className="font-semibold">영상 선택 ({selectedIds.size}/{visibleVideos.length})</h2>
          <button
            onClick={toggleAll}
            className="text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
          >
            {selectedIds.size === visibleVideos.length ? "전체 해제" : "전체 선택"}
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => applyTagFilter(null)}
              className={`rounded px-2 py-1 text-xs ${
                activeTag == null ? "bg-[color:var(--foreground)] text-[color:var(--background)]" : "bg-[color:var(--background)] text-[color:var(--muted)]"
              }`}
            >
              전체
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => applyTagFilter(activeTag === t ? null : t)}
                className={`rounded px-2 py-1 text-xs ${
                  activeTag === t ? "bg-[color:var(--foreground)] text-[color:var(--background)]" : "bg-[color:var(--background)] text-[color:var(--muted)]"
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[480px] overflow-y-auto rounded-md border border-[color:var(--border)]">
          <ul className="text-sm">
            {visibleVideos.map((v) => (
              <li
                key={v.id}
                className="flex items-start gap-2 border-b border-[color:var(--border)] px-3 py-2 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(v.id)}
                  onChange={() => toggle(v.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="line-clamp-2 text-xs">{v.title}</p>
                  <p className="mt-0.5 text-[10px] text-[color:var(--muted)]">
                    {v.channel_name ?? "-"} · {v.upload_date?.slice(0, 10) ?? "-"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeThumbnails}
            onChange={(e) => setIncludeThumbnails(e.target.checked)}
          />
          <span>썸네일 분석 포함 (조회수 상위 12개, 비용 ↑)</span>
        </label>
      </div>

      {/* 분석 결과 패널 */}
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]">
        <div className="flex border-b border-[color:var(--border)]">
          {TABS.map((t) => (
            <button
              key={t.provider}
              onClick={() => {
                setActive(t.provider);
                setError(null);
              }}
              className={`relative flex-1 px-4 py-3 text-sm ${
                active === t.provider
                  ? "bg-[color:var(--card-hover)] text-[color:var(--foreground)] font-medium"
                  : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              }`}
            >
              {t.label}
              {!providerAvailability[t.provider] && (
                <span className="ml-1 text-[10px] text-yellow-500">(키 없음)</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => run(false)}
              disabled={busy || selectedIds.size < 3}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy ? "분석 중... (~1분)" : result ? "다시 보기" : "종합 분석 시작"}
            </button>
            {result && (
              <button
                onClick={() => run(true)}
                disabled={busy}
                className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
              >
                새로 분석
              </button>
            )}
            {result && (
              <span className="ml-auto text-xs text-[color:var(--muted)]">
                {result.model} · 영상 {result.video_count}개 · {formatDateTime(result.created_at)}
              </span>
            )}
          </div>
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          {selectedIds.size < 3 && (
            <p className="mb-2 text-xs text-yellow-300">
              ⚠️ 최소 3개 영상이 필요합니다 (현재 {selectedIds.size}개 선택)
            </p>
          )}
          {result ? (
            <AnalysisMarkdown text={result.response} />
          ) : (
            <p className="text-sm text-[color:var(--muted)]">
              왼쪽에서 영상을 선택하고 <b>"종합 분석 시작"</b>을 누르세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
