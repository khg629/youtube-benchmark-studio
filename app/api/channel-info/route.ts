import { NextResponse } from "next/server";
import { fetchChannelInfoBatch } from "@/lib/channel";

export async function POST(req: Request) {
  let body: { channelIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const ids = Array.isArray(body.channelIds)
    ? (body.channelIds.filter((x) => typeof x === "string") as string[])
    : [];
  if (ids.length === 0) return NextResponse.json({ channels: {} });
  const channels = await fetchChannelInfoBatch(ids);
  return NextResponse.json({ channels });
}
