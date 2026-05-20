import { NextResponse } from "next/server";
import { deleteChannelCategory, renameChannelCategory } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const cid = Number(id);
  if (!Number.isFinite(cid)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = (await req.json()) as { name?: string };
  if (typeof body.name === "string") {
    try {
      renameChannelCategory(cid, body.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = /UNIQUE/.test(msg) ? 409 : 400;
      return NextResponse.json({ error: msg }, { status });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const cid = Number(id);
  if (!Number.isFinite(cid)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  deleteChannelCategory(cid);
  return NextResponse.json({ ok: true });
}
