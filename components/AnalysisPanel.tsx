"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { Analysis, Provider } from "@/lib/types";
import { AnalysisMarkdown } from "./AnalysisMarkdown";

const TABS: { provider: Provider; label: string }[] = [
  { provider: "claude", label: "Claude" },
  { provider: "openai", label: "ChatGPT" },
  { provider: "gemini", label: "Gemini" },
];

export function AnalysisPanel({
  videoId,
  initialAnalyses,
  providerAvailability,
  commentCount,
}: {
  videoId: string;
  initialAnalyses: Analysis[];
  providerAvailability: Record<Provider, boolean>;
  commentCount: number;
}) {
  const [active, setActive] = useState<Provider>("claude");
  const [analyses, setAnalyses] = useState<Record<Provider, Analysis | null>>(() => {
    const m: Record<Provider, Analysis | null> = { claude: null, openai: null, gemini: null };
    for (const a of initialAnalyses) m[a.provider] = a;
    return m;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = analyses[active];
  const available = providerAvailability[active];

  async function run(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, provider: active, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "분석 실패");
      } else {
        setAnalyses((prev) => ({ ...prev, [active]: data.analysis }));
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
            {analyses[t.provider] && (
              <span className="ml-1 text-[10px] text-green-400">●</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4">
        {!available ? (
          <p className="text-sm text-[color:var(--muted)]">
            <code>.env.local</code> 에{" "}
            <code>
              {active === "claude" ? "ANTHROPIC_API_KEY" : active === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"}
            </code>
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
                {busy ? "분석 중..." : current ? "다시 보기" : "분석하기"}
              </button>
              {current && (
                <button
                  onClick={() => run(true)}
                  disabled={busy}
                  className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
                >
                  새로 분석 (재요청)
                </button>
              )}
              <span className="ml-auto flex items-center gap-3 text-xs text-[color:var(--muted)]">
                {commentCount > 0 ? (
                  <span className="rounded bg-green-900/30 px-2 py-0.5 text-green-400">
                    💬 댓글 {commentCount}개 포함
                  </span>
                ) : (
                  <span title="하단 댓글 패널에서 먼저 댓글을 수집하면 시청자 반응 분석이 함께 포함됩니다">
                    댓글 없이 분석됨
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
              <p className="text-sm text-[color:var(--muted)]">아직 분석 결과가 없습니다.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
