// Reviewer rank: $fns, $excludeLogin, $now, $halfLifeDays; returns reviewers by recent authored and reviewed activity
MATCH (fn:Function) WHERE fn.id IN $fns
MATCH (fn)<-[:MODIFIED]-(commit:Commit)<-[:AUTHORED]-(person:Person)
WHERE person.login <> $excludeLogin
WITH person, sum(0.5 ^ (($now - commit.committed_at_ms) / ($halfLifeDays * 86400000.0))) AS authored
OPTIONAL MATCH (reviewedPull:PR)-[:CONTAINS]->(:Commit)-[:MODIFIED]->(reviewedFn:Function)
WHERE reviewedFn.id IN $fns
OPTIONAL MATCH (person)-[:REVIEWED]->(reviewedPull)
WITH person, authored, count(DISTINCT reviewedPull) * 0.5 AS reviewed
RETURN person.login AS login, authored + reviewed AS score
ORDER BY score DESC
LIMIT 10
