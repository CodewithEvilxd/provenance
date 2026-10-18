import { createHash } from "node:crypto";

export function embedText(text: string) {
  const vector = Array.from({ length: 384 }, () => 0);
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const grams = new Set<string>();
  for (const word of normalized.split(/\s+/)) {
    const padded = `  ${word}  `;
    for (let offset = 0; offset + 3 <= padded.length; offset++)
      grams.add(padded.slice(offset, offset + 3));
  }
  for (const gram of grams) {
    const digest = createHash("sha256").update(gram).digest();
    const index = digest.readUInt16BE(0) % vector.length;
    vector[index] = (vector[index] ?? 0) + (digest[2]! % 2 ? 1 : -1);
  }
  const magnitude = Math.sqrt(
    vector.reduce((sum, number) => sum + number ** 2, 0),
  );
  return vector.map((number) => number / magnitude);
}
