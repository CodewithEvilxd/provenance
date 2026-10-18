import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import ts from "typescript";

const roots = ["apps", "packages"];
const extensions = new Set([".ts", ".tsx", ".cypher"]);
const forbidden = [
  /console\.(?:log|debug)/i,
  /\/\*|\*\//,
  /\b(?:TODO|FIXME|HACK|XXX)\b/i,
  /\b(?:faker|mock|dummy|lorem|fixture|stub|fake)\b|sample data|placeholder data/i,
  /(?:jest|vi)\.(?:fn|mock|spyOn)/,
  /\.(?:skip|only)\s*\(|(?:it|test)\.todo/,
  /\p{Extended_Pictographic}/u,
  /:\s*any\b|\bas\s+any\b|<any>/,
];
const failures: string[] = [];
const warnings: string[] = [];

async function sourceFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory())
        return entry.name === ".next" ? [] : sourceFiles(path);
      if (entry.name === "next-env.d.ts") return [];
      return extensions.has(path.slice(path.lastIndexOf("."))) ? [path] : [];
    }),
  );
  return paths.flat();
}

for (const root of roots) {
  const paths = await sourceFiles(root).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  for (const path of paths) {
    const text = await readFile(path, "utf8");
    const lines = text.split(/\r?\n/);
    const name = relative(process.cwd(), path);
    if (lines.length > 300) warnings.push(`${name}: ${lines.length} lines`);
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      const source = ts.createSourceFile(
        name,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          (ts.isFunctionDeclaration(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isArrowFunction(node) ||
            ts.isFunctionExpression(node)) &&
          node.body
        ) {
          const start = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          ).line;
          const end = source.getLineAndCharacterOfPosition(node.end).line;
          if (end - start + 1 > 60)
            warnings.push(
              `${name}:${start + 1}: ${end - start + 1} function lines`,
            );
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    for (const [index, line] of lines.entries()) {
      if (forbidden.some((pattern) => pattern.test(line)))
        failures.push(`${name}:${index + 1}`);
      if (
        line.trimStart().startsWith("//") &&
        lines[index + 1]?.trimStart().startsWith("//")
      ) {
        failures.push(`${name}:${index + 1}`);
      }
    }
  }
}

for (const warning of warnings) process.stderr.write(`${warning}\n`);
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}
