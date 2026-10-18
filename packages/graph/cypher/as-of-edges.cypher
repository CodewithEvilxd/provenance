// As-of edges: $nodeIds, $asOf, $limit; returns edges connecting selected nodes valid at cutoff
MATCH (a)-[edge]->(b)
WHERE a.id IN $nodeIds AND b.id IN $nodeIds
  AND (edge.valid_from IS NULL OR edge.valid_from <= $asOf)
  AND (edge.valid_to IS NULL OR edge.valid_to > $asOf)
RETURN startNode(edge).id AS from, endNode(edge).id AS to, type(edge) AS type
LIMIT $limit
