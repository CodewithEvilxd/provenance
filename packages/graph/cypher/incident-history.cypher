// Incident history: $fns; returns incidents linked to modified functions
MATCH (fn:Function) WHERE fn.id IN $fns
MATCH (fn)<-[:MODIFIED]-(commit:Commit)<-[:CONTAINS]-(pull:PR)<-[:CAUSED_BY]-(incident:Incident)
RETURN fn.id AS fn, incident.id AS incident, incident.title AS title,
       incident.kind AS kind, incident.detected_at AS at, pull.number AS pr
UNION
MATCH (fn:Function) WHERE fn.id IN $fns
MATCH (fn)<-[:MODIFIED]-(commit:Commit)<-[:RESOLVED_BY]-(incident:Incident)
RETURN fn.id AS fn, incident.id AS incident, incident.title AS title,
       incident.kind AS kind, incident.detected_at AS at, null AS pr
ORDER BY at DESC
