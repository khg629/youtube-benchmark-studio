import { NextResponse } from "next/server";
import { getAuthStatus, signOut, startDeviceFlow } from "@/lib/youtube-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getAuthStatus();
  return NextResponse.json(status);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action;

  if (action === "start") {
    try {
      const code = await startDeviceFlow();
      return NextResponse.json({
        ok: true,
        verification_url: code.verification_url,
        user_code: code.user_code,
        expires_in: code.expires_in,
        interval: code.interval,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ ok: false, message }, { status: 400 });
    }
  }

  if (action === "logout") {
    await signOut();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, message: "unknown action" }, { status: 400 });
}
