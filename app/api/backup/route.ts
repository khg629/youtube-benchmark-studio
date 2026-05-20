import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { createDatabaseBackup, restoreDatabaseFromBuffer } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const fileName = `youtube-benchmark-${stamp}.db`;
  const tempPath = path.join(os.tmpdir(), fileName);

  await createDatabaseBackup(tempPath);
  const bytes = await fs.readFile(tempPath);
  await fs.rm(tempPath, { force: true });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "복원할 .db 파일을 선택하세요." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    restoreDatabaseFromBuffer(buffer);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `복원 실패: ${msg}` }, { status: 400 });
  }
}
