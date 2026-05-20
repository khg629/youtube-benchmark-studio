import { NextResponse } from "next/server";
import { getExposureForVideo, takeSnapshot } from "@/lib/snapshots";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const snapshot = await takeSnapshot(id);
    const exposure = getExposureForVideo(id);
    return NextResponse.json({ snapshot, exposure });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
