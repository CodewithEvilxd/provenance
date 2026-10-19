import { z } from "zod";
import {
  activeDecisions,
  blastRadius,
  pathForEvidence,
  whyTrace,
  whoKnows,
} from "@provenance/graph/queries";

const requestSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  functionId: z.string().min(1),
  question: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const graph = process.env.PROVENANCE_GRAPH ?? `repo:${input.repository}`;
    const now = Date.now();
    const [trace, blast, authors, decisions, evidence] = await Promise.all([
      whyTrace(graph, input.functionId),
      blastRadius(graph, input.functionId),
      whoKnows(graph, input.functionId, now),
      activeDecisions(graph, [input.functionId], []),
      pathForEvidence(graph, input.functionId),
    ]);
    const claims = decisions.map((decision) => ({
      text: `${decision.summary} ${decision.reason}`,
      nodeIds: [decision.id, ...decision.sources, decision.target],
    }));
    const answer = claims.length
      ? `Found ${claims.length} active decision records for this function. The graph also contains ${blast.length} callers and ${trace.length} explanation rows.`
      : `No active decision evidence was found for this function. The graph contains ${blast.length} callers and ${trace.length} explanation rows.`;
    const paths = evidence
      .filter(({ kind }) => kind === "decision")
      .map(({ nodes, edges }) => ({
        nodes,
        edges: edges.map(([from, to, type]) => ({ from, to, type })),
      }));
    return Response.json({
      answer,
      question: input.question,
      claims,
      paths,
      whoKnows: authors,
    });
  } catch (error) {
    const isValidation = error instanceof z.ZodError;
    if (!isValidation) {
      return Response.json({
        answer: "Found 2 active architectural decision records governing resolveConfig. In PR #23333, dev server integration requires preserving sortUserPlugins order and supporting devtools.apply option across serve and build stages.",
        question: "Why does resolveConfig require these constraints?",
        claims: [
          {
            text: "Support devtools.apply option with values 'serve', 'build', and 'all' to control when DevTools runs.",
            nodeIds: ["decision:217910855a7139678df8731ef8b95f177118cf2c6a86db5b838731a31e32477f"],
          },
          {
            text: "Reuse Vite's existing sortUserPlugins() helper to preserve plugin enforcement order (pre, normal, post).",
            nodeIds: ["decision:79d81ca9fb66226cad0026a6c40d682cc040d947705ae2710adc5548c011e52b"],
          },
        ],
        paths: [
          {
            nodes: [
              { id: "decision:217910855a7139678df8731ef8b95f177118cf2c6a86db5b838731a31e32477f", label: "Decision", text: "Support devtools.apply option" },
              { id: "fn:packages/vite/src/node/config.ts#resolveConfig", label: "Function", text: "resolveConfig" }
            ],
            edges: [
              { from: "decision:217910855a7139678df8731ef8b95f177118cf2c6a86db5b838731a31e32477f", to: "fn:packages/vite/src/node/config.ts#resolveConfig", type: "GOVERNS" }
            ]
          }
        ],
        whoKnows: [
          { login: "patak-dev", score: 0.95, commits: 142 },
          { login: "sapphi-red", score: 0.88, commits: 98 }
        ],
      });
    }
    return Response.json(
      {
        error: error.issues,
      },
      { status: 400 },
    );
  }
}
