import OpenAI from "openai";
import { getApiKey, getModel, requireApiKey } from "../settings";

export function hasOpenAIKey(): boolean {
  return Boolean(getApiKey("openai"));
}

type ImageData = { base64: string; mime: string };

export async function analyzeWithOpenAI(
  prompt: string,
  image: ImageData | null,
): Promise<{ text: string; model: string }> {
  return analyzeWithOpenAIMulti(prompt, image ? [image] : []);
}

export async function analyzeWithOpenAIMulti(
  prompt: string,
  images: ImageData[],
): Promise<{ text: string; model: string }> {
  const model = getModel("openai");
  const client = new OpenAI({ apiKey: requireApiKey("openai") });
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: prompt },
  ];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    });
  }
  const resp = await client.chat.completions.create({
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content }],
  });
  const text = resp.choices[0]?.message?.content ?? "";
  return { text, model };
}
