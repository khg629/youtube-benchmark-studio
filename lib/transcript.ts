import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runYtDlp } from "./yt-dlp";

export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface FetchedTranscript {
  language: string | null;
  available_languages: string[];
  segments: TranscriptSegment[];
  is_empty: boolean;
}

// 한국어 우선 — `-orig`(원본 언어) → 자동번역(`ko`) → 영어 → 일본어 순.
const PREFERRED_LANGS = ["ko-orig", "ko", "en-orig", "en", "ja-orig", "ja"];

type Json3 = {
  events?: Array<{
    tStartMs?: number;
    dDurationMs?: number;
    segs?: Array<{ utf8?: string }>;
  }>;
};

function parseJson3(content: string): TranscriptSegment[] {
  let data: Json3;
  try {
    data = JSON.parse(content) as Json3;
  } catch {
    return [];
  }
  const events = data.events;
  if (!Array.isArray(events)) return [];
  const out: TranscriptSegment[] = [];
  for (const ev of events) {
    const segs = ev.segs;
    if (!Array.isArray(segs)) continue;
    const text = segs.map((s) => s.utf8 ?? "").join("").replace(/\n+/g, " ").trim();
    if (!text) continue;
    const start = Number(ev.tStartMs ?? 0);
    const dur = Number(ev.dDurationMs ?? 0);
    out.push({ start_ms: start, end_ms: start + dur, text });
  }
  return out;
}

function langFromFilename(file: string): string | null {
  // sub.{lang}.json3 (lang may contain dashes, e.g. ko-orig)
  const m = file.match(/^sub\.(.+)\.json3$/);
  return m ? m[1] : null;
}

function pickLanguage(files: string[]): string | null {
  for (const lang of PREFERRED_LANGS) {
    const found = files.find((f) => langFromFilename(f) === lang);
    if (found) return found;
  }
  return files[0] ?? null;
}

export async function fetchTranscript(videoId: string): Promise<FetchedTranscript> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-sub-"));
  const cleanup = () => {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      "--no-warnings",
      "--no-playlist",
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs", PREFERRED_LANGS.join(","),
      "--sub-format", "json3",
      "-o", path.join(tmpDir, "sub.%(ext)s"),
      url,
    ];

    try {
      await runYtDlp(args);
    } catch (err) {
      // yt-dlp가 일부 언어 다운에 실패해도(예: 429) 다른 언어 파일이 이미 있을 수 있어 무시하고 계속.
      const message = err instanceof Error ? err.message : String(err);
      // ENOENT 등 진짜 실행 실패는 throw
      if (/not installed|설치/.test(message)) throw err;
    }

    const allFiles = await fs.readdir(tmpDir).catch(() => [] as string[]);
    const subFiles = allFiles.filter((f) => f.endsWith(".json3"));
    if (subFiles.length === 0) {
      return { language: null, available_languages: [], segments: [], is_empty: true };
    }

    const chosen = pickLanguage(subFiles);
    if (!chosen) {
      return { language: null, available_languages: [], segments: [], is_empty: true };
    }
    const language = langFromFilename(chosen);
    const content = await fs.readFile(path.join(tmpDir, chosen), "utf-8");
    const segments = parseJson3(content);
    const available = subFiles
      .map(langFromFilename)
      .filter((l): l is string => !!l);

    return {
      language,
      available_languages: available,
      segments,
      is_empty: segments.length === 0,
    };
  } finally {
    cleanup();
  }
}

export function transcriptToPlainText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(" ");
}

export function transcriptHookText(segments: TranscriptSegment[], windowSec = 30): string {
  const cutoffMs = windowSec * 1000;
  return segments
    .filter((s) => s.start_ms < cutoffMs)
    .map((s) => s.text)
    .join(" ");
}

export function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
