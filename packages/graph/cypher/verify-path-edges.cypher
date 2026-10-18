// Verify displayed path edges exist in the selected graph
UNWIND $edges AS edge
OPTIONAL MATCH (source)-[relationship]->(target)
WHERE source.id = edge.from AND target.id = edge.to AND type(relationship) = edge.type
RETURN edge.from AS from, edge.to AS to, edge.type AS type,
       count(relationship) AS count
