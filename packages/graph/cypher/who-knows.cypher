// Who knows: $fn, $now, $halfLifeDays; returns recency-weighted author activity
MATCH (fn:Function {id: $fn})<-[:MODIFIED]-(commit:Commit)<-[:AUTHORED]-(person:Person)
WITH person, commit, $now AS now
WITH person,
     sum(0.5 ^ ((now - commit.committed_at_ms) / ($halfLifeDays * 86400000.0))) AS score,
     count(commit) AS commits
RETURN person.login AS login, score, commits
ORDER BY score DESC
LIMIT 5
