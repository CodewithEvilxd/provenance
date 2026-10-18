// Timeline milestones: returns notable chronological events for scrubber snapping
MATCH (d:Decision)
RETURN 'decision' AS kind, d.id AS id, d.summary AS text, d.decided_at AS timestamp
UNION
MATCH (i:Incident)
RETURN 'incident' AS kind, i.id AS id, i.title AS text, i.detected_at AS timestamp
UNION
MATCH (p:PR)
RETURN 'pr' AS kind, p.id AS id, p.title AS text, p.created_at AS timestamp
ORDER BY timestamp ASC
LIMIT 100
