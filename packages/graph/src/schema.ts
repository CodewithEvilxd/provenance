import { graphStep, selectGraph } from "./client.js";

type GraphIndex = {
  label: string;
  properties: string[];
  entitytype: "NODE" | "RELATIONSHIP";
  types: Record<string, string[]>;
};

const nodeTimes: Record<string, string[]> = {
  Person: ["first_seen", "last_seen"],
  Commit: ["committed_at_ms"],
  PR: ["created_at", "merged_at", "closed_at"],
  Issue: ["created_at", "closed_at"],
  Comment: ["created_at"],
  File: ["first_seen", "last_seen"],
  Function: ["valid_from", "valid_to"],
  Decision: ["decided_at"],
  Incident: ["detected_at"],
};

const relationships = [
  "AUTHORED",
  "REVIEWED",
  "CONTAINS",
  "MODIFIED",
  "IN",
  "CALLS",
  "ON",
  "FIXES",
  "REVERTS",
  "MENTIONS",
  "DERIVED_FROM",
  "CONSTRAINS",
  "SUPERSEDES",
  "CAUSED_BY",
  "REPORTED_IN",
  "RESOLVED_BY",
];

function indexed(
  indexes: GraphIndex[],
  entitytype: GraphIndex["entitytype"],
  label: string,
  property: string,
  type: string,
) {
  return indexes.some(
    (index) =>
      index.entitytype === entitytype &&
      index.label === label &&
      index.properties.includes(property) &&
      index.types[property]?.includes(type),
  );
}

export async function createSchema(
  graphName: string,
  embeddingDimension = 384,
) {
  const graph = await graphStep("select graph for schema", () =>
    selectGraph(graphName),
  );
  const indexes = await graphStep("read graph indexes", () =>
    graph.query<GraphIndex>("CALL db.indexes()"),
  );
  for (const label of Object.keys(nodeTimes)) {
    if (!indexed(indexes.data ?? [], "NODE", label, "id", "RANGE")) {
      await graphStep(`create ${label} id index`, () =>
        graph.createNodeRangeIndex(label, "id"),
      );
    }
    for (const property of nodeTimes[label] ?? []) {
      if (!indexed(indexes.data ?? [], "NODE", label, property, "RANGE")) {
        await graphStep(`create ${label} ${property} index`, () =>
          graph.createNodeRangeIndex(label, property),
        );
      }
    }
  }
  for (const relationship of relationships) {
    for (const property of ["valid_from", "valid_to"]) {
      if (
        !indexed(
          indexes.data ?? [],
          "RELATIONSHIP",
          relationship,
          property,
          "RANGE",
        )
      ) {
        await graphStep(`create ${relationship} ${property} index`, () =>
          graph.createEdgeRangeIndex(relationship, property),
        );
      }
    }
  }
  if (!indexed(indexes.data ?? [], "NODE", "Decision", "embedding", "VECTOR")) {
    await graphStep("create Decision embedding vector index", () =>
      graph.createNodeVectorIndex(
        "Decision",
        embeddingDimension,
        "cosine",
        "embedding",
      ),
    );
  }
}
