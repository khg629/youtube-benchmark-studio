import { getSetting, setSetting } from "./db";

export type ApiKeyProvider = "anthropic" | "openai" | "gemini" | "youtube";
export type LLMProvider = "anthropic" | "openai" | "gemini";

const DB_KEY_BY_PROVIDER: Record<ApiKeyProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  youtube: "YOUTUBE_API_KEY",
};

const MODEL_KEY_BY_PROVIDER: Record<LLMProvider, string> = {
  anthropic: "CLAUDE_MODEL",
  openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL",
};

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-opus-4-7",
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
};

/**
 * 우선순위: DB에 저장된 값 > process.env 값
 * UI에서 키를 넣으면 DB에 저장 → 즉시 적용 (재시작 불필요)
 */
export function getApiKey(provider: ApiKeyProvider): string | null {
  const key = DB_KEY_BY_PROVIDER[provider];
  const fromDb = getSetting(key);
  if (fromDb) return fromDb;
  const fromEnv = process.env[key];
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

export function setApiKey(provider: ApiKeyProvider, value: string | null): void {
  setSetting(DB_KEY_BY_PROVIDER[provider], value);
}

export function apiKeySource(provider: ApiKeyProvider): "db" | "env" | "none" {
  const key = DB_KEY_BY_PROVIDER[provider];
  if (getSetting(key)) return "db";
  if (process.env[key]) return "env";
  return "none";
}

/**
 * 환경 변수 ANTHROPIC_API_KEY 같은 걸 OpenAI/Anthropic/Gemini SDK가 내부적으로 읽어가지 못하도록,
 * 명시적으로 키를 넘겨주는 게 안전함. 이 함수는 그때 쓸 키를 반환.
 */
export function getModel(provider: LLMProvider): string {
  const key = MODEL_KEY_BY_PROVIDER[provider];
  const fromDb = getSetting(key);
  if (fromDb) return fromDb;
  const fromEnv = process.env[key];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return DEFAULT_MODELS[provider];
}

export function setModel(provider: LLMProvider, value: string | null): void {
  setSetting(MODEL_KEY_BY_PROVIDER[provider], value);
}

export function modelSource(provider: LLMProvider): "db" | "env" | "default" {
  const key = MODEL_KEY_BY_PROVIDER[provider];
  if (getSetting(key)) return "db";
  if (process.env[key]) return "env";
  return "default";
}

export function requireApiKey(provider: ApiKeyProvider): string {
  const key = getApiKey(provider);
  if (!key) {
    const names: Record<ApiKeyProvider, string> = {
      anthropic: "Claude (ANTHROPIC_API_KEY)",
      openai: "ChatGPT (OPENAI_API_KEY)",
      gemini: "Gemini (GEMINI_API_KEY)",
      youtube: "YouTube Data API (YOUTUBE_API_KEY)",
    };
    throw new Error(`${names[provider]} 키가 설정되지 않았습니다. 설정 페이지에서 추가하세요.`);
  }
  return key;
}
