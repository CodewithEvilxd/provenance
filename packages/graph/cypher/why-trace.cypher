// Why trace: $fn; returns decisions, source comments, pull requests, authors and superseded decisions
MATCH (fn:Function {id: $fn})<-[:CONSTRAINS]-(decision:Decision)-[:DERIVED_FROM]->(source)
OPTIONAL MATCH (decision)-[:SUPERSEDES]->(older:Decision)
OPTIONAL MATCH (source)-[:ON]->(pull:PR)
OPTIONAL MATCH (author:Person)-[:AUTHORED]->(source)
WITH decision, source, pull, author, older, decision.decided_at AS decidedAt
RETURN decision, source, pull, author, older
ORDER BY decidedAt DESC
