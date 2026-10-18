import { expect, it } from "vitest";
import { openrouterProvider } from "../src/openrouter.js";

it("spaces free OpenRouter model request starts four seconds apart", async () => {
  let clock = 4000;
  const starts: number[] = [];
  const delays: number[] = [];
  const provider = openrouterProvider(
    "offline-key",
    "google/gemma-4-31b-it:free",
    async () => {
      starts.push(clock);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        { status: 200 },
      );
    },
    {
      now: () => clock,
      wait: async (delay) => {
        delays.push(delay);
        clock += delay;
      },
    },
  );
  const first = provider.complete("first");
  const second = provider.complete("second");
  await Promise.all([first, second]);
  expect(starts).toEqual([4000, 8000]);
  expect(delays).toEqual([4000]);
});

it("does not delay non-free OpenRouter model requests", async () => {
  const starts: number[] = [];
  const provider = openrouterProvider(
    "offline-key",
    "google/gemma-4-31b-it",
    async () => {
      starts.push(Date.now());
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        { status: 200 },
      );
    },
  );
  await Promise.all([provider.complete("first"), provider.complete("second")]);
  expect(starts).toHaveLength(2);
});
