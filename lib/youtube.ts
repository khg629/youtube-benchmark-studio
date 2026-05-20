import { Innertube, YTNodes } from "youtubei.js";
import type { FetchedVideo } from "./types";
import { installYtJsEvaluator } from "./youtube-runtime";
import { innertubeAuthed } from "./youtube-auth";

installYtJsEvaluator();

export type SearchSortBy = "relevance" | "rating" | "upload_date" | "view_count";
export type SearchUploadDate = "all" | "hour" | "today" | "week" | "month" | "year";
export type SearchDuration = "all" | "short" | "medium" | "long";

export interface SearchResult {
  id: string;
  url: string;
  title: string;
  channel_name: string | null;
  channel_id: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  view_count_text: string | null;
  published_text: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
  is_live: boolean;
}

export function parseViewCountText(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.replace(/조회수|회|views|view/gi, "").trim();
  const mult = (m: string) => {
    const c = m.toUpperCase();
    if (c === "K" || c === "천") return 1_000;
    if (c === "M") return 1_000_000;
    if (c === "B") return 1_000_000_000;
    if (c === "만") return 10_000;
    if (c === "억") return 100_000_000;
    return 1;
  };
  const mShort = t.match(/([\d,]+(?:\.\d+)?)\s*(K|M|B|천|만|억)/i);
  if (mShort) return Math.round(parseFloat(mShort[1].replace(/,/g, "")) * mult(mShort[2]));
  const mPlain = t.match(/([\d,]+)/);
  if (mPlain) return parseInt(mPlain[1].replace(/,/g, ""), 10);
  return null;
}

function parseRelativePublished(text: string | null | undefined): string | null {
  if (!text) return null;
  const now = Date.now();
  // 축약형/풀 네임/한글 모두 지원. 긴 패턴 먼저 매치해서 mo/m, wk/w 혼선 방지
  const m = text.match(
    /(\d+)\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?|secs?|mins?|hrs?|wks?|yrs?|mo|초|분|시간|일|주|개월|년|s|m|h|d|w|y)/i,
  );
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();

  const secondsPerUnit: Record<string, number> = {
    // seconds
    s: 1, sec: 1, secs: 1, second: 1, seconds: 1, "초": 1,
    // minutes (주의: 'm' 단독은 minute로 취급, month는 'mo')
    m: 60, min: 60, mins: 60, minute: 60, minutes: 60, "분": 60,
    // hours
    h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, "시간": 3600,
    // days
    d: 86400, day: 86400, days: 86400, "일": 86400,
    // weeks
    w: 604800, wk: 604800, wks: 604800, week: 604800, weeks: 604800, "주": 604800,
    // months
    mo: 2592000, month: 2592000, months: 2592000, "개월": 2592000,
    // years
    y: 31536000, yr: 31536000, yrs: 31536000, year: 31536000, years: 31536000, "년": 31536000,
  };

  const sec = secondsPerUnit[unit];
  if (!sec) return null;
  return new Date(now - n * sec * 1000).toISOString();
}

let _yt: Innertube | null = null;

async function innertube(): Promise<Innertube> {
  if (_yt) return _yt;
  _yt = await Innertube.create({ lang: "ko", location: "KR" });
  return _yt;
}

function isLoginRequiredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /sign in|login|private|members[- ]?only|age|restricted/i.test(msg);
}

export async function getVideoInfoWithFallback(videoId: string) {
  const anon = await innertube();
  try {
    return await anon.getInfo(videoId);
  } catch (err) {
    if (!isLoginRequiredError(err)) throw err;
    const authed = await innertubeAuthed();
    if (!authed) {
      throw new Error("이 영상은 비공개/제한 영상입니다. 설정에서 YouTube 계정을 연결하세요.");
    }
    return await authed.getInfo(videoId);
  }
}

export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) {
        const id = parts[shortsIdx + 1];
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) {
        const id = parts[embedIdx + 1];
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
    }
  } catch {
    // not a URL
  }
  return null;
}

function pickBestThumbnail(thumbnails: { url: string; width?: number; height?: number }[]): string | null {
  if (!thumbnails || thumbnails.length === 0) return null;
  return thumbnails.reduce((a, b) => ((a.width ?? 0) > (b.width ?? 0) ? a : b)).url;
}

function parseUploadDate(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw.toISOString();
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString();
  return raw;
}

export async function fetchVideoMetadata(videoId: string): Promise<FetchedVideo> {
  const info = await getVideoInfoWithFallback(videoId);
  const primary = (info as unknown as { primary_info?: { published?: { text?: string } } })
    .primary_info;
  const microformat = (info as unknown as {
    microformat?: { publish_date?: string | Date; upload_date?: string | Date };
  }).microformat;
  const basic = info.basic_info as unknown as {
    title?: string;
    channel?: { name?: string; id?: string };
    author?: string;
    channel_id?: string;
    view_count?: number;
    like_count?: number;
    duration?: number;
    short_description?: string;
    thumbnail?: { url: string; width?: number; height?: number }[];
    tags?: string[];
    keywords?: string[];
    upload_date?: string | Date | null;
    publish_date?: string | Date | null;
    start_timestamp?: string | Date | null;
  };

  const title = basic.title ?? "(제목 없음)";
  const channelName = basic.channel?.name ?? basic.author ?? null;
  const channelId = basic.channel?.id ?? basic.channel_id ?? null;
  const thumbnail = basic.thumbnail ? pickBestThumbnail(basic.thumbnail) : null;
  const uploadDate =
    parseUploadDate(microformat?.publish_date) ??
    parseUploadDate(microformat?.upload_date) ??
    parseUploadDate(basic.upload_date) ??
    parseUploadDate(basic.publish_date) ??
    parseUploadDate(basic.start_timestamp) ??
    parseUploadDate(primary?.published?.text);
  const tags = basic.tags ?? basic.keywords ?? [];

  return {
    id: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    channel_name: channelName,
    channel_id: channelId,
    thumbnail_url: thumbnail,
    view_count: typeof basic.view_count === "number" ? basic.view_count : null,
    like_count: typeof basic.like_count === "number" ? basic.like_count : null,
    duration_seconds: typeof basic.duration === "number" ? basic.duration : null,
    upload_date: uploadDate,
    description: basic.short_description ?? null,
    tags,
  };
}

type SearchLike = { results: unknown[]; getContinuation: () => Promise<SearchLike> };

function parseSearchNodes(nodes: unknown[]): SearchResult[] {
  const out: SearchResult[] = [];
  for (const node of nodes) {
    const n = node as {
      type?: string;
      video_id?: string;
      title?: { text?: string } | string;
      thumbnails?: { url: string; width?: number; height?: number }[];
      author?: { name?: string; id?: string; channel_id?: string };
      view_count?: { text?: string };
      short_view_count?: { text?: string };
      published?: { text?: string };
      duration?: { text?: string; seconds?: number };
      length_text?: { text?: string };
      is_live?: boolean;
    };
    if (n.type !== "Video" && n.type !== "CompactVideo" && n.type !== "ReelItem") continue;
    if (!n.video_id) continue;
    const titleText = typeof n.title === "string" ? n.title : n.title?.text ?? "";
    if (!titleText) continue;
    const viewCountText = n.view_count?.text ?? n.short_view_count?.text ?? null;
    out.push({
      id: n.video_id,
      url: `https://www.youtube.com/watch?v=${n.video_id}`,
      title: titleText,
      channel_name: n.author?.name ?? null,
      channel_id: n.author?.id ?? n.author?.channel_id ?? null,
      thumbnail_url: n.thumbnails ? pickBestThumbnail(n.thumbnails) : null,
      view_count: parseViewCountText(viewCountText),
      view_count_text: viewCountText,
      published_text: n.published?.text ?? null,
      published_at: parseRelativePublished(n.published?.text),
      duration_seconds: typeof n.duration?.seconds === "number" ? n.duration.seconds : null,
      duration_text: n.duration?.text ?? n.length_text?.text ?? null,
      is_live: Boolean(n.is_live),
    });
  }
  return out;
}

export type SearchFilters = {
  sort_by?: SearchSortBy;
  upload_date?: SearchUploadDate;
  duration?: SearchDuration;
};

const SEARCH_TTL_MS = 15 * 60 * 1000;
const searchSessions = new Map<
  string,
  { search: SearchLike; at: number; seen: Set<string> }
>();

function sessionKey(q: string, f: SearchFilters): string {
  return JSON.stringify([q.trim().toLowerCase(), f.sort_by ?? "", f.upload_date ?? "", f.duration ?? ""]);
}

export async function searchPage(
  query: string,
  filters: SearchFilters,
  opts: { fresh: boolean; pageSize?: number },
): Promise<{ results: SearchResult[]; exhausted: boolean }> {
  const pageSize = opts.pageSize ?? 50;
  const key = sessionKey(query, filters);
  const now = Date.now();

  // drop expired sessions lazily
  for (const [k, v] of searchSessions) {
    if (now - v.at > SEARCH_TTL_MS) searchSessions.delete(k);
  }

  const collected: SearchResult[] = [];
  let entry = searchSessions.get(key);

  // 세션 단위로 본 ID를 기억한다. 같은 쿼리·필터의 페이지네이션에서
  // YouTube continuation이 종종 중복 비디오를 돌려주는데, 그대로 두면
  // React가 같은 key 두 번 받는 경고를 띄운다.
  function takeNew(nodes: SearchResult[]): SearchResult[] {
    const out: SearchResult[] = [];
    for (const n of nodes) {
      if (entry!.seen.has(n.id)) continue;
      entry!.seen.add(n.id);
      out.push(n);
    }
    return out;
  }

  if (opts.fresh || !entry) {
    const yt = await innertube();
    // v17 YT API: sort_by → prioritize, upload_date drops 'hour', duration uses mins-based names
    const uploadMap: Record<string, string> = {
      all: "all",
      today: "today",
      week: "week",
      month: "month",
      year: "year",
      hour: "today",
    };
    const durationMap: Record<string, string> = {
      all: "all",
      short: "under_three_mins",
      medium: "three_to_twenty_mins",
      long: "over_twenty_mins",
    };
    const prioritize: "relevance" | "popularity" | undefined =
      filters.sort_by === "view_count" || filters.sort_by === "rating"
        ? "popularity"
        : "relevance";
    const ytFilters = {
      type: "video" as const,
      prioritize,
      upload_date: filters.upload_date ? (uploadMap[filters.upload_date] as "all") : undefined,
      duration: filters.duration ? (durationMap[filters.duration] as "all") : undefined,
    };
    const first = (await yt.search(query, ytFilters as unknown as Parameters<typeof yt.search>[1])) as unknown as SearchLike;
    entry = { search: first, at: now, seen: new Set<string>() };
    searchSessions.set(key, entry);
    collected.push(...takeNew(parseSearchNodes(first.results)));
  }

  let exhausted = false;
  while (collected.length < pageSize) {
    try {
      const next = (await entry.search.getContinuation()) as SearchLike;
      const fresh = takeNew(parseSearchNodes(next.results));
      entry.search = next;
      entry.at = Date.now();
      if (next.results.length === 0) {
        exhausted = true;
        break;
      }
      collected.push(...fresh);
    } catch {
      exhausted = true;
      break;
    }
  }

  return { results: collected, exhausted };
}

export async function searchVideos(
  query: string,
  filters: SearchFilters,
): Promise<SearchResult[]> {
  const { results } = await searchPage(query, filters, { fresh: true, pageSize: 20 });
  return results;
}

// youtubei.js의 getSearchSuggestions는 응답을 EUC-KR이 아닌 다른 인코딩으로 읽어
// 한글이 U+FFFD로 깨짐. 직접 suggestqueries 엔드포인트를 oe=utf-8로 호출해 회피.
export async function fetchAutocomplete(seed: string): Promise<string[]> {
  const trimmed = seed.trim();
  if (!trimmed) return [];
  const url = `https://suggestqueries.google.com/complete/search?client=youtube&hl=ko&gl=kr&ds=yt&oe=utf-8&q=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "ko-KR,ko;q=0.9" } });
  if (!res.ok) return [];
  const body = await res.text();
  // JSONP 래퍼 제거: window.google.ac.h([...])  → [...]
  const m = body.match(/^[^(]*\((.*)\)\s*;?\s*$/s);
  const jsonText = m ? m[1] : body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of parsed[1] as unknown[]) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    const t = entry[0].trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    if (t.toLowerCase() === trimmed.toLowerCase()) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export interface FetchedComment {
  id: string;
  parent_id: string | null;
  author: string | null;
  author_thumbnail: string | null;
  text: string;
  like_count: number | null;
  reply_count: number | null;
  published_text: string | null;
  is_pinned: boolean;
  is_creator_heart: boolean;
  is_channel_owner: boolean;
}

type CommentViewLike = {
  comment_id?: string;
  content?: { text?: string } | string;
  author?: { name?: string; thumbnails?: { url: string }[] };
  like_count?: string;
  reply_count?: string;
  published_time?: string;
  is_pinned?: boolean;
  is_hearted?: boolean;
  author_is_channel_owner?: boolean;
};

type CommentThreadLike = {
  comment?: CommentViewLike | null;
  has_replies?: boolean;
  has_continuation?: boolean;
  getReplies?: () => Promise<CommentThreadLike>;
  getContinuation?: () => Promise<CommentThreadLike>;
  replies?: CommentViewLike[];
};

type CommentsLike = {
  contents: unknown[];
  has_continuation: boolean;
  getContinuation: () => Promise<CommentsLike>;
  applySort?: (sort: "TOP_COMMENTS" | "NEWEST_FIRST") => Promise<CommentsLike>;
};

function parseLikeCount(text: string | undefined): number | null {
  if (!text) return null;
  return parseViewCountText(text);
}

function parseReplyCount(text: string | undefined): number | null {
  if (!text) return null;
  const n = parseViewCountText(text);
  return n ?? 0;
}

function viewToComment(c: CommentViewLike | null | undefined, parentId: string | null): FetchedComment | null {
  if (!c || !c.comment_id) return null;
  const textRaw = typeof c.content === "string" ? c.content : c.content?.text ?? "";
  if (!textRaw) return null;
  return {
    id: c.comment_id,
    parent_id: parentId,
    author: c.author?.name ?? null,
    author_thumbnail: c.author?.thumbnails?.[0]?.url ?? null,
    text: textRaw,
    like_count: parseLikeCount(c.like_count),
    reply_count: parseReplyCount(c.reply_count),
    published_text: c.published_time ?? null,
    is_pinned: Boolean(c.is_pinned),
    is_creator_heart: Boolean(c.is_hearted),
    is_channel_owner: Boolean(c.author_is_channel_owner),
  };
}

function threadToComment(t: CommentThreadLike): FetchedComment | null {
  return viewToComment(t.comment, null);
}

export interface FetchCommentsOptions {
  target: number; // 목표 최상위 댓글 개수
  sort?: "TOP_COMMENTS" | "NEWEST_FIRST";
  maxPages?: number; // 안전 상한
  includeReplies?: boolean; // 답글 같이 수집
  maxRepliesPerThread?: number; // 댓글당 답글 상한
}

export async function fetchComments(
  videoId: string,
  opts: FetchCommentsOptions,
): Promise<{ comments: FetchedComment[]; exhausted: boolean; topLevelCount: number; repliesCount: number }> {
  const yt = await innertube();
  let page: CommentsLike;
  try {
    page = (await yt.getComments(videoId, opts.sort ?? "TOP_COMMENTS")) as unknown as CommentsLike;
  } catch (err) {
    throw new Error(
      `댓글을 가져올 수 없습니다 (영상이 비공개거나 댓글이 비활성화됨): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const topLevels: { comment: FetchedComment; thread: CommentThreadLike }[] = [];
  const seen = new Set<string>();
  const maxPages = opts.maxPages ?? 300;
  let pages = 0;

  function harvestPage(p: CommentsLike) {
    for (const node of p.contents) {
      const t = node as CommentThreadLike;
      const c = threadToComment(t);
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      topLevels.push({ comment: c, thread: t });
      if (topLevels.length >= opts.target) break;
    }
  }

  harvestPage(page);
  while (topLevels.length < opts.target && page.has_continuation && pages < maxPages) {
    try {
      page = await page.getContinuation();
      pages++;
      harvestPage(page);
    } catch {
      break;
    }
  }

  // 답글 수집 — thread.comment_replies_data.view_replies.endpoint 직접 호출
  const includeReplies = opts.includeReplies !== false;
  const maxRepliesPerThread = opts.maxRepliesPerThread ?? 20;
  const allReplies: { idx: number; replies: FetchedComment[] }[] = [];

  if (includeReplies) {
    const actions = yt.actions;
    const needsReplies = topLevels
      .map((t, idx) => ({ idx, t }))
      .filter(({ t }) => t.comment.reply_count != null && t.comment.reply_count > 0);

    const concurrency = 4;
    let cursor = 0;
    async function worker() {
      while (cursor < needsReplies.length) {
        const my = cursor++;
        const { idx, t } = needsReplies[my];
        const replies = await fetchRepliesViaEndpoint(
          actions,
          t.thread,
          t.comment.id,
          maxRepliesPerThread,
          process.env.DEBUG_YOUTUBE_REPLIES === "1" && my === 0,
        );
        if (replies.length > 0) allReplies.push({ idx, replies });
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, needsReplies.length) }, worker));
  }

  allReplies.sort((a, b) => a.idx - b.idx);
  const replyByParent = new Map<number, FetchedComment[]>();
  for (const { idx, replies } of allReplies) replyByParent.set(idx, replies);

  const flat: FetchedComment[] = [];
  topLevels.forEach((t, idx) => {
    flat.push(t.comment);
    const rs = replyByParent.get(idx);
    if (rs) flat.push(...rs);
  });

  return {
    comments: flat,
    exhausted: !page.has_continuation || pages >= maxPages,
    topLevelCount: topLevels.length,
    repliesCount: flat.length - topLevels.length,
  };
}

type ActionsLike = unknown;
type EndpointLike = {
  call: (
    actions: ActionsLike,
    args: { parse: true },
  ) => Promise<{
    on_response_received_endpoints_memo?: {
      getType: (cls: unknown) => unknown[];
    };
  }>;
};
type ThreadWithReplies = {
  comment_replies_data?: {
    view_replies?: { endpoint?: EndpointLike } | null;
    contents?: unknown[];
  } | null;
};

async function fetchRepliesViaEndpoint(
  actions: ActionsLike,
  thread: CommentThreadLike,
  parentId: string,
  max: number,
  debug: boolean,
): Promise<FetchedComment[]> {
  const out: FetchedComment[] = [];
  const seen = new Set<string>();
  const crd = (thread as ThreadWithReplies).comment_replies_data as
    | (ThreadWithReplies["comment_replies_data"] & { contents?: unknown[] })
    | null
    | undefined;

  if (debug) {
    const vrEp = crd?.view_replies?.endpoint as unknown as {
      name?: string;
      payload?: unknown;
      command?: unknown;
      metadata?: unknown;
    } | undefined;
    console.log(`[replies debug] parent=${parentId}`, {
      hasCrd: !!crd,
      hasViewReplies: !!crd?.view_replies,
      vr_ep_name: vrEp?.name,
      vr_ep_payload: JSON.stringify(vrEp?.payload ?? {}).slice(0, 400),
      vr_ep_command: JSON.stringify(vrEp?.command ?? null).slice(0, 400),
      vr_ep_metadata: JSON.stringify(vrEp?.metadata ?? {}).slice(0, 400),
      viewRepliesKeys: crd?.view_replies ? Object.keys(crd.view_replies as object) : null,
    });
    console.log(
      `[replies debug] raw button text=`,
      (crd?.view_replies as { text?: string } | undefined)?.text,
    );
  }

  // 1: ContinuationItem from contents
  const contents = (crd?.contents ?? []) as { type?: string; endpoint?: EndpointLike }[];
  let ci = contents.find((c) => c?.type === "ContinuationItem");
  let endpoint: EndpointLike | undefined = ci?.endpoint;

  // 2: view_replies button endpoint
  if (!endpoint) endpoint = crd?.view_replies?.endpoint;

  if (!endpoint || typeof endpoint.call !== "function") return out;

  try {
    const response = await endpoint.call(actions, { parse: true });
    const memo = response.on_response_received_endpoints_memo;
    if (!memo || typeof memo.getType !== "function") return out;
    const views = memo.getType(YTNodes.CommentView) as CommentViewLike[];
    for (const v of views) {
      const c = viewToComment(v, parentId);
      if (!c || seen.has(c.id) || c.id === parentId) continue;
      seen.add(c.id);
      out.push(c);
      if (out.length >= max) break;
    }
  } catch (err) {
    if (debug) console.warn(`[replies] failed for ${parentId}:`, err instanceof Error ? err.message : err);
  }
  return out.slice(0, max);
}
