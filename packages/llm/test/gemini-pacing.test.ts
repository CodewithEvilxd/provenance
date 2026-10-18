import { expect, it } from "vitest";
import { createGeminiPacer } from "../src/gemini.js";

it("enforces the configured minimum gap between Gemini request starts", async () => {
  let time = 100;
  const waits: number[] = [];
  const pace = createGeminiPacer(
    () => time,
    async (milliseconds) => {
      waits.push(milliseconds);
      time += milliseconds;
    },
  );

  await pace(6000);
  await pace(6000);
  await pace(6000);

  expect(waits).toEqual([6000, 6000]);
  expect(time).toBe(12_100);
});
