// As-of nodes: $asOf, $asOfMs, $limit; returns nodes created on or before cutoff
MATCH (node)
WHERE (node:Commit AND node.committed_at_ms <= $asOfMs)
   OR (node:PR AND node.created_at <= $asOf)
   OR (node:Issue AND node.created_at <= $asOf)
   OR (node:Comment AND node.created_at <= $asOf)
   OR (node:Decision AND node.decided_at <= $asOf)
   OR (node:Incident AND node.detected_at <= $asOf)
   OR (node:Person AND node.first_seen <= $asOf)
   OR (node:File AND node.first_seen <= $asOf)
   OR (node:Function AND node.valid_from IS NOT NULL AND node.valid_from <= $asOf)
RETURN labels(node)[0] AS label, node.id AS id,
       coalesce(node.summary, node.title, node.name, node.path, node.login, node.message, node.id) AS text,
       coalesce(node.committed_at, node.created_at, node.decided_at, node.detected_at, node.first_seen, node.valid_from) AS timestamp
ORDER BY timestamp DESC
LIMIT $limit
