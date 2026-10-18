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
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues
            : error instanceof Error
              ? error.message
              : "Ask failed",
      },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
