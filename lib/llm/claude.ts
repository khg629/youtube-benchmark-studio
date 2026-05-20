import Anthropic from "@anthropic-ai/sdk";
import { getApiKey, getModel, requireApiKey } from "../settings";

export function hasClaudeKey(): boolean {
  return Boolean(getApiKey("anthropic"));
}

type ImageData = { base64: string; mime: string };

export async function analyzeWithClaude(
  prompt: string,
  image: ImageData | null,
): Promise<{ text: string; model: string }> {
  return analyzeWithClaudeMulti(prompt, image ? [image] : []);
}

export async function analyzeWithClaudeMulti(
  prompt: string,
  images: ImageData[],
): Promise<{ text: string; model: string }> {
  const model = getModel("anthropic");
  const client = new Anthropic({ apiKey: requireApiKey("anthropic") });
  const content: Anthropic.ContentBlockParam[] = [];
  for (const img of images) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: img.base64,
      },
    });
  }
  content.push({ type: "text", text: prompt });

  const resp = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content }],
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { text, model };
}
