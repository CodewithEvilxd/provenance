// Resolve real Function and File targets from ids, paths or qualified names
MATCH (target)
WHERE target.id IN $targets OR target.path IN $targets
   OR (target:Function AND target.qualified_name IN $targets)
OPTIONAL MATCH (target)<-[:IN]-(function:Function)
WITH target, collect(DISTINCT function.id) AS containedFunctions
RETURN target.id AS id, labels(target)[0] AS label,
       coalesce(target.path, target.qualified_name) AS path,
       CASE WHEN target:Function THEN [target.id] ELSE containedFunctions END AS functionIds
LIMIT 21
