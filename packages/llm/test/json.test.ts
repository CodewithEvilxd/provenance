import { expect, it } from "vitest";
import { parseModelJson } from "../src/json.js";

it.each([
  ['```json\n{"decisions":[]}\n```', { decisions: [] }],
  ['```\n{"decisions":[]}\n```', { decisions: [] }],
  ['{"decisions":[]}', { decisions: [] }],
  ['Here is the result: {"decisions":[]} Done.', { decisions: [] }],
])("parses model JSON from %s", (text, expected) => {
  expect(parseModelJson(text)).toEqual(expected);
});
