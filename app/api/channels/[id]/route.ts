import { NextResponse } from "next/server";
import {
  deleteChannel,
  getChannel,
  setChannelCategories,
  updateChannelNote,
  upsertChannel,
} from "@/lib/db";
import { resolveChannel } from "@/lib/channel-resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ch = getChannel(id);
  if (!ch) return NextResponse.json({ error: "채널을 찾을 수 없음" }, { status: 404 });

  const body = (await req.json()) as {
    note?: string;
    category_ids?: number[];
    refresh?: boolean;
  };

  if (typeof body.note === "string") {
    updateChannelNote(id, body.note);
  }
  if (Array.isArray(body.category_ids)) {
    setChannelCategories(id, body.category_ids);
  }
  if (body.refresh) {
    try {
      const r = await resolveChannel(id);
      upsertChannel({
        id: r.id,
        url: r.url,
        handle: r.handle,
        name: r.name,
        thumbnail_url: r.thumbnail_url,
        subscriber_count: r.subscriber_count,
        subscriber_text: r.subscriber_text,
        video_count: r.video_count,
        video_count_text: r.video_count_text,
        description: r.description,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `메타 새로고침 실패: ${msg}` }, { status: 500 });
    }
  }

  return NextResponse.json({ channel: getChannel(id) });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  deleteChannel(id);
  return NextResponse.json({ ok: true });
}
