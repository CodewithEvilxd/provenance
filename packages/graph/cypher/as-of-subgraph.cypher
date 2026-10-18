// As-of subgraph: $asOf and $asOfMs; returns nodes whose source timestamps are no later than cutoff
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
RETURN labels(node) AS labels, node.id AS id
