import { runYtDlp } from "./yt-dlp";

export interface ResolvedChannel {
  id: string;
  url: string;
  handle: string | null;
  name: string | null;
  description: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  subscriber_text: string | null;
  video_count: number | null;
  video_count_text: string | null;
}

type YtDlpDump = {
  id?: string;
  channel?: string | null;
  channel_id?: string | null;
  channel_url?: string | null;
  channel_follower_count?: number | null;
  description?: string | null;
  uploader_id?: string | null;
  uploader_url?: string | null;
  webpage_url?: string | null;
  thumbnails?: { url: string; width?: number | null; height?: number | null }[];
  playlist_count?: number | null;
};

function pickAvatar(thumbs: YtDlpDump["thumbnails"]): string | null {
  if (!thumbs || thumbs.length === 0) return null;
  // Square thumbnails are the channel avatar; banner thumbs are wider.
  const square = thumbs.filter(
    (t) => t.width && t.height && Math.abs(t.width - t.height) <= 2,
  );
  const list = square.length > 0 ? square : thumbs;
  return list.reduce((best, cur) =>
    (cur.width ?? 0) > (best.width ?? 0) ? cur : best,
  ).url;
}

// 사용자 입력을 yt-dlp가 이해 가능한 URL로 정규화.
// 받아들이는 형태: UC.. ID, @handle, 풀 URL, 핸들/채널 경로
function normalizeInput(input: string): string {
  const s = input.trim();
  if (/^UC[\w-]{10,}$/.test(s)) return `https://www.youtube.com/channel/${s}`;
  if (/^@[\w.\-]+$/.test(s)) return `https://www.youtube.com/${s}`;
  if (/^https?:\/\//i.test(s)) return s;
  // 핸들에서 @ 누락
  if (/^[\w.\-]+$/.test(s) && !/\s/.test(s)) return `https://www.youtube.com/@${s}`;
  return s;
}

export async function resolveChannel(input: string): Promise<ResolvedChannel> {
  const url = normalizeInput(input);
  const { stdout } = await runYtDlp([
    "--no-warnings",
    "--no-playlist",
    "--skip-download",
    "--flat-playlist",
    "--playlist-items", "0",
    "--dump-single-json",
    url,
  ]);

  let dump: YtDlpDump;
  try {
    dump = JSON.parse(stdout) as YtDlpDump;
  } catch (err) {
    throw new Error(
      `채널 메타 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const id = dump.channel_id ?? null;
  if (!id || !/^UC[\w-]{10,}$/.test(id)) {
    throw new Error("채널 ID를 추출하지 못했습니다 — 영상 URL이 아닌 채널 URL을 입력해 주세요.");
  }

  const name = dump.channel ?? null;
  const subscriber_count =
    typeof dump.channel_follower_count === "number" ? dump.channel_follower_count : null;
  const video_count =
    typeof dump.playlist_count === "number" ? dump.playlist_count : null;
  const handle =
    dump.uploader_id && dump.uploader_id.startsWith("@") ? dump.uploader_id : null;
  const channelUrl =
    dump.channel_url ?? `https://www.youtube.com/channel/${id}`;
  const description = dump.description ?? null;
  const thumbnail_url = pickAvatar(dump.thumbnails);

  return {
    id,
    url: channelUrl,
    handle,
    name,
    description,
    thumbnail_url,
    subscriber_count,
    subscriber_text: subscriber_count != null ? formatKoreanCount(subscriber_count) : null,
    video_count,
    video_count_text: video_count != null ? `${video_count.toLocaleString("ko-KR")}개` : null,
  };
}

function formatKoreanCount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, "")}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}천`;
  return n.toLocaleString("ko-KR");
}
