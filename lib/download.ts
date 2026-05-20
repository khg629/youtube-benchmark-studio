import { promises as fs, createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { runYtDlp } from "./yt-dlp";

type DownloadType = "video" | "audio" | "video+audio";

export type DownloadResult = {
  stream: ReadableStream<Uint8Array>;
  size: number;
  container: string;
  mimeType: string;
  title: string;
};

const QUALITY_HEIGHT: Record<string, number | null> = {
  "144p": 144,
  "240p": 240,
  "360p": 360,
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "2160p": 2160,
  best: null,
  bestefficiency: null,
};

function maxHeight(quality: string): number | null {
  const key = quality.toLowerCase();
  if (key in QUALITY_HEIGHT) return QUALITY_HEIGHT[key];
  const m = key.match(/^(\d+)p?$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function formatSelector(type: DownloadType, quality: string): string {
  const h = maxHeight(quality);
  if (type === "audio") return "bestaudio/best";
  if (type === "video") {
    return h != null ? `bestvideo[height<=${h}]/bestvideo` : "bestvideo";
  }
  if (h != null) {
    return `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
  }
  return "bestvideo+bestaudio/best";
}

export async function downloadVideo(
  videoId: string,
  quality: string,
  type: DownloadType,
): Promise<DownloadResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-dl-"));
  const cleanup = () => {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const selector = formatSelector(type, quality);
    const args: string[] = [
      "--no-progress",
      "--no-warnings",
      "--no-playlist",
      "--no-part",
      "--restrict-filenames",
      "-f", selector,
      "-o", path.join(tmpDir, "output.%(ext)s"),
      "--print", "after_move:TITLE\t%(title)s\tFILEPATH\t%(filepath)s",
    ];
    if (type === "audio") {
      args.push("--extract-audio", "--audio-format", "m4a");
    } else {
      args.push("--merge-output-format", "mp4");
    }
    args.push(url);

    const { stdout, stderr } = await runYtDlp(args);
    const meta = parseYtDlpOutput(stdout);
    if (!meta) {
      throw new Error(`yt-dlp 출력 파싱 실패. stderr=${stderr.trim().slice(0, 200)}`);
    }

    const stat = await fs.stat(meta.filePath);
    const node = createReadStream(meta.filePath);
    node.once("close", cleanup);
    node.once("error", cleanup);
    const web = Readable.toWeb(node) as ReadableStream<Uint8Array>;

    const container = path.extname(meta.filePath).replace(/^\./, "") || (type === "audio" ? "m4a" : "mp4");
    const mimeType =
      container === "mp4" ? "video/mp4" :
      container === "webm" ? "video/webm" :
      container === "m4a" ? "audio/mp4" :
      container === "mp3" ? "audio/mpeg" :
      type === "audio" ? "audio/mp4" : "video/mp4";

    return {
      stream: web,
      size: stat.size,
      container,
      mimeType,
      title: meta.title,
    };
  } catch (err) {
    cleanup();
    throw err;
  }
}

function parseYtDlpOutput(stdout: string): { title: string; filePath: string } | null {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^TITLE\t(.*)\tFILEPATH\t(.*)$/);
    if (m) return { title: m[1], filePath: m[2] };
  }
  return null;
}

