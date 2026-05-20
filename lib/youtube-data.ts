import { requireApiKey } from "./settings";
import type { FetchedComment } from "./youtube";

interface DataApiComment {
  id: string;
  snippet: {
    authorDisplayName?: string;
    authorProfileImageUrl?: string;
    authorChannelId?: { value?: string };
    textDisplay?: string;
    textOriginal?: string;
    likeCount?: number;
    publishedAt?: string;
    updatedAt?: string;
    parentId?: string;
  };
}

interface DataApiCommentThread {
  id: string;
  snippet: {
    topLevelComment: DataApiComment;
    totalReplyCount?: number;
    videoOwnerChannelId?: string;
    canReply?: boolean;
    isPublic?: boolean;
  };
  replies?: {
    comments: DataApiComment[];
  };
}

interface ThreadsResponse {
  items: DataApiCommentThread[];
  nextPageToken?: string;
  pageInfo?: { totalResults: number };
}

interface CommentsResponse {
  items: DataApiComment[];
  nextPageToken?: string;
}

interface DataApiError {
  error?: { code: number; message: string; errors?: { reason: string; domain: string }[] };
}

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, ""); // strip remaining tags
}

function commentToFetched(
  c: DataApiComment,
  parentId: string | null,
  videoOwnerChannelId?: string,
  replyCount?: number,
): FetchedComment {
  const sn = c.snippet;
  const text = decodeHtml(sn.textDisplay ?? sn.textOriginal ?? "");
  const authorChannelId = sn.authorChannelId?.value;
  const isOwner = Boolean(
    videoOwnerChannelId && authorChannelId && authorChannelId === videoOwnerChannelId,
  );
  return {
    id: c.id,
    parent_id: parentId,
    author: sn.authorDisplayName ?? null,
    author_thumbnail: sn.authorProfileImageUrl ?? null,
    text,
    like_count: typeof sn.likeCount === "number" ? sn.likeCount : null,
    reply_count: replyCount ?? null,
    published_text: sn.publishedAt ?? null,
    is_pinned: false, // Data API v3는 pinned 여부 제공 안 함
    is_creator_heart: false, // 하트도 제공 안 함
    is_channel_owner: isOwner,
  };
}

async function callCommentThreads(
  apiKey: string,
  videoId: string,
  order: "relevance" | "time",
  pageToken: string | null,
  maxResults: number,
): Promise<ThreadsResponse> {
  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
  url.searchParams.set("part", "snippet,replies");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("order", order);
  url.searchParams.set("maxResults", String(Math.min(100, maxResults)));
  url.searchParams.set("textFormat", "plainText");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  const data = (await res.json()) as ThreadsResponse & DataApiError;
  if (!res.ok || data.error) {
    const reason = data.error?.errors?.[0]?.reason ?? "";
    if (reason === "commentsDisabled") {
      throw new Error("이 영상은 댓글이 비활성화되어 있습니다.");
    }
    throw new Error(`YouTube Data API 오류: ${data.error?.message ?? res.statusText}`);
  }
  return data;
}

async function callComments(
  apiKey: string,
  parentId: string,
  pageToken: string | null,
): Promise<CommentsResponse> {
  const url = new URL("https://www.googleapis.com/youtube/v3/comments");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("parentId", parentId);
  url.searchParams.set("maxResults", "100");
  url.searchParams.set("textFormat", "plainText");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  const data = (await res.json()) as CommentsResponse & DataApiError;
  if (!res.ok || data.error) {
    throw new Error(`답글 조회 실패: ${data.error?.message ?? res.statusText}`);
  }
  return data;
}

export interface FetchViaApiOptions {
  target: number;
  order?: "relevance" | "time";
  includeReplies?: boolean;
  maxRepliesPerThread?: number;
}

export async function fetchCommentsViaApi(
  videoId: string,
  opts: FetchViaApiOptions,
): Promise<{
  comments: FetchedComment[];
  topLevelCount: number;
  repliesCount: number;
  exhausted: boolean;
}> {
  const apiKey = requireApiKey("youtube");
  const target = Math.max(1, opts.target);
  const order = opts.order ?? "relevance";
  const includeReplies = opts.includeReplies !== false;
  const maxRepliesPerThread = opts.maxRepliesPerThread ?? 30;

  const topLevels: { fc: FetchedComment; threadId: string; totalReplyCount: number }[] = [];
  const repliesByThread = new Map<string, FetchedComment[]>();

  let pageToken: string | null = null;
  let exhausted = false;
  let videoOwnerChannelId: string | undefined;

  while (topLevels.length < target) {
    const need = target - topLevels.length;
    const batch: ThreadsResponse = await callCommentThreads(apiKey, videoId, order, pageToken, need);
    for (const t of batch.items) {
      if (!t.snippet.topLevelComment) continue;
      if (!videoOwnerChannelId) videoOwnerChannelId = t.snippet.videoOwnerChannelId;

      const fc = commentToFetched(
        t.snippet.topLevelComment,
        null,
        videoOwnerChannelId,
        t.snippet.totalReplyCount ?? 0,
      );
      topLevels.push({
        fc,
        threadId: t.id,
        totalReplyCount: t.snippet.totalReplyCount ?? 0,
      });

      // 첫 페이지 응답에는 보통 최대 5개 답글이 embedded
      if (includeReplies && t.replies?.comments && t.replies.comments.length > 0) {
        const embedded: FetchedComment[] = t.replies.comments
          .slice(0, maxRepliesPerThread)
          .map((c) => commentToFetched(c, t.id, videoOwnerChannelId));
        repliesByThread.set(t.id, embedded);
      }

      if (topLevels.length >= target) break;
    }
    pageToken = batch.nextPageToken ?? null;
    if (!pageToken) {
      exhausted = true;
      break;
    }
  }

  // 답글이 embedded 5개보다 많은 스레드는 comments.list로 추가 조회
  if (includeReplies) {
    const needsMore = topLevels.filter((t) => {
      const already = repliesByThread.get(t.threadId)?.length ?? 0;
      return t.totalReplyCount > already && already < maxRepliesPerThread;
    });

    const concurrency = 4;
    let cursor = 0;
    async function worker() {
      while (cursor < needsMore.length) {
        const my = cursor++;
        const t = needsMore[my];
        const existing = repliesByThread.get(t.threadId) ?? [];
        const existingIds = new Set(existing.map((r) => r.id));
        const collected: FetchedComment[] = [...existing];
        let token: string | null = null;
        while (collected.length < maxRepliesPerThread) {
          try {
            const res: CommentsResponse = await callComments(apiKey, t.threadId, token);
            for (const c of res.items) {
              if (existingIds.has(c.id)) continue;
              existingIds.add(c.id);
              collected.push(commentToFetched(c, t.threadId, videoOwnerChannelId));
              if (collected.length >= maxRepliesPerThread) break;
            }
            if (!res.nextPageToken || collected.length >= maxRepliesPerThread) break;
            token = res.nextPageToken;
          } catch {
            break;
          }
        }
        repliesByThread.set(t.threadId, collected.slice(0, maxRepliesPerThread));
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, needsMore.length) }, worker));
  }

  // flatten: 최상위 → 답글 순서
  const flat: FetchedComment[] = [];
  for (const t of topLevels) {
    flat.push(t.fc);
    const rs = repliesByThread.get(t.threadId) ?? [];
    flat.push(...rs);
  }

  return {
    comments: flat,
    topLevelCount: topLevels.length,
    repliesCount: flat.length - topLevels.length,
    exhausted,
  };
}
