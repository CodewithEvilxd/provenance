// Active decisions: $fns, $files; returns decisions, targets and evidence ids
MATCH (decision:Decision {status: 'active'})-[constraint:CONSTRAINS]->(target)
WHERE (target:Function AND target.id IN $fns) OR (target:File AND target.path IN $files)
MATCH (decision)-[:DERIVED_FROM]->(source)
WITH decision, target, constraint.strength AS strength, collect(source.id) AS sources,
     decision.decided_at AS decidedAt
RETURN decision.id AS id, decision.summary AS summary, decision.reason AS reason,
       strength, decision.confidence AS confidence,
       target.id AS target, sources, decidedAt
ORDER BY decidedAt DESC
