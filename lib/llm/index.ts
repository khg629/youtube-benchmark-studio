import type { Provider } from "../types";
import { analyzeWithClaude, analyzeWithClaudeMulti, hasClaudeKey } from "./claude";
import { analyzeWithGemini, analyzeWithGeminiMulti, hasGeminiKey } from "./gemini";
import { analyzeWithOpenAI, analyzeWithOpenAIMulti, hasOpenAIKey } from "./openai";

export type ProviderStatus = { provider: Provider; available: boolean; label: string };
type ImageData = { base64: string; mime: string };

export function providerStatus(): ProviderStatus[] {
  return [
    { provider: "claude", label: "Claude", available: hasClaudeKey() },
    { provider: "openai", label: "ChatGPT", available: hasOpenAIKey() },
    { provider: "gemini", label: "Gemini", available: hasGeminiKey() },
  ];
}

export async function analyze(
  provider: Provider,
  prompt: string,
  image: ImageData | null,
): Promise<{ text: string; model: string }> {
  switch (provider) {
    case "claude":
      return analyzeWithClaude(prompt, image);
    case "openai":
      return analyzeWithOpenAI(prompt, image);
    case "gemini":
      return analyzeWithGemini(prompt, image);
  }
}

export async function analyzeMulti(
  provider: Provider,
  prompt: string,
  images: ImageData[],
): Promise<{ text: string; model: string }> {
  switch (provider) {
    case "claude":
      return analyzeWithClaudeMulti(prompt, images);
    case "openai":
      return analyzeWithOpenAIMulti(prompt, images);
    case "gemini":
      return analyzeWithGeminiMulti(prompt, images);
  }
}
