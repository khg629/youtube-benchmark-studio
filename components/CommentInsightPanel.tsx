"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { CommentInsight, Provider } from "@/lib/types";
import { AnalysisMarkdown } from "./AnalysisMarkdown";

const TABS: { provider: Provider; label: string }[] = [
  { provider: "claude", label: "Claude" },
  { provider: "openai", label: "ChatGPT" },
  { provider: "gemini", label: "Gemini" },
];

export function CommentInsightPanel({
  videoId,
  initialInsights,
  providerAvailability,
  commentCount,
}: {
  videoId: string;
  initialInsights: CommentInsight[];
  providerAvailability: Record<Provider, boolean>;
  commentCount: number;
}) {
  const [active, setActive] = useState<Provider>("claude");
  const [insights, setInsights] = useState<Record<Provider, CommentInsight | null>>(() => {
    const m: Record<Provider, CommentInsight | null> = {
      claude: null,
      openai: null,
      gemini: null,
    };
    for (const a of initialInsights) m[a.provider] = a;
    return m;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = insights[active];
  const available = providerAvailability[active];
  const stale = current != null && current.comment_count !== commentCount;

  async function run(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/comment-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, provider: active, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "댓글 인사이트 분석 실패");
      } else {
        setInsights((prev) => ({ ...prev, [active]: data.insight }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
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
            {insights[t.provider] && <span className="ml-1 text-[10px] text-green-400">●</span>}
          </button>
        ))}
      </div>

      <div className="p-4">
        {commentCount === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">
            먼저 하단 댓글 패널에서 <b>댓글을 수집</b>해야 인사이트 분석이 가능합니다.
          </p>
        ) : !available ? (
          <p className="text-sm text-[color:var(--muted)]">
            <code>.env.local</code> 에{" "}
            <code>
              {active === "claude"
                ? "ANTHROPIC_API_KEY"
                : active === "openai"
                  ? "OPENAI_API_KEY"
                  : "GEMINI_API_KEY"}
            </code>{" "}
            를 설정한 뒤 서버를 재시작하세요.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => run(false)}
                disabled={busy}
                className="btn-primary px-4 py-2 text-sm"
              >
                {busy ? "분석 중..." : current ? "다시 보기" : "인사이트 뽑기"}
              </button>
              {current && (
                <button
                  onClick={() => run(true)}
                  disabled={busy}
                  className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
                >
                  새로 분석
                </button>
              )}
              <span className="ml-auto flex items-center gap-3 text-xs text-[color:var(--muted)]">
                <span className="rounded bg-green-900/30 px-2 py-0.5 text-green-400">
                  💬 댓글 {commentCount}개 분석
                </span>
                {stale && (
                  <span
                    className="rounded bg-yellow-900/30 px-2 py-0.5 text-yellow-300"
                    title={`기존 분석은 댓글 ${current?.comment_count}개 기준. 댓글이 새로 수집되었습니다.`}
                  >
                    ⚠️ 댓글 새로 수집됨 — 재분석 권장
                  </span>
                )}
                {current && (
                  <span>
                    {current.model} · {formatDateTime(current.created_at)}
                  </span>
                )}
              </span>
            </div>
            {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
            {current ? (
              <AnalysisMarkdown text={current.response} />
            ) : (
              <p className="text-sm text-[color:var(--muted)]">
                아직 인사이트가 없습니다. <b>"인사이트 뽑기"</b>를 눌러 댓글에서 다음 영상 아이디어를 추출하세요.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
