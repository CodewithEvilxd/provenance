import { z } from "zod";
import { providerJson, promptText } from "./http.js";
import {
  ProviderFailure,
  outputTokenLimit,
  type CompletionProvider,
} from "./types.js";

const completionBody = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
});

export function openaiProvider(
  apiKey: string,
  model: string,
  fetcher: typeof fetch,
): CompletionProvider {
  return {
    name: "openai",
    async complete(prompt, correction, purpose = "extract", maxTokens) {
      const body = await providerJson(
        "openai",
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_completion_tokens: outputTokenLimit(purpose, maxTokens),
            messages: [
              { role: "user", content: promptText(prompt, correction) },
            ],
          }),
        },
        fetcher,
      );
      const parsed = completionBody.safeParse(body);
      if (!parsed.success || !parsed.data.choices[0])
        throw new ProviderFailure(
          "openai",
          "malformed",
          "completion text is missing",
        );
      return parsed.data.choices[0].message.content;
    },
  };
}
