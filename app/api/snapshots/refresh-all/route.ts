import { NextResponse } from "next/server";
import { listVideos } from "@/lib/db";
import { takeSnapshotsForAll } from "@/lib/snapshots";

export async function POST() {
  const ids = listVideos().map((v) => v.id);
  if (ids.length === 0) return NextResponse.json({ ok: [], failed: [], total: 0 });
  const { ok, failed } = await takeSnapshotsForAll(ids);
  return NextResponse.json({ ok, failed, total: ids.length });
}
