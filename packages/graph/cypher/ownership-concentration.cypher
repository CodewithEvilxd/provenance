// Ownership concentration: $since; returns commit share by path and contributor
MATCH (file:File)<-[:MODIFIED]-(commit:Commit)<-[:AUTHORED]-(person:Person)
WHERE commit.committed_at_ms >= $since
WITH file.path AS path, person.login AS login, count(DISTINCT commit) AS commits
RETURN path, login, commits
ORDER BY path ASC, commits DESC
