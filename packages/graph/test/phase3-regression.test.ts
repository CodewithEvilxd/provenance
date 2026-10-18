import { afterAll, expect, it } from "vitest";
import { closeGraphClient, query } from "../src/client.js";
import {
  graphCounts,
  pathForEvidence,
  verifyPathEdges,
  verifyPathNodes,
} from "../src/queries.js";
import { cached, octokit, type Issue } from "../../ingest/src/github.js";
import { pullDetail } from "../../ingest/src/github-discussions.js";
import { POST } from "../../../apps/web/app/api/review/route.js";

const graph = "repo:vitejs/vite";
const functionId = "fn:packages/vite/src/node/config.ts#resolveConfig";
const incidentId = "incident:regression:issue:23197";

it("rejects malformed review requests before provider routing", async () => {
  const response = await POST(
    new Request("http://localhost/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: "vitejs/vite", pr: 0 }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty("error");
});

it("traces the real Vite regression to its source issue, causing PR, decisions, and comments", async () => {
  const [before, issue, cause, fix, paths] = await Promise.all([
    graphCounts(graph),
    cached(
      "vitejs",
      "vite",
      "issue:23197:detail",
      async () =>
        (
          await octokit.issues.get({
            owner: "vitejs",
            repo: "vite",
            issue_number: 23197,
          })
        ).data,
    ),
    pullDetail("vitejs", "vite", 22832),
    pullDetail("vitejs", "vite", 23198),
    pathForEvidence(graph, functionId),
  ]);
  const sourceIssue = issue as Issue;
  expect(sourceIssue.labels.map(({ name }) => name)).toContain("regression");
  expect(sourceIssue.body).toMatch(
    /introduced in `v8\.2\.0-beta\.0` by PR #22832/i,
  );
  expect(cause.html_url).toBe("https://github.com/vitejs/vite/pull/22832");
  expect(fix.body).toMatch(/#22832 made `resolveConfig`/);
  expect(fix.body).toMatch(/fixes #23197/i);
  const incidentPath = paths.find(
    ({ kind, nodes }) =>
      kind === "incident" && nodes.some(({ id }) => id === incidentId),
  );
  const decisionPath = paths.find(
    ({ kind, nodes }) =>
      kind === "decision" &&
      nodes.some(({ label }) => label === "Decision") &&
      nodes.some(({ label }) => label === "Comment"),
  );
  await verifyEvidencePaths(incidentPath, decisionPath);
  expect(await graphCounts(graph)).toEqual(before);
});

async function verifyEvidencePaths(
  incidentPath: Awaited<ReturnType<typeof pathForEvidence>>[number] | undefined,
  decisionPath: Awaited<ReturnType<typeof pathForEvidence>>[number] | undefined,
) {
  expect(incidentPath).toBeDefined();
  expect(incidentPath!.nodes.some(({ id }) => id === "pr:22832")).toBe(true);
  expect(decisionPath).toBeDefined();
  expect(decisionPath!.nodes.some(({ id }) => id === functionId)).toBe(true);
  for (const path of [incidentPath!, decisionPath!]) {
    const nodeIds = path.nodes.map(({ id }) => id);
    expect((await verifyPathNodes(graph, nodeIds)).map(({ id }) => id)).toEqual(
      expect.arrayContaining(nodeIds),
    );
    const edges = path.edges.map(([from, to, type]) => ({ from, to, type }));
    expect(
      (await verifyPathEdges(graph, edges)).every(({ count }) => count > 0),
    ).toBe(true);
  }
  await verifyCommentSources(decisionPath!.nodes);
}

async function verifyCommentSources(nodes: { id: string; label: string }[]) {
  for (const comment of nodes.filter(({ label }) => label === "Comment")) {
    const [source] = await query<{ url: string; body: string }>(
      graph,
      "MATCH (comment:Comment {id: $id}) RETURN comment.url AS url, comment.body AS body",
      { id: comment.id },
    );
    expect(JSON.stringify(source?.url)).toContain(
      "github.com/vitejs/vite/pull/",
    );
    expect(source?.body.length).toBeGreaterThan(0);
  }
}

afterAll(closeGraphClient);
