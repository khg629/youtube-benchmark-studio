import { NextResponse } from "next/server";
import {
  apiKeySource,
  DEFAULT_MODELS,
  getModel,
  modelSource,
  setApiKey,
  setModel,
  type ApiKeyProvider,
  type LLMProvider,
} from "@/lib/settings";

const KEY_PROVIDERS: ApiKeyProvider[] = ["anthropic", "openai", "gemini", "youtube"];
const LLM_PROVIDERS: LLMProvider[] = ["anthropic", "openai", "gemini"];

function statusPayload() {
  const keys: Record<string, { source: "db" | "env" | "none" }> = {};
  for (const p of KEY_PROVIDERS) keys[p] = { source: apiKeySource(p) };
  const models: Record<string, { value: string; source: "db" | "env" | "default"; default: string }> = {};
  for (const p of LLM_PROVIDERS) {
    models[p] = { value: getModel(p), source: modelSource(p), default: DEFAULT_MODELS[p] };
  }
  return { providers: keys, models };
}

export async function GET() {
  return NextResponse.json(statusPayload());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<
    Record<ApiKeyProvider, string | null> & { models?: Partial<Record<LLMProvider, string | null>> }
  >;
  const updated: string[] = [];

  for (const p of KEY_PROVIDERS) {
    if (p in body) {
      const v = body[p];
      setApiKey(p, typeof v === "string" ? v.trim() : null);
      updated.push(`key:${p}`);
    }
  }

  if (body.models) {
    for (const p of LLM_PROVIDERS) {
      if (p in body.models) {
        const v = body.models[p];
        setModel(p, typeof v === "string" ? v.trim() : null);
        updated.push(`model:${p}`);
      }
    }
  }

  return NextResponse.json({ updated, ...statusPayload() });
}
