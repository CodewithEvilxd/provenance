export function parseModelJson(text: string) {
  const unfenced = text.trim();
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first < 0 || last < first)
    throw new SyntaxError("Model response does not contain a JSON object");
  return JSON.parse(unfenced.slice(first, last + 1)) as unknown;
}
