import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/llm";

export async function GET() {
  return NextResponse.json({ providers: providerStatus() });
}
