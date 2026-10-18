import { expect, it } from "vitest";
import { createLlmRouter } from "../src/router.js";

it("requires an explicit initial provider route", () => {
  expect(() => createLlmRouter({})).toThrow("LLM_PROVIDER");
});
