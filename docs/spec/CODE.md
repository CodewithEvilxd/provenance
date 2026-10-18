# CODE: How Code Must Be Written in Provenance

Read this before writing any code. SKILL.md says what to build and in what order. BRAIN.md says how the system works. This file says how every line of code must look and how it must be tested. If a rule here conflicts with something in SKILL.md or BRAIN.md, this file wins.

There are three non-negotiable goals:

1. The code must read like a careful human wrote it, not like generated output.
2. The code must be as small as the task allows.
3. Everything must work for real, with real data, and be proven by tests.

## 1. Smallest code that does the job

A small task gets a small solution. If the job can be done in 6 lines, do not write 60. Before writing a new function, file or dependency, ask whether something already in the repo, the language or an installed package does it.

- Use what exists first: the standard library, Node built-ins, the installed packages (zod, octokit, falkordb client, p-limit if installed). Do not rewrite a retry loop, a chunk helper or a date formatter that a one-line call already covers.
- A function does one thing and is usually under 25 lines. A file is usually under 200 lines. A React component is usually under 150 lines. If you go past these, split by responsibility, not by habit.
- Do not add a layer that does not earn its place. A wrapper around a one-line call is noise. A class with one method should be a function. An interface with one implementation and no second one planned should not exist.
- Do not add options, flags or config that nothing uses yet.
- Copy once is fine. Abstract on the third repetition, not the second.
- Delete code you are not using. No dead branches, no unused exports, no commented-out code.

## 2. Comments

- No multi-line comments. No block comments. No JSDoc blocks. No section banners. No file header comments. No step-by-step narration like "step 1", "now we do".
- A single short line comment is allowed only to explain why something non-obvious is done, never what the next line does. Most files should have zero comments. If you feel you need a comment, first try a better name or a smaller function.
- Cypher files may have at most one line at the top naming the query. Parameters are visible in the query itself.
- No TODO, FIXME or HACK comments. Either do it now or do not write it down in code. Open work goes in `docs/PROGRESS.md`.
- Type annotations and good names do the documenting.

## 3. Things that make code look generated, and must not appear

The following patterns are banned because they make a codebase feel templated. Avoid them in every file.

- Generic names: `data`, `result`, `res`, `item`, `obj`, `temp`, `value`, `handler`, `utils`, `helpers`, `manager`, `service`, `processor`, `wrapper`, `common`. Use the domain word instead: `commits`, `callers`, `risk`, `decision`, `snapshotAt`.
- Names that start with `handle`, `process`, `perform`, `execute` or `do` when a plain verb works: `review`, `ingest`, `rank`.
- Class hierarchies and design pattern names in code: no Factory, Builder, Singleton, Strategy, Adapter, Repository, Provider classes, unless the problem truly demands one. Prefer plain functions and plain objects. Use a class only when you need state with identity, such as a long-lived client.
- Barrel files (`index.ts` that only re-exports) in every folder. Import from the file that owns the thing. One entry file per package is enough.
- A `utils.ts` or `helpers.ts` dumping ground. Put a function next to the code that uses it. If two packages need it, give it a specific file name that says what it is.
- try/catch around every call. Catch only where you can do something useful: at a network boundary, at an API route, at a worker loop. Everywhere else let the error travel up.
- Defensive checks for states that cannot happen. Trust your own types and validated input. Validate once at the boundary with zod, then use the typed value.
- Over-typed code: no explicit type annotation where inference is obvious, no enum for two values (use a string union), no type alias that renames a primitive.
- Logging every step. Log only meaningful events: ingestion progress, a failed task, a posted comment. No `console.log` anywhere in committed code. Use the one logger.
- Perfectly symmetrical, repetitive structure across files that makes everything look stamped from a template. Shape each file to what it does.
- Overly long descriptive names (`getAllActiveDecisionsForGivenFunctionIdentifierList`). Use `activeDecisions(fnIds)`.
- Marketing language in UI text or messages: no "seamless", "powerful", "robust", "leverage", "unlock", "cutting-edge". Write what the thing does.
- Emoji anywhere: code, comments, UI, logs, commit messages, docs.
- Placeholder content of any kind in the UI, see section 5.

Positive style to follow:

- Plain functions, early returns, flat code. Avoid nesting beyond three levels.
- `function name() {}` declarations for named functions, arrow functions for inline callbacks.
- `const` by default. No mutation of inputs.
- Async/await, not promise chains.
- Prefer built-in array methods and clear loops. Do not chain six `.map().filter().reduce()` calls into something unreadable.
- Consistent formatting handled by prettier, not by hand.
- Commit messages are lowercase, short, specific: `add blast radius query`, `fix duplicate comment edges on re-ingest`.

Example of the difference. Task: count open PRs that touch a function.

Not acceptable:

```ts
/**
 * Service responsible for retrieving pull request counts.
 */
export class PullRequestCountService {
  private readonly graphClient: GraphClient;
  constructor(graphClient: GraphClient) {
    this.graphClient = graphClient;
  }
  // Fetch the count
  async getOpenPullRequestCountForFunction(functionIdentifier: string): Promise<number> {
    try {
      const result = await this.graphClient.query(/* ... */);
      return result.data?.[0]?.count ?? 0;
    } catch (error) {
      console.log(error);
      return 0;
    }
  }
}
```

Acceptable:

```ts
export async function openPrCount(graph: string, fn: string) {
  const rows = await query(graph, queries.openPrCount, { fn });
  return rows[0].count as number;
}
```

If the query fails the error travels up to the API route, which reports it. Returning 0 on failure would be a lie about the data.

## 4. File and project conventions

- TypeScript strict mode. No `any`. If a library forces it, cast at that one spot with the narrowest type.
- File names are lowercase with dashes: `blast-radius.ts`, `path-graph.tsx`.
- One responsibility per file. The file name says it.
- Keep Cypher in `.cypher` files in `packages/graph/cypher/`, loaded once. Always pass parameters. Never build a query by string concatenation with user input. Whitelisted integers for hop counts are the only interpolation allowed.
- React: function components, hooks, server components by default in Next.js, client components only where interaction needs them. State stays as local as possible. No global store unless two distant components truly share state.
- Styling with Tailwind classes. No inline style objects unless a value is computed at runtime (graph node positions).
- Imports sorted by prettier plugin. No unused imports.

## 5. Zero dummy data

Nothing in this project may be fake, sample, mocked, canned or placeholder. Not in the app, not in tests, not in the demo.

Forbidden everywhere:

- Hardcoded arrays or objects pretending to be repos, PRs, people, functions, decisions, incidents, scores or chat messages.
- Libraries such as faker, or any random data generator used to invent records.
- Mock servers, mock graph clients, in-memory fake databases, or stubs that return canned responses. If code talks to FalkorDB, GitHub or an LLM, the real thing is on the other end, in tests too.
- Lorem ipsum, "John Doe", "example.com", "foo", "bar", "test123", "sample repo", fake avatars, fake timestamps, fake percentages, fake counts.
- UI numbers that are typed in by hand. Every number on a screen comes from a query or a computation over real data.
- Fallback values that hide failure. If the database is down or the LLM call failed, show the error state. Do not show invented content to make the screen look full.
- Seed scripts that insert invented rows. Seeding means ingesting a real repository.
- Features that look finished but are not wired to real logic. If a feature is not built, it is not in the UI.

Where real data comes from:

- The graph is built only by ingesting real public GitHub repositories through the real GitHub API. Responses are cached under `data/snapshots/` as real payloads exactly as GitHub returned them. Those cached files are real data, so tests and the demo can run offline from them without breaking this rule. Never edit a cached file by hand.
- LLM outputs come from real calls. Recorded real responses may be cached on disk keyed by input hash for cost and repeatability. A cache file is only ever written by the code that made the real call.
- Memory graphs contain only interactions that actually happened through the MCP server, the API or the UI.
- Webhook handling is tested with real payloads captured from GitHub deliveries (GitHub keeps recent deliveries that can be redelivered and copied).

Empty states are real too. If a repo has no decisions yet, the page says that no decisions have been extracted and shows the ingestion status. It does not show example decisions.

When something cannot be done for real in the time available, say so in `docs/PROGRESS.md` and leave the feature out. An honest smaller product is better than a convincing fake.

## 6. Testing

Everything that is built is tested, and tests run against the real system. Use vitest for unit and integration tests and Playwright for one end to end flow.

Setup rules:

- A real FalkorDB container (docker compose) is required to run tests. Tests use their own graph names such as `test:<suite>` and delete only those graphs afterwards.
- The test corpus is a real small public repository. Choose one with 100 to 300 commits, PRs with real review comments, and at least one real revert. Ingest it once into `test:corpus` from cached real GitHub payloads. Suites read from that graph. Record the repo name in `tests/CORPUS.md` in one line.
- Expected values in tests are never typed in by guesswork. They come from an independent source of truth:
  - Commit, author and file counts: compare against `git log` run on a real local clone of the same repo.
  - PR and comment counts: compare against the cached GitHub payload for the same repo.
  - Function boundaries and call edges: compare against a direct re-parse of the source file in the test, and spot check specific functions by reading the file.
  - Query results: recompute the answer with a different method (for example plain TypeScript over the cached payload) and compare.
- Boundary tests of pure formulas (risk bands at 29, 30, 59, 60) may use literal numbers because they test the formula itself, not data. No invented entities, names or records anywhere.

What must be tested:

1. Ingestion: node and edge counts equal the git and GitHub oracle. Running ingestion twice leaves counts unchanged (idempotency). Timestamps are present on all temporal edges.
2. Function parsing and call graph: known functions found with the right line ranges, known caller pairs present, confidence values within the defined bands.
3. Incident detection: the real revert in the corpus produces an Incident linked to the right PR. A PR with no revert produces none.
4. Decision extraction: real LLM call on real review threads from the corpus. Assert structure with the zod schema, that every Decision has a real source comment id that exists in the graph, that confidence is at or above the threshold, and that bot comments never produce decisions. Use the disk cache so reruns are cheap.
5. Every named query: runs against `test:corpus`, result checked against the independent recomputation described above, with a case that returns rows and a case that correctly returns nothing.
6. Risk scoring: components computed from the real graph for real PRs, bands boundary tests, overrides.
7. As-of snapshots and leakage: for real PRs in the corpus, assert no node or edge in the snapshot has a timestamp after the cutoff, and that a Decision whose source comment is later than the cutoff is absent.
8. Reviewer end to end: run on a real PR from the corpus, assert the result matches the schema, every path node exists in the graph, every claim cites a real node id.
9. API routes: call the running Next.js server over HTTP with real requests. Check status codes, zod validation errors for bad input, and response shapes.
10. MCP server: start the real server process, connect with the real MCP SDK client, list tools, call each tool, assert results and that a memory episode is written to `mem:<login>`.
11. Webhook: signature verification accepts a real captured payload with the correct secret and rejects a wrong signature. Dry-run mode returns the comment text without posting.
12. Shared state graph: two real worker processes claim tasks concurrently and no task is claimed twice.
13. UI: one Playwright flow on the real running app: open a real PR page, check the risk number equals the API value, press play on the path, check the last node is visible, click the source node and check the displayed text equals the real comment body.
14. Evaluation harness: runs on a small real set and produces a results file that matches the schema. Its numbers are never edited by hand.

Test rules:

- No mocks, no stubs, no spies replacing real behavior. No `.skip`, no `.only`, no tests marked todo.
- No test depends on another test's side effects except the single corpus ingestion in global setup.
- A test that cannot fail is useless. Each assertion must be able to catch a real bug. Prefer exact equality against an oracle over "is defined" or "length greater than zero".
- Every bug fixed gets a regression test written first, shown failing, then fixed.
- Tests are short and read plainly. No giant setup helpers. No comments narrating steps.
- Scripts: `pnpm test` runs unit and integration. `pnpm test:e2e` runs Playwright. `pnpm test:all` runs both. `pnpm check` runs typecheck, lint, audit and `test:all`.

## 7. Verifying work before saying it is done

For every piece of work, do all of these before reporting it complete:

1. Run the code for real: start the services, hit the endpoint or open the page, and look at the actual output.
2. Run `pnpm check`. It must pass with zero warnings you introduced.
3. Run the audit script (below).
4. Report in `docs/PROGRESS.md` with the exact commands run and their real outcomes. Never write that something works unless it was run.
5. If something fails, say what failed. Do not hide it, do not patch the test to pass, do not weaken an assertion.

## 8. Audit script

Create `scripts/audit-code.ts` and wire it as `pnpm audit:code`. It scans `apps/` and `packages/` source files (not `node_modules`, not cached snapshots) and exits non-zero if it finds any of these:

- `console.log` or `console.debug`
- `/**` or `/*` block comments, in ts, tsx and cypher files
- `TODO`, `FIXME`, `HACK`, `XXX`
- the words `faker`, `mock`, `dummy`, `lorem`, `fixture`, `stub`, `sample data`, `fake`, `placeholder data`
- `jest.fn`, `vi.fn`, `vi.mock`, `vi.spyOn`, `jest.mock`
- `.skip(`, `.only(`, `it.todo`, `test.todo`
- any emoji, using a unicode emoji range regex
- `: any` and `as any` and `<any>`
- two or more consecutive lines starting with `//` (a multi-line comment written as many single lines)
- files over 300 lines, functions over 60 lines (warning level, shows the list)

The HTML `placeholder` attribute on input elements is allowed when it contains a real hint, such as the format of a repo name. Review such hits manually and keep the rule narrow.

The audit must pass before every commit that claims a phase is done.

## 9. Order of work for any task

1. Read the relevant part of BRAIN.md.
2. Find what already exists in the repo and in installed packages.
3. Write the test against real data and the independent oracle.
4. Write the smallest implementation that passes.
5. Run it for real and look at the output.
6. Run `pnpm check` and the audit.
7. Commit with a short plain message.

## 10. Quick reminder card

- Small code, small files, small functions.
- No block comments, almost no comments at all.
- Plain names from the domain, no generic names, no pattern names.
- No try/catch unless it does something useful.
- No dummy, mock, fake or sample data, ever. Real repo, real graph, real LLM, real HTTP.
- Tests compare against an independent truth, not against what the code already returns.
- If it was not run, it is not done.
