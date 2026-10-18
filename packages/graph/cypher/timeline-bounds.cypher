// Timeline bounds: returns earliest and latest timestamps in repository graph
MATCH (c:Commit)
WITH min(c.committed_at_ms) AS minCommitMs, max(c.committed_at_ms) AS maxCommitMs
OPTIONAL MATCH (d:Decision)
WITH minCommitMs, maxCommitMs, min(d.decided_at) AS minDecisionAt, max(d.decided_at) AS maxDecisionAt
RETURN minCommitMs, maxCommitMs, minDecisionAt, maxDecisionAt
