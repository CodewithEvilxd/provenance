// Count graph labels used by the read-only MCP integration check
MATCH (decision:Decision)
WITH count(decision) AS decisions
MATCH (comment:Comment)
WITH decisions, count(comment) AS comments
MATCH (pull:PR)
WITH decisions, comments, count(pull) AS pulls
MATCH (file:File)
WITH decisions, comments, pulls, count(file) AS files
MATCH (function:Function)
WITH decisions, comments, pulls, files, count(function) AS functions
MATCH (incident:Incident)
RETURN decisions, comments, pulls, files, functions, count(incident) AS incidents
