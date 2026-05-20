import { NextResponse } from "next/server";
import {
  getChannel,
  listChannels,
  setChannelCategories,
  upsertChannel,
} from "@/lib/db";
import { resolveChannel } from "@/lib/channel-resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ channels: listChannels() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    input?: string;
    category_ids?: number[];
  };
  const input = body.input?.trim();
  if (!input) {
    return NextResponse.json({ error: "input(URL/handle/ID)이 필요합니다" }, { status: 400 });
  }

  let resolved;
  try {
    resolved = await resolveChannel(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const existing = getChannel(resolved.id);
  upsertChannel({
    id: resolved.id,
    url: resolved.url,
    handle: resolved.handle,
    name: resolved.name,
    thumbnail_url: resolved.thumbnail_url,
    subscriber_count: resolved.subscriber_count,
    subscriber_text: resolved.subscriber_text,
    video_count: resolved.video_count,
    video_count_text: resolved.video_count_text,
    description: resolved.description,
  });

  if (Array.isArray(body.category_ids)) {
    setChannelCategories(resolved.id, body.category_ids);
  }

  const channel = getChannel(resolved.id)!;
  return NextResponse.json({ channel, was_existing: existing !== null });
}
