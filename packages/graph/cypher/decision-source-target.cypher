// Find an active Decision for saved source ids and return its real File target
MATCH (decision:Decision {status: 'active'})-[:DERIVED_FROM]->(source:Comment)
WHERE source.id IN $sourceIds
MATCH (decision)-[:CONSTRAINS]->(target:File)
RETURN decision.id AS id, decision.summary AS summary, target.path AS path,
       target.id AS target, source.id AS source, source.url AS url
ORDER BY decision.id
LIMIT 1
