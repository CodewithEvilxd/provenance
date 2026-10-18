# LLM providers

Set `LLM_PROVIDER` to exactly one of `openai`, `gemini`, `anthropic`, or `openrouter`. There is no implicit default. Each provider reads its matching key and model variable: `OPENAI_API_KEY` / `OPENAI_MODEL`, `GEMINI_API_KEY` / `GEMINI_MODEL`, `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`, or `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`. OpenRouter uses its own API key as a Bearer token and its own model ID, for example `openai/gpt-4.1-mini`.

`LLM_FALLBACK_PROVIDERS` accepts an ordered, comma-separated list such as `openai,anthropic,openrouter`; `LLM_FALLBACK_PROVIDER` remains supported for one fallback, and the two settings cannot be combined. The router advances only after a transient network/server failure or rate limit, and after quota failure only when `LLM_FALLBACK_ON_QUOTA=true`. It skips providers without keys and stops at the first successful response. Providers that fail with an eligible error are not retried during that router run, so subsequent extraction threads use the first provider that remains available. Invalid credentials, malformed responses, and unsupported options stop routing. Provider errors retain HTTP status and cause; displayed errors and route events contain no secrets.

Set `LLM_REVIEW_PROVIDER` to a distinct provider for second opinions on hard, lower-confidence, or multi-scope decisions. It must differ from the provider that actually produced the extraction, including when extraction used fallback. Review results and route events are stored with the content-hash extraction cache. Agreement is recorded as a second opinion and never substitutes for source-comment or graph-scope validation.

Offline adapter contracts run as part of `pnpm check`; they make no provider calls. A live smoke test is opt-in and sends one small JSON request to only the selected primary. Set `LLM_LIVE_SMOKE=true`, set one `LLM_PROVIDER`, then run `pnpm llm:smoke`. The smoke command disables fallback and review so one invocation cannot contact another provider. Repeat only for providers that have not returned a permanent or quota failure.

Last recorded live outcomes, from prior extraction attempts:

| Provider   | Configuration                | Last recorded outcome                            |
| ---------- | ---------------------------- | ------------------------------------------------ |
| OpenAI     | `OPENAI_API_KEY` present     | Quota unavailable, HTTP 429                      |
| Gemini     | `GEMINI_API_KEY` present     | HTTP 404: `gemini-2.5-flash` unavailable to new users; updated to `gemini-3.8-flash`, not yet live-tested |
| Anthropic  | `ANTHROPIC_API_KEY` present  | Quota unavailable, HTTP 400 insufficient credits |
| OpenRouter | `OPENROUTER_API_KEY` present | Quota unavailable, HTTP 402                      |

Key presence only confirms that an environment variable is set. It does not verify key validity, provider access, or remaining quota.

Current workspace routing in `.env.local` uses `gemini-3.8-flash` as Gemini primary and OpenAI, Anthropic, then OpenRouter as ordered fallbacks, with quota fallback enabled. This is a route configuration only; provider availability still requires a successful live response. Do not launch repeated extraction attempts after all available providers have failed.
