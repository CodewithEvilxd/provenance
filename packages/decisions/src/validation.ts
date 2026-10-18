import { z } from "zod";
import type { LlmRouter } from "../../llm/src/types.js";
import { parseModelJson } from "../../llm/src/json.js";

export class MalformedModelResponseError extends Error {
  constructor(readonly reason: "invalid_json" | "schema_validation") {
    super(`Model response failed ${reason} after correction`);
    this.name = "MalformedModelResponseError";
  }
}

export async function completeJson<T>(
  router: LlmRouter,
  prompt: string,
  schema: z.ZodType<T>,
  purpose: "extract" | "review" | "decision_check" = "extract",
) {
  let correction = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await router.complete(prompt, correction, purpose);
    let parsed: unknown;
    try {
      parsed = parseModelJson(text);
    } catch (error) {
      if (attempt) throw new MalformedModelResponseError("invalid_json");
      correction = String(error);
      continue;
    }
    try {
      return schema.parse(parsed);
    } catch (error) {
      if (attempt) throw new MalformedModelResponseError("schema_validation");
      correction = String(error);
    }
  }
  throw new MalformedModelResponseError("invalid_json");
}
