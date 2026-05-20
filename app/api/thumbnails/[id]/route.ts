import { NextResponse } from "next/server";
import { getVideo } from "@/lib/db";
import { readThumbnail } from "@/lib/thumbnails";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = getVideo(id);
  if (!video || !video.thumbnail_local) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const data = await readThumbnail(video.thumbnail_local);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(data.buffer), {
    headers: {
      "Content-Type": data.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
