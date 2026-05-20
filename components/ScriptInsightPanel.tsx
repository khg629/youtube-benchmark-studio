"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnalysisMarkdown } from "./AnalysisMarkdown";
import { formatDateTime } from "@/lib/format";
import type { Provider, ScriptInsight, VideoTranscript } from "@/lib/types";

const TABS: { provider: Provider; label: string }[] = [
  { provider: "claude", label: "Claude" },
  { provider: "openai", label: "ChatGPT" },
  { provider: "gemini", label: "Gemini" },
];

export function ScriptInsightPanel({
  videoId,
  initialTranscript,
  initialInsights,
  providerAvailability,
}: {
  videoId: string;
  initialTranscript: VideoTranscript | null;
  initialInsights: ScriptInsight[];
  providerAvailability: Record<Provider, boolean>;
}) {
  const router = useRouter();
  const [transcript, setTranscript] = useState<VideoTranscript | null>(initialTranscript);
  const [active, setActive] = useState<Provider>("claude");
  const [insights, setInsights] = useState<Record<Provider, ScriptInsight | null>>(() => {
    const m: Record<Provider, ScriptInsight | null> = {
      claude: null,
      openai: null,
      gemini: null,
    };
    for (const a of initialInsights) m[a.provider] = a;
    return m;
  });
  const [busy, setBusy] = useState(false);
  const [fetchingScript, setFetchingScript] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullScript, setShowFullScript] = useState(false);

  const current = insights[active];
  const available = providerAvailability[active];
  const stale =
    current != null && transcript != null && current.segment_count !== transcript.segment_count;

  async function fetchScript(force: boolean) {
    if (fetchingScript) return;
    setFetchingScript(true);
    setError(null);
    try {
      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "자막 가져오기 실패");
      } else {
        setTranscript(data.transcript);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingScript(false);
    }
  }

  async function runInsight(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/script-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, provider: active, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "스크립트 분석 실패");
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
      {/* 자막 상태 영역 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold">자막</h3>
        {transcript ? (
          <span className="text-xs text-[color:var(--muted)]">
            {transcript.language ?? "-"} · {transcript.segment_count}개 세그먼트 ·{" "}
            {formatDateTime(transcript.fetched_at)}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--muted)]">아직 가져오지 않음</span>
        )}
        <button
          onClick={() => fetchScript(transcript != null)}
          disabled={fetchingScript}
          className="ml-auto whitespace-nowrap rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 text-xs hover:border-[color:var(--accent)] disabled:opacity-50"
        >
          {fetchingScript
            ? "가져오는 중..."
            : transcript
              ? "다시 가져오기"
              : "자막 가져오기"}
        </button>
        {transcript && (
          <button
            onClick={() => setShowFullScript((v) => !v)}
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
          >
            {showFullScript ? "자막 숨기기" : "자막 보기"}
          </button>
        )}
      </div>

      {transcript && showFullScript && (
        <div className="max-h-[300px] overflow-y-auto border-b border-[color:var(--border)] px-4 py-3 text-xs leading-relaxed">
          {transcript.segments.map((s, i) => (
            <p key={i} className="mb-1">
              <span className="mr-2 text-[color:var(--muted)]">
                {Math.floor(s.start_ms / 60000)}:
                {String(Math.floor((s.start_ms % 60000) / 1000)).padStart(2, "0")}
              </span>
              {s.text}
            </p>
          ))}
        </div>
      )}

      {/* LLM 분석 탭 */}
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
        {!transcript ? (
          <p className="text-sm text-[color:var(--muted)]">
            먼저 위에서 <b>자막 가져오기</b>를 눌러주세요. 자막이 있어야 스크립트 분석이 가능합니다.
          </p>
        ) : !available ? (
          <p className="text-sm text-[color:var(--muted)]">
            <code>.env.local</code> 또는 설정 페이지에 해당 LLM 의 API 키를 설정하세요.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => runInsight(false)}
                disabled={busy}
                className="btn-primary px-4 py-2 text-sm"
              >
                {busy ? "분석 중..." : current ? "다시 보기" : "스크립트 분석"}
              </button>
              {current && (
                <button
                  onClick={() => runInsight(true)}
                  disabled={busy}
                  className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
                >
                  새로 분석
                </button>
              )}
              <span className="ml-auto flex items-center gap-3 text-xs text-[color:var(--muted)]">
                <span className="rounded bg-green-900/30 px-2 py-0.5 text-green-400">
                  📜 자막 {transcript.segment_count}개 분석
                </span>
                {stale && (
                  <span
                    className="rounded bg-yellow-900/30 px-2 py-0.5 text-yellow-300"
                    title={`기존 분석은 자막 ${current?.segment_count}개 기준. 자막이 다시 수집되었습니다.`}
                  >
                    ⚠️ 자막 갱신됨 — 재분석 권장
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
                <b>"스크립트 분석"</b>을 눌러 영상의 훅·전개·시청 유지 장치를 도출하세요.
              </p>
            )}
          </>
        )}
        {error && !available && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
