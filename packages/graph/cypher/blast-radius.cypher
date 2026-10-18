// Blast radius: $fn, $minConf; returns caller id, name, path, hops, confidence
MATCH p = (changed:Function {id: $fn})<-[:CALLS*1..3]-(caller:Function)
WHERE all(edge IN relationships(p) WHERE edge.confidence >= $minConf)
  AND caller.valid_to IS NULL
WITH caller, length(p) AS hops,
     reduce(confidence = 1.0, edge IN relationships(p) | confidence * edge.confidence) AS pathConfidence
RETURN caller.id AS id, caller.qualified_name AS name, caller.path AS path,
       hops, pathConfidence AS path_confidence
ORDER BY hops ASC, path_confidence DESC
LIMIT 200
