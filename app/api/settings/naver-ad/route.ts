import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { NAVER_AD_KEYS } from "@/lib/naver";

type Field = keyof typeof NAVER_AD_KEYS;
const FIELDS: Field[] = ["apiKey", "secretKey", "customerId"];

function source(field: Field): "db" | "env" | "none" {
  const key = NAVER_AD_KEYS[field];
  if (getSetting(key)) return "db";
  if (process.env[key]) return "env";
  return "none";
}

function status() {
  return Object.fromEntries(FIELDS.map((f) => [f, { source: source(f) }])) as Record<
    Field,
    { source: "db" | "env" | "none" }
  >;
}

export async function GET() {
  return NextResponse.json(status());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Record<Field, string | null>>;
  for (const f of FIELDS) {
    if (f in body) {
      const v = body[f];
      setSetting(NAVER_AD_KEYS[f], typeof v === "string" ? v.trim() : null);
    }
  }
  return NextResponse.json(status());
}
