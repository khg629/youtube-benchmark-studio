import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApiKey, getModel, requireApiKey } from "../settings";

export function hasGeminiKey(): boolean {
  return Boolean(getApiKey("gemini"));
}

type ImageData = { base64: string; mime: string };

export async function analyzeWithGemini(
  prompt: string,
  image: ImageData | null,
): Promise<{ text: string; model: string }> {
  return analyzeWithGeminiMulti(prompt, image ? [image] : []);
}

export async function analyzeWithGeminiMulti(
  prompt: string,
  images: ImageData[],
): Promise<{ text: string; model: string }> {
  const modelName = getModel("gemini");
  const genAI = new GoogleGenerativeAI(requireApiKey("gemini"));
  const model = genAI.getGenerativeModel({ model: modelName });

  const parts: Parameters<typeof model.generateContent>[0] = [
    ...images.map((img) => ({ inlineData: { data: img.base64, mimeType: img.mime } })),
    { text: prompt },
  ];

  const resp = await model.generateContent(parts);
  const text = resp.response.text();
  return { text, model: modelName };
}
