import { NextResponse } from "next/server";
import { deleteVideo, getAnalyses, getVideo, setTags, updateNote } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = getVideo(id);
  if (!video) return NextResponse.json({ error: "영상을 찾을 수 없음" }, { status: 404 });
  const analyses = getAnalyses(id);
  return NextResponse.json({ video, analyses });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getVideo(id)) return NextResponse.json({ error: "영상을 찾을 수 없음" }, { status: 404 });
  const body = (await req.json()) as { note?: string; tags?: string[] };
  if (typeof body.note === "string") updateNote(id, body.note);
  if (Array.isArray(body.tags)) setTags(id, body.tags);
  return NextResponse.json({ video: getVideo(id) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteVideo(id);
  return NextResponse.json({ ok: true });
}
