import { fetchWithRetry, type RequestBudget } from '../http';

/**
 * Minimal Gemini REST client (generateContent with JSON-schema structured output).
 * Endpoint and auth header per https://aistudio.google.com/docs (v1beta, x-goog-api-key).
 * Model is configurable via GEMINI_MODEL.
 */

export interface GeminiOptions { apiKey: string; model: string; budget?: RequestBudget }
export interface GeminiUsage { promptTokens: number; outputTokens: number }

export class GeminiError extends Error {}

export async function generateStructured<T = unknown>(
  opts: GeminiOptions,
  args: { system: string; user: string; jsonSchema: object; temperature?: number; images?: Array<{ mimeType: string; base64: string }> },
): Promise<{ data: T; usage: GeminiUsage; raw: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const parts: unknown[] = [{ text: args.user }];
  for (const img of args.images ?? []) parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  const body = {
    systemInstruction: { parts: [{ text: args.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: args.temperature ?? 0.1,
      responseMimeType: 'application/json',
      responseJsonSchema: args.jsonSchema,
    },
  };
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
    body: JSON.stringify(body),
    timeoutMs: 45_000,
    retries: 2,
    budget: opts.budget,
  });
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  if (json.promptFeedback?.blockReason) throw new GeminiError(`Prompt blocked: ${json.promptFeedback.blockReason}`);
  const cand = json.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new GeminiError(`Empty response (finishReason=${cand?.finishReason ?? 'unknown'})`);
  let data: T;
  try { data = JSON.parse(text) as T; } catch { throw new GeminiError(`Model returned non-JSON output: ${text.slice(0, 200)}`); }
  return {
    data,
    raw: text,
    usage: { promptTokens: json.usageMetadata?.promptTokenCount ?? 0, outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}
