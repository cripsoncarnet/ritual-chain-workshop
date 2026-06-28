import { hexToString } from "viem";

export type RankingEntry = {
  index: number;
  score: number;
  reason: string;
};

export type JudgeResult = {
  winnerIndex: number;
  ranking: RankingEntry[];
  summary: string;
};

export type DecodedAiReview = {
  /** Raw decoded text (UTF-8 best-effort) of the on-chain `aiReview` bytes. */
  raw: string;
  /** Parsed judge result, or null if the bytes weren't parseable JSON. */
  parsed: JudgeResult | null;
};

const EMPTY_BYTES = new Set(["", "0x"]);

/**
 * Decode the on-chain `aiReview` bytes into text and, when possible, a parsed
 * judge result.
 *
 * The contract stores the model's response bytes. We try to read them as UTF-8,
 * strip any stray markdown fences, pull out the first JSON object, and parse it
 * into the `{ winnerIndex, ranking, summary }` shape. If anything fails we still
 * return the raw text so the UI can show it verbatim.
 */
export function decodeAiReview(aiReviewHex?: string): DecodedAiReview | null {
  if (!aiReviewHex || EMPTY_BYTES.has(aiReviewHex)) return null;

  // The contract stores `completionData` which is ABI-encoded by the Ritual
  // LLM precompile — NOT raw JSON text. We must ABI-decode it first to extract
  // the actual text content, then parse that as JSON.
  //
  // CompletionData ABI:
  //   (string id, string object, uint256 created, string model,
  //    string systemFingerprint, string serviceTier,
  //    uint256 choicesCount, bytes[] choicesData, bytes usageData)
  //
  // Each choicesData[i]: (uint256 index, string finishReason, bytes messageData)
  // messageData: (string role, string content, string refusal, uint256 toolCallsCount, bytes[] toolCallsData)

  let raw = "";
  try {
    const { decodeAbiParameters, parseAbiParameters } = require("viem") as typeof import("viem");
    const hex = aiReviewHex as `0x${string}`;

    const [, , , , , , choicesCount, choicesData] = decodeAbiParameters(
      parseAbiParameters("string, string, uint256, string, string, string, uint256, bytes[], bytes"),
      hex
    ) as [string, string, bigint, string, string, string, bigint, `0x${string}`[], `0x${string}`];

    if ((choicesCount as bigint) > 0n && (choicesData as `0x${string}`[]).length > 0) {
      const [, , messageData] = decodeAbiParameters(
        parseAbiParameters("uint256, string, bytes"),
        (choicesData as `0x${string}`[])[0]
      ) as [bigint, string, `0x${string}`];

      const [, content] = decodeAbiParameters(
        parseAbiParameters("string, string, string, uint256, bytes[]"),
        messageData
      ) as [string, string, string, bigint, `0x${string}`[]];

      raw = content as string;
    }
  } catch {
    // Not ABI-encoded CompletionData — fall back to raw UTF-8 interpretation
    try {
      raw = hexToString(aiReviewHex as `0x${string}`);
    } catch {
      raw = aiReviewHex;
    }
  }

  if (!raw) return null;
  const parsed = tryParseJudgeResult(raw);
  return { raw, parsed };
}

function tryParseJudgeResult(text: string): JudgeResult | null {
  const candidate = extractJson(text);
  if (!candidate) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }

  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  if (typeof o.winnerIndex !== "number") return null;

  const ranking: RankingEntry[] = Array.isArray(o.ranking)
    ? (o.ranking as unknown[])
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const e = r as Record<string, unknown>;
          return {
            index: typeof e.index === "number" ? e.index : Number(e.index),
            score: typeof e.score === "number" ? e.score : Number(e.score),
            reason: typeof e.reason === "string" ? e.reason : String(e.reason ?? ""),
          } satisfies RankingEntry;
        })
        .filter((r): r is RankingEntry => r !== null)
    : [];

  return {
    winnerIndex: o.winnerIndex,
    ranking,
    summary: typeof o.summary === "string" ? o.summary : "",
  };
}

/** Strip markdown fences, <think>...</think> GLM tags, and isolate the first {...} block. */
function extractJson(text: string): string | null {
  let t = text.trim();

  // GLM-4.7-FP8 always emits <think>...</think> chain-of-thought before the answer.
  // Strip it before looking for JSON.
  t = t.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Remove ```json ... ``` fences if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}
