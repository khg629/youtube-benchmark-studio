import { NextResponse } from "next/server";
import { downloadVideo } from "@/lib/download";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeFilename(title: string, fallback: string): string {
  const base = title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 120).trim();
  return base || fallback;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return NextResponse.json({ error: "invalid video id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const quality = url.searchParams.get("quality") ?? "best";
  const type = (url.searchParams.get("type") ?? "video+audio") as
    | "video"
    | "audio"
    | "video+audio";

  let result;
  try {
    result = await downloadVideo(id, quality, type);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /sign in|login|private|members|age|restricted|연결/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: `다운로드 실패: ${message}` }, { status });
  }

  const filename = `${safeFilename(result.title, id)}.${result.container}`;
  const asciiFilename = filename.replace(/[^\x20-\x7e]/g, "_");

  const headers: Record<string, string> = {
    "Content-Type": result.mimeType,
    "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store",
  };
  if (result.size != null) headers["Content-Length"] = String(result.size);

  return new Response(result.stream, { headers });
}
