"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCount, formatDateTime } from "@/lib/format";
import type { Comment } from "@/lib/types";

type SortMode = "likes" | "newest" | "original";

const TARGET_OPTIONS: { value: number; label: string }[] = [
  { value: 100, label: "상위 100개" },
  { value: 500, label: "상위 500개" },
  { value: 2000, label: "전체 (최대 2000)" },
];

export function CommentsPanel({
  videoId,
  videoUrl,
  initialComments,
  initialFetchedAt,
}: {
  videoId: string;
  videoUrl: string;
  initialComments: Comment[];
  initialFetchedAt: string | null;
}) {
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [fetchedAt, setFetchedAt] = useState<string | null>(initialFetchedAt);
  const [target, setTarget] = useState(100);
  const [ytSort, setYtSort] = useState<"TOP_COMMENTS" | "NEWEST_FIRST">("TOP_COMMENTS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("original");
  const [query, setQuery] = useState("");

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, target, sort: ytSort }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "댓글 수집 실패");
      } else {
        setFetchedAt(data.fetched_at);
        setExhausted(Boolean(data.exhausted));
        // 새로 받은 리스트 로드
        const g = await fetch(`/api/comments?videoId=${videoId}`).then((r) => r.json());
        setComments(g.comments ?? []);
        // 부모 서버 컴포넌트 재렌더 → CommentInsightPanel 의 commentCount 갱신
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const topLevels = useMemo(() => comments.filter((c) => !c.parent_id), [comments]);
  const repliesByParent = useMemo(() => {
    const m = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const arr = m.get(c.parent_id) ?? [];
        arr.push(c);
        m.set(c.parent_id, arr);
      }
    }
    return m;
  }, [comments]);

  const filteredTops = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = topLevels;
    if (q) {
      arr = arr.filter((c) => {
        if (c.text.toLowerCase().includes(q) || (c.author ?? "").toLowerCase().includes(q)) return true;
        const rs = repliesByParent.get(c.id) ?? [];
        return rs.some((r) => r.text.toLowerCase().includes(q) || (r.author ?? "").toLowerCase().includes(q));
      });
    }
    if (sortMode === "original") return arr;
    return [...arr].sort((a, b) => {
      if (sortMode === "likes") return (b.like_count ?? 0) - (a.like_count ?? 0);
      return b.position - a.position;
    });
  }, [topLevels, repliesByParent, query, sortMode]);

  const hasComments = comments.length > 0;
  const topCount = topLevels.length;
  const replyCount = comments.length - topCount;

  // 구버전(youtubei.js) 감지: 최상위만 있고 답글이 0개인데, 답글이 달린 댓글이 있음
  const commentsWithReplies = useMemo(
    () => topLevels.filter((c) => (c.reply_count ?? 0) > 0).length,
    [topLevels],
  );
  const isLegacyData = hasComments && replyCount === 0 && commentsWithReplies > 0;

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold">댓글</h3>
        {hasComments && (
          <span className="text-xs text-[color:var(--muted)]">
            댓글 {formatCount(topCount)}개
            {replyCount > 0 && ` + 답글 ${formatCount(replyCount)}개`}
            {fetchedAt && ` · ${formatDateTime(fetchedAt)}`}
            {exhausted && " · 모두 수집"}
          </span>
        )}
      </div>

      {isLegacyData && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] bg-yellow-950/20 px-4 py-3 text-xs">
          <div className="flex items-start gap-2">
            <span className="text-sm">⚠️</span>
            <div>
              <p className="text-yellow-200">
                답글이 달린 댓글 <b>{commentsWithReplies}개</b>가 있지만 답글이 수집되지 않은 상태입니다.
              </p>
              <p className="mt-0.5 text-yellow-300/70">
                구버전으로 수집된 데이터예요. <b>"새로 수집"</b>을 누르면 답글까지 가져와 앱 안에서 펼쳐 볼 수 있습니다.
              </p>
            </div>
          </div>
          <button
            onClick={run}
            disabled={busy}
            className="whitespace-nowrap rounded-md border border-yellow-600/40 bg-yellow-900/30 px-3 py-1.5 text-xs text-yellow-100 hover:bg-yellow-900/50 disabled:opacity-50"
          >
            {busy ? "수집 중..." : "답글 포함해서 새로 수집"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] px-4 py-3 text-sm">
        <select
          value={target}
          onChange={(e) => setTarget(parseInt(e.target.value, 10))}
          disabled={busy}
          className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1.5 text-sm"
        >
          {TARGET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={ytSort}
          onChange={(e) => setYtSort(e.target.value as "TOP_COMMENTS" | "NEWEST_FIRST")}
          disabled={busy}
          className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1.5 text-sm"
          title="YouTube 정렬 기준"
        >
          <option value="TOP_COMMENTS">인기순 수집</option>
          <option value="NEWEST_FIRST">최신순 수집</option>
        </select>
        <button
          onClick={run}
          disabled={busy}
          className="btn-primary px-4 py-1.5 text-sm"
        >
          {busy ? "수집 중..." : hasComments ? "새로 수집" : "댓글 가져오기"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {hasComments && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] px-4 py-2 text-xs">
          <input
            placeholder="댓글 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56 rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1 text-sm outline-none focus:border-[color:var(--accent)]"
          />
          <div className="flex gap-1 rounded-md border border-[color:var(--border)] p-0.5">
            {([
              ["original", "수집순"],
              ["likes", "좋아요순"],
              ["newest", "역순"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSortMode(k)}
                className={`rounded px-2 py-1 ${
                  sortMode === k ? "bg-[color:var(--accent)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[color:var(--muted)]">
            {filteredTops.length} / {topCount}
          </span>
        </div>
      )}

      <div className="max-h-[600px] overflow-y-auto">
        {!hasComments ? (
          <p className="px-4 py-10 text-center text-sm text-[color:var(--muted)]">
            아직 수집된 댓글이 없습니다. 위에서 개수를 선택하고 "댓글 가져오기"를 눌러주세요.
          </p>
        ) : filteredTops.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[color:var(--muted)]">
            검색 결과가 없습니다.
          </p>
        ) : (
          <ul>
            {filteredTops.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                videoUrl={videoUrl}
                replies={repliesByParent.get(c.id) ?? []}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  videoUrl,
  replies = [],
  isReply = false,
}: {
  comment: Comment;
  videoUrl: string;
  replies?: Comment[];
  isReply?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const localReplyCount = replies.length;
  const totalReplyCount = comment.reply_count ?? 0;
  const hasAnyReplies = totalReplyCount > 0 || localReplyCount > 0;
  const permalink = `${videoUrl}${videoUrl.includes("?") ? "&" : "?"}lc=${comment.id}`;

  return (
    <li
      className={`border-b border-[color:var(--border)] last:border-b-0 ${
        comment.is_pinned ? "bg-yellow-900/10" : ""
      } ${isReply ? "border-b-0" : ""}`}
    >
      <div className={`flex gap-3 px-4 py-3 ${isReply ? "pl-14" : ""}`}>
        {comment.author_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.author_thumbnail}
            alt=""
            className={`flex-shrink-0 rounded-full ${isReply ? "h-6 w-6" : "h-8 w-8"}`}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className={`flex-shrink-0 rounded-full bg-[color:var(--border)] ${
              isReply ? "h-6 w-6" : "h-8 w-8"
            }`}
          />
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`font-medium ${comment.is_channel_owner ? "text-[color:var(--accent)]" : ""}`}
            >
              {comment.author ?? "익명"}
            </span>
            {comment.is_channel_owner && (
              <span className="rounded bg-[color:var(--accent)]/20 px-1 text-[10px] text-[color:var(--accent)]">
                채널 주인
              </span>
            )}
            <span className="text-[color:var(--muted)]">{comment.published_text ?? ""}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.text}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-[color:var(--muted)]">
            {comment.like_count != null && <span>👍 {formatCount(comment.like_count)}</span>}
            {!isReply && hasAnyReplies && localReplyCount > 0 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-[color:var(--accent)] hover:underline"
              >
                {expanded
                  ? "답글 숨기기"
                  : `답글 ${formatCount(localReplyCount)}개${
                      totalReplyCount > localReplyCount ? ` (전체 ${formatCount(totalReplyCount)})` : ""
                    } 보기`}
              </button>
            )}
            {!isReply && hasAnyReplies && localReplyCount === 0 && (
              <a
                href={permalink}
                target="_blank"
                rel="noreferrer"
                className="text-[color:var(--accent)] hover:underline"
              >
                💬 답글 {formatCount(totalReplyCount)}개 ↗
              </a>
            )}
            {!isReply && expanded && totalReplyCount > localReplyCount && (
              <a
                href={permalink}
                target="_blank"
                rel="noreferrer"
                className="text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              >
                나머지 YouTube에서 보기 ↗
              </a>
            )}
          </div>
        </div>
      </div>
      {!isReply && expanded && localReplyCount > 0 && (
        <ul className="bg-[color:var(--background)]/40">
          {replies.map((r) => (
            <CommentItem key={r.id} comment={r} videoUrl={videoUrl} isReply />
          ))}
        </ul>
      )}
    </li>
  );
}
