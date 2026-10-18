import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, posix } from "node:path";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import type { CommitDetail } from "./github.js";

export type FunctionNode = {
  id: string;
  name: string;
  path: string;
  start_line: number;
  end_line: number;
  signature_hash: string;
};
export type CallEdge = { caller: string; callee: string; confidence: number };
type UnresolvedCall = { caller: string; callee: string };
type ImportBinding = { local: string; imported: string; module: string };
type ParsedFile = {
  functions: FunctionNode[];
  calls: UnresolvedCall[];
  imports: ImportBinding[];
};

const parser = new Parser();

function language(path: string) {
  const extension = extname(path);
  if (extension === ".tsx") return TypeScript.tsx;
  if ([".ts", ".mts", ".cts"].includes(extension)) return TypeScript.typescript;
  return JavaScript;
}

function nameOf(node: Parser.SyntaxNode) {
  const name = node.childForFieldName("name");
  if (name) return name.text;
  if (node.type === "arrow_function" || node.type === "function_expression") {
    const declarator =
      node.parent?.type === "variable_declarator" ? node.parent : undefined;
    const identifier = declarator?.childForFieldName("name");
    if (identifier) return identifier.text;
  }
  return undefined;
}

function functionsIn(path: string, root: Parser.SyntaxNode) {
  const functions: Array<
    FunctionNode & { start_byte: number; end_byte: number }
  > = [];
  const occurrences = new Map<string, number>();
  const visit = (node: Parser.SyntaxNode, parentName?: string) => {
    const ownName = [
      "class_declaration",
      "class",
      "function_declaration",
      "generator_function_declaration",
      "method_definition",
    ].includes(node.type)
      ? nameOf(node)
      : undefined;
    if (
      [
        "function_declaration",
        "generator_function_declaration",
        "method_definition",
        "arrow_function",
        "function_expression",
      ].includes(node.type)
    ) {
      const name = nameOf(node);
      if (name) {
        const baseName = parentName ? `${parentName}.${name}` : name;
        const occurrence = (occurrences.get(baseName) ?? 0) + 1;
        occurrences.set(baseName, occurrence);
        const qualifiedName =
          occurrence === 1
            ? baseName
            : `${baseName}@${node.startPosition.row + 1}`;
        const signature = `${node.type}:${name}:${node.childForFieldName("parameters")?.text ?? ""}`;
        functions.push({
          id: `fn:${path}#${qualifiedName}`,
          name,
          path,
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          signature_hash: createHash("sha256").update(signature).digest("hex"),
          start_byte: node.startIndex,
          end_byte: node.endIndex,
        });
      }
    }
    for (const child of node.namedChildren) visit(child, ownName ?? parentName);
  };
  visit(root);
  return functions;
}

function callsIn(
  root: Parser.SyntaxNode,
  functions: ReturnType<typeof functionsIn>,
) {
  const calls: UnresolvedCall[] = [];
  const visit = (node: Parser.SyntaxNode) => {
    if (node.type === "call_expression") {
      const callee = node.childForFieldName("function");
      if (callee?.type === "identifier") {
        const caller = functions
          .filter(
            (fn) =>
              fn.start_byte <= node.startIndex && fn.end_byte >= node.endIndex,
          )
          .sort(
            (left, right) =>
              left.end_byte -
              left.start_byte -
              (right.end_byte - right.start_byte),
          )[0];
        if (caller) calls.push({ caller: caller.id, callee: callee.text });
      }
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(root);
  return calls;
}

function importsIn(root: Parser.SyntaxNode, path: string) {
  const imports: ImportBinding[] = [];
  const visit = (node: Parser.SyntaxNode) => {
    if (node.type === "import_statement") {
      const moduleName = /from\s+["']([^"']+)["']/.exec(node.text)?.[1];
      const module = moduleName?.startsWith(".")
        ? posix.normalize(posix.join(posix.dirname(path), moduleName))
        : undefined;
      if (module) {
        const named = /\{([^}]+)\}/.exec(node.text)?.[1];
        for (const specifier of named?.split(",") ?? []) {
          const [imported, local] = specifier.trim().split(/\s+as\s+/);
          if (imported)
            imports.push({ imported, local: local ?? imported, module });
        }
        const defaultImport = /^\s*import\s+(\w+)\s+from/.exec(node.text)?.[1];
        if (defaultImport)
          imports.push({ imported: "default", local: defaultImport, module });
      }
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(root);
  return imports;
}

function importedFunctions(binding: ImportBinding, functions: FunctionNode[]) {
  return functions.filter(
    (fn) =>
      fn.name === binding.imported &&
      (fn.path === binding.module ||
        fn.path.startsWith(`${binding.module}.`) ||
        fn.path.startsWith(`${binding.module}/index.`)),
  );
}

export async function parseFile(
  filePath: string,
  repositoryPath = filePath,
): Promise<ParsedFile> {
  const source = await readFile(filePath, "utf8");
  return parseSource(source, repositoryPath);
}

export function parseSource(
  source: string,
  repositoryPath: string,
): ParsedFile {
  parser.setLanguage(language(repositoryPath));
  const tree = parser.parse(source);
  const functions = functionsIn(repositoryPath, tree.rootNode);
  const calls = callsIn(tree.rootNode, functions);
  const imports = importsIn(tree.rootNode, repositoryPath);
  return { functions, calls, imports };
}

export function resolveCalls(files: ParsedFile[]) {
  const allFunctions = files.flatMap((file) => file.functions);
  const edges = new Map<string, CallEdge>();
  for (const file of files) {
    for (const call of file.calls) {
      const caller = allFunctions.find((fn) => fn.id === call.caller);
      const binding = file.imports.find((entry) => entry.local === call.callee);
      const imported = binding ? importedFunctions(binding, allFunctions) : [];
      const sameFile = allFunctions.filter(
        (fn) => fn.path === caller?.path && fn.name === call.callee,
      );
      const candidates = imported.length
        ? imported
        : sameFile.length
          ? sameFile
          : binding
            ? []
            : allFunctions.filter((fn) => fn.name === call.callee);
      for (const candidate of candidates) {
        const edge = {
          caller: call.caller,
          callee: candidate.id,
          confidence: imported.length
            ? 0.9
            : sameFile.length
              ? 1
              : candidates.length === 1
                ? 0.6
                : 0.6 / candidates.length,
        };
        const key = `${edge.caller}\n${edge.callee}`;
        if (
          !edges.has(key) ||
          (edges.get(key)?.confidence ?? 0) < edge.confidence
        )
          edges.set(key, edge);
      }
    }
  }
  return { functions: allFunctions, calls: [...edges.values()] };
}

export function modifiedFunctions(
  details: CommitDetail[],
  functions: FunctionNode[],
) {
  const edges: Array<{
    commit: string;
    fn: string;
    lines_changed: number;
    valid_from: string | null;
  }> = [];
  for (const detail of details) {
    for (const file of detail.files) {
      const ranges = [
        ...(file.patch ?? "").matchAll(
          /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm,
        ),
      ].map((match) => {
        const start = Number(match[1]);
        return [start, start + Number(match[2] ?? 1) - 1] as const;
      });
      for (const fn of functions.filter(
        (candidate) => candidate.path === file.filename,
      )) {
        const changed = ranges.filter(
          ([start, end]) => start <= fn.end_line && end >= fn.start_line,
        );
        if (changed.length)
          edges.push({
            commit: `commit:${detail.sha}`,
            fn: fn.id,
            lines_changed: file.additions + file.deletions,
            valid_from: detail.commit.author?.date ?? null,
          });
      }
    }
  }
  return edges;
}
