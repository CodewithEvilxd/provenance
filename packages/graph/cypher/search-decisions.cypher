// Search active decisions semantically and return graph-backed targets and sources
CALL db.idx.vector.queryNodes('Decision', 'embedding', 40, vecf32($embedding)) YIELD node, score
MATCH (node)-[constraint:CONSTRAINS]->(target)
MATCH (node)-[:DERIVED_FROM]->(source)
WHERE node.status = 'active'
  AND ($path IS NULL OR target.id = $path OR target.path = $path)
WITH node, score, target, constraint, source
ORDER BY score DESC
WITH node, score,
     collect(DISTINCT {id: target.id, path: target.path, label: labels(target)[0], strength: constraint.strength}) AS targets,
     collect(DISTINCT {id: source.id, label: labels(source)[0], text: coalesce(source.body, source.message, source.title), url: coalesce(source.html_url, source.url)}) AS sources
RETURN node.id AS id, node.summary AS summary, node.reason AS reason,
       node.confidence AS confidence, score, targets, sources
ORDER BY score DESC
LIMIT $limit
