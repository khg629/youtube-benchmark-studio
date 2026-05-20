import type { Video } from "./types";

export interface SynthesisStats {
  videoCount: number;
  // 제목
  titleLengthAvg: number;
  titleLengthMin: number;
  titleLengthMax: number;
  titlesWithNumber: number; // 숫자 포함 영상 수
  titlesWithEmoji: number;
  titlesWithBracket: number; // [ ] 또는 ( ) 포함
  titlesWithExclaim: number;
  titlesWithQuestion: number;
  // 영상 길이 분포 (초 단위)
  durationBucketsLabel: string[];
  durationBucketsCount: number[];
  durationAvgSec: number | null;
  durationMedianSec: number | null;
  // 업로드 요일/시간
  weekdayCounts: number[]; // [일,월,화,수,목,금,토] 7개
  hourBucketsLabel: string[];
  hourBucketsCount: number[];
  // 채널 다양성
  uniqueChannels: number;
  topChannels: { name: string; count: number }[];
  // 조회수
  viewsAvg: number | null;
  viewsMedian: number | null;
  // 빈도 높은 단어 (제목)
  topWords: { word: string; count: number }[];
}

const KO_WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

const STOPWORDS = new Set([
  "그리고",
  "그래서",
  "그런데",
  "하지만",
  "이것",
  "저것",
  "이거",
  "저거",
  "있는",
  "없는",
  "되는",
  "하는",
  "ㅣ",
  "|",
  "-",
  "—",
  "...",
  "..",
  "the",
  "a",
  "an",
  "is",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "and",
  "or",
  "vs",
]);

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function bucketize(secs: number): string {
  if (secs < 60) return "<1분";
  if (secs < 240) return "1~4분";
  if (secs < 600) return "4~10분";
  if (secs < 1200) return "10~20분";
  if (secs < 1800) return "20~30분";
  if (secs < 3600) return "30~60분";
  return ">60분";
}

const DURATION_ORDER = ["<1분", "1~4분", "4~10분", "10~20분", "20~30분", "30~60분", ">60분"];

function hourBucket(hour: number): string {
  if (hour < 6) return "0~6시";
  if (hour < 12) return "6~12시";
  if (hour < 18) return "12~18시";
  return "18~24시";
}

const HOUR_ORDER = ["0~6시", "6~12시", "12~18시", "18~24시"];

function tokenize(title: string): string[] {
  // 한글/영문/숫자 단어 추출, 2글자 이상만
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return words;
}

export function computeSynthesisStats(videos: Video[]): SynthesisStats {
  const titles = videos.map((v) => v.title);
  const titleLens = titles.map((t) => t.length);
  const titleLengthAvg =
    titleLens.length > 0 ? titleLens.reduce((a, b) => a + b, 0) / titleLens.length : 0;

  const titlesWithNumber = titles.filter((t) => /\d/.test(t)).length;
  const titlesWithEmoji = titles.filter((t) => /\p{Extended_Pictographic}/u.test(t)).length;
  const titlesWithBracket = titles.filter((t) => /[\[\]()【】「」]/.test(t)).length;
  const titlesWithExclaim = titles.filter((t) => /[!！]/.test(t)).length;
  const titlesWithQuestion = titles.filter((t) => /[?？]/.test(t)).length;

  // duration distribution
  const durationCountMap = new Map<string, number>(DURATION_ORDER.map((k) => [k, 0]));
  const durations: number[] = [];
  for (const v of videos) {
    if (v.duration_seconds == null) continue;
    durations.push(v.duration_seconds);
    const b = bucketize(v.duration_seconds);
    durationCountMap.set(b, (durationCountMap.get(b) ?? 0) + 1);
  }
  durations.sort((a, b) => a - b);
  const durationAvgSec =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const durationMedianSec = median(durations);

  // weekday + hour
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  const hourCountMap = new Map<string, number>(HOUR_ORDER.map((k) => [k, 0]));
  for (const v of videos) {
    if (!v.upload_date) continue;
    const d = new Date(v.upload_date);
    if (isNaN(d.getTime())) continue;
    weekdayCounts[d.getDay()]++;
    const h = hourBucket(d.getHours());
    hourCountMap.set(h, (hourCountMap.get(h) ?? 0) + 1);
  }

  // channels
  const channelCount = new Map<string, number>();
  for (const v of videos) {
    if (!v.channel_name) continue;
    channelCount.set(v.channel_name, (channelCount.get(v.channel_name) ?? 0) + 1);
  }
  const topChannels = Array.from(channelCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // views
  const views = videos.map((v) => v.view_count).filter((n): n is number => n != null);
  views.sort((a, b) => a - b);
  const viewsAvg = views.length > 0 ? views.reduce((a, b) => a + b, 0) / views.length : null;
  const viewsMedian = median(views);

  // word frequencies
  const wordCount = new Map<string, number>();
  for (const t of titles) {
    for (const w of tokenize(t)) {
      wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
    }
  }
  const topWords = Array.from(wordCount.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }));

  return {
    videoCount: videos.length,
    titleLengthAvg,
    titleLengthMin: titleLens.length > 0 ? Math.min(...titleLens) : 0,
    titleLengthMax: titleLens.length > 0 ? Math.max(...titleLens) : 0,
    titlesWithNumber,
    titlesWithEmoji,
    titlesWithBracket,
    titlesWithExclaim,
    titlesWithQuestion,
    durationBucketsLabel: DURATION_ORDER,
    durationBucketsCount: DURATION_ORDER.map((k) => durationCountMap.get(k) ?? 0),
    durationAvgSec,
    durationMedianSec,
    weekdayCounts,
    hourBucketsLabel: HOUR_ORDER,
    hourBucketsCount: HOUR_ORDER.map((k) => hourCountMap.get(k) ?? 0),
    uniqueChannels: channelCount.size,
    topChannels,
    viewsAvg,
    viewsMedian,
    topWords,
  };
}

export function formatStatsForPrompt(stats: SynthesisStats): string {
  const fmt = (n: number | null) =>
    n == null ? "-" : n >= 10000 ? `${(n / 10000).toFixed(1)}만` : Math.round(n).toLocaleString("ko-KR");
  const fmtDur = (s: number | null) => {
    if (s == null) return "-";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}분 ${sec}초`;
  };
  const pct = (n: number) => `${Math.round((n / stats.videoCount) * 100)}%`;

  const weekdayLines = KO_WEEKDAY.map((d, i) => `${d}: ${stats.weekdayCounts[i]}`).join(", ");
  const durLines = stats.durationBucketsLabel
    .map((l, i) => `${l}: ${stats.durationBucketsCount[i]}`)
    .join(", ");
  const hourLines = stats.hourBucketsLabel
    .map((l, i) => `${l}: ${stats.hourBucketsCount[i]}`)
    .join(", ");

  return `[코드로 계산한 통계]
- 분석 대상 영상 수: ${stats.videoCount}개
- 고유 채널: ${stats.uniqueChannels}개 (상위 채널: ${stats.topChannels.map((c) => `${c.name}(${c.count})`).join(", ") || "-"})

[제목]
- 평균 길이: ${stats.titleLengthAvg.toFixed(1)}자 (최소 ${stats.titleLengthMin}, 최대 ${stats.titleLengthMax})
- 숫자 포함: ${stats.titlesWithNumber}개 (${pct(stats.titlesWithNumber)})
- 이모지 포함: ${stats.titlesWithEmoji}개 (${pct(stats.titlesWithEmoji)})
- 대괄호/소괄호 포함: ${stats.titlesWithBracket}개 (${pct(stats.titlesWithBracket)})
- 느낌표 포함: ${stats.titlesWithExclaim}개 (${pct(stats.titlesWithExclaim)})
- 물음표 포함: ${stats.titlesWithQuestion}개 (${pct(stats.titlesWithQuestion)})
- 빈도 높은 단어: ${stats.topWords.map((w) => `${w.word}(${w.count})`).join(", ") || "-"}

[영상 길이]
- 평균: ${fmtDur(stats.durationAvgSec)} · 중앙값: ${fmtDur(stats.durationMedianSec)}
- 분포: ${durLines}

[업로드 패턴]
- 요일: ${weekdayLines}
- 시간대: ${hourLines}

[조회수]
- 평균: ${fmt(stats.viewsAvg)} · 중앙값: ${fmt(stats.viewsMedian)}`;
}

export function formatVideoListForPrompt(videos: Video[]): string {
  return videos
    .map((v, i) => {
      const dur = v.duration_seconds
        ? `${Math.floor(v.duration_seconds / 60)}:${String(Math.floor(v.duration_seconds % 60)).padStart(2, "0")}`
        : "-";
      const date = v.upload_date?.slice(0, 10) ?? "-";
      const views = v.view_count != null ? v.view_count.toLocaleString("ko-KR") : "-";
      return `${i + 1}. [${date}, ${dur}, ${views}회] ${v.channel_name ?? "?"} — "${v.title}"`;
    })
    .join("\n");
}
