import { Innertube } from "youtubei.js";
import { parseViewCountText } from "./youtube";

export interface ChannelInfo {
  id: string;
  name: string | null;
  subscriber_count: number | null;
  subscriber_text: string | null;
  video_count: number | null;
  video_count_text: string | null;
  thumbnail_url: string | null;
}

const TTL_MS = 30 * 60 * 1000;
const NULL_TTL_MS = 30 * 1000; // 실패는 30초만 캐시 → 재시도 가능
const MAX_CONCURRENCY = 4;
const cache = new Map<string, { at: number; info: ChannelInfo | null }>();
const inflight = new Map<string, Promise<ChannelInfo | null>>();

let _yt: Innertube | null = null;
async function yt(): Promise<Innertube> {
  if (_yt) return _yt;
  _yt = await Innertube.create({ lang: "ko", location: "KR" });
  return _yt;
}

function parseSubText(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/subscribers?|구독자|명/gi, "").trim();
  return parseViewCountText(cleaned);
}

function parseVideoCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/videos?|동영상|영상|개/gi, "").trim();
  // handles "1.2M", "1,234", "1.2천", "12만"
  return parseViewCountText(cleaned);
}

type RawChannel = {
  metadata?: { title?: string; thumbnail?: { url: string }[] };
  header?: unknown;
};

function extractFromHeader(header: unknown): { subText: string | null; videoText: string | null; name: string | null; thumb: string | null } {
  let subText: string | null = null;
  let videoText: string | null = null;
  let name: string | null = null;
  let thumb: string | null = null;

  const h = header as {
    type?: string;
    author?: { name?: string; thumbnails?: { url: string }[] };
    subscribers?: { text?: string };
    videos_count?: { text?: string };
    metadata?: unknown;
    content?: { metadata?: unknown; image?: unknown };
  };

  if (!h) return { subText, videoText, name, thumb };

  name = h.author?.name ?? name;
  thumb = h.author?.thumbnails?.[0]?.url ?? thumb;

  // C4TabbedHeader
  if (h.subscribers?.text) subText = h.subscribers.text;
  if (h.videos_count?.text) videoText = h.videos_count.text;

  // InteractiveTabbedHeader — single `metadata` text field may contain subs
  if (!subText && h.metadata && typeof h.metadata === "object") {
    const m = h.metadata as { text?: string };
    if (typeof m.text === "string" && /subscrib|구독/i.test(m.text)) subText = m.text;
  }

  // PageHeader — header.content.metadata.metadata_rows[].metadata_parts[].text.text
  const contentMeta = (h.content as { metadata?: { metadata_rows?: unknown[] }; image?: { image?: { sources?: { url: string }[] }[] } } | undefined)?.metadata;
  if (contentMeta && typeof contentMeta === "object") {
    const rows = (contentMeta as { metadata_rows?: unknown[] }).metadata_rows ?? [];
    for (const row of rows) {
      const parts = (row as { metadata_parts?: unknown[] }).metadata_parts ?? [];
      for (const part of parts) {
        const t = ((part as { text?: { text?: string } }).text?.text ?? "").trim();
        if (!t) continue;
        if (!subText && /subscrib|구독/i.test(t)) subText = t;
        else if (!videoText && /video|동영상|영상/i.test(t)) videoText = t;
      }
    }
  }

  const pageImg = (h.content as { image?: { avatar?: { image?: { sources?: { url: string }[] }[] } } } | undefined)?.image;
  if (!thumb && pageImg) {
    const src = pageImg.avatar?.image?.[0]?.sources?.[0]?.url;
    if (src) thumb = src;
  }

  return { subText, videoText, name, thumb };
}

async function extractFromAbout(
  channel: { has_about?: boolean; getAbout?: () => Promise<unknown> },
): Promise<{ subText: string | null; videoText: string | null }> {
  try {
    if (!channel.has_about || typeof channel.getAbout !== "function") {
      return { subText: null, videoText: null };
    }
    const about = (await channel.getAbout()) as {
      metadata?: { subscriber_count?: string; video_count?: string };
      subscriber_count?: string;
      video_count?: string;
    };
    const subText = about.metadata?.subscriber_count ?? about.subscriber_count ?? null;
    const videoText = about.metadata?.video_count ?? about.video_count ?? null;
    return { subText, videoText };
  } catch {
    return { subText: null, videoText: null };
  }
}

async function fetchChannelInfoRaw(channelId: string): Promise<ChannelInfo | null> {
  let ch: (RawChannel & { has_about?: boolean; getAbout?: () => Promise<unknown> }) | null = null;
  try {
    const client = await yt();
    ch = (await client.getChannel(channelId)) as unknown as RawChannel & {
      has_about?: boolean;
      getAbout?: () => Promise<unknown>;
    };
  } catch (err) {
    console.warn(`[channel] getChannel(${channelId}) 실패:`, err instanceof Error ? err.message : err);
    return null;
  }

  try {
    const h = extractFromHeader(ch.header);
    let subText = h.subText;
    let videoText = h.videoText;

    if (!subText || !videoText) {
      const about = await extractFromAbout(ch);
      subText = subText ?? about.subText;
      videoText = videoText ?? about.videoText;
    }

    const name = ch.metadata?.title ?? h.name ?? null;
    const thumbUrl = ch.metadata?.thumbnail?.[0]?.url ?? h.thumb ?? null;

    if (!subText && !videoText) {
      console.warn(
        `[channel] ${channelId} 메타 없음. header type=${(ch.header as { type?: string } | undefined)?.type ?? "?"}`,
      );
    }

    return {
      id: channelId,
      name,
      subscriber_count: parseSubText(subText),
      subscriber_text: subText,
      video_count: parseVideoCount(videoText),
      video_count_text: videoText,
      thumbnail_url: thumbUrl,
    };
  } catch (err) {
    console.warn(`[channel] extract(${channelId}) 실패:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function fetchChannelInfo(channelId: string): Promise<ChannelInfo | null> {
  const cached = cache.get(channelId);
  if (cached) {
    const ttl = cached.info ? TTL_MS : NULL_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.info;
  }
  const pending = inflight.get(channelId);
  if (pending) return pending;
  const p = fetchChannelInfoRaw(channelId).finally(() => {
    inflight.delete(channelId);
  });
  inflight.set(channelId, p);
  const info = await p;
  cache.set(channelId, { at: Date.now(), info });
  return info;
}

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function runner() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

// youtubei.js 가 채널 ID를 알 수 없을 때 "N/A" 문자열을 반환하기도 하므로 명시적으로 거름
function isValidChannelId(id: string): boolean {
  return Boolean(id) && id !== "N/A" && /^UC[\w-]{10,}$/.test(id);
}

export async function fetchChannelInfoBatch(
  channelIds: string[],
): Promise<Record<string, ChannelInfo | null>> {
  const unique = Array.from(new Set(channelIds));
  const out: Record<string, ChannelInfo | null> = {};
  // 유효하지 않은 ID는 즉시 null 처리, YouTube 호출 안 함
  const valid: string[] = [];
  for (const id of unique) {
    if (isValidChannelId(id)) valid.push(id);
    else out[id] = null;
  }
  await withConcurrency(valid, MAX_CONCURRENCY, async (id) => {
    out[id] = await fetchChannelInfo(id);
  });
  return out;
}
