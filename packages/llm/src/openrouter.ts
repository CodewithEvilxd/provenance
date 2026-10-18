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
export const OPENROUTER_TIMEOUT_MS = 90_000;

export function openrouterProvider(
  apiKey: string,
  model: string,
  fetcher: typeof fetch,
  options: {
    wait?: (milliseconds: number) => Promise<void>;
    now?: () => number;
  } = {},
): CompletionProvider {
  const now = options.now ?? Date.now;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastStartedAt = 0;
  let pacing = Promise.resolve();
  const startFreeModelRequest = (start: () => Promise<unknown>) => {
    let request: Promise<unknown>;
    const turn = pacing.then(async () => {
      const delay = Math.max(0, lastStartedAt + 4000 - now());
      if (delay) await wait(delay);
      lastStartedAt = now();
      request = start();
    });
    pacing = turn.catch(() => undefined);
    return turn.then(() => request!);
  };
  return {
    name: "openrouter",
    async complete(prompt, correction, purpose = "extract", maxTokens) {
      const startedAt = now();
      const request = () =>
        providerJson(
          "openrouter",
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model,
              temperature: 0,
              max_tokens: outputTokenLimit(purpose, maxTokens),
              messages: [
                { role: "user", content: promptText(prompt, correction) },
              ],
            }),
          },
          fetcher,
          OPENROUTER_TIMEOUT_MS,
        );
      const invoke = () =>
        model.endsWith(":free") ? startFreeModelRequest(request) : request();
      let body: unknown;
      try {
        body = await invoke();
      } catch (error) {
        if (
          !model.endsWith(":free") ||
          purpose !== "decision_check" ||
          !(error instanceof ProviderFailure) ||
          error.causeName !== "TimeoutError"
        )
          throw error;
        body = await invoke();
      }
      const parsed = completionBody.safeParse(body);
      const content = parsed.success
        ? parsed.data.choices[0]?.message.content
        : undefined;
      if (!parsed.success || !content?.trim())
        throw new ProviderFailure(
          "openrouter",
          "malformed",
          "completion text is missing",
          undefined,
          undefined,
          { elapsedMs: now() - startedAt },
        );
      return content;
    },
  };
}
