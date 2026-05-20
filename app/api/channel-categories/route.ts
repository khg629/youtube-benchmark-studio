import { NextResponse } from "next/server";
import { createChannelCategory, listChannelCategories } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ categories: listChannelCategories() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string; color?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name이 필요합니다" }, { status: 400 });
  try {
    const cat = createChannelCategory(name, body.color ?? null);
    return NextResponse.json({ category: cat });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /UNIQUE/.test(msg) ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
