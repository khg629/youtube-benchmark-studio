import fs from "node:fs/promises";
import path from "node:path";
import { dataPath } from "./paths";

const DATA_DIR = dataPath("thumbnails");

export async function downloadThumbnail(videoId: string, url: string): Promise<{ localPath: string; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const ext = mime.includes("webp") ? "webp" : mime.includes("png") ? "png" : "jpg";
    const filename = `${videoId}.${ext}`;
    const fullPath = path.join(DATA_DIR, filename);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(fullPath, buf);
    return { localPath: filename, mime };
  } catch {
    return null;
  }
}

export async function readThumbnail(filename: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const fullPath = path.join(DATA_DIR, filename);
    const buffer = await fs.readFile(fullPath);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { buffer, mime };
  } catch {
    return null;
  }
}

export async function readThumbnailAsBase64(filename: string): Promise<{ base64: string; mime: string } | null> {
  const r = await readThumbnail(filename);
  if (!r) return null;
  return { base64: r.buffer.toString("base64"), mime: r.mime };
}
