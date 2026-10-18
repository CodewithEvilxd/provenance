// Evidence paths: $fn; returns connected decision, incident and blast paths
MATCH (fn:Function {id: $fn})<-[constraint:CONSTRAINS]-(decision:Decision)-[evidence:DERIVED_FROM]->(source:Comment)
RETURN 'decision' AS kind,
       [{id: fn.id, label: 'Function', text: fn.qualified_name},
        {id: decision.id, label: 'Decision', text: decision.summary},
        {id: source.id, label: 'Comment', text: source.body}] AS nodes,
       [[startNode(constraint).id, endNode(constraint).id, type(constraint)],
        [startNode(evidence).id, endNode(evidence).id, type(evidence)]] AS edges
UNION
MATCH (fn:Function {id: $fn})-[membership:IN]->(file:File)<-[constraint:CONSTRAINS]-(decision:Decision)-[evidence:DERIVED_FROM]->(source:Comment)
RETURN 'decision' AS kind,
       [{id: fn.id, label: 'Function', text: fn.qualified_name},
        {id: file.id, label: 'File', text: file.path},
        {id: decision.id, label: 'Decision', text: decision.summary},
        {id: source.id, label: 'Comment', text: source.body}] AS nodes,
       [[startNode(membership).id, endNode(membership).id, type(membership)],
        [startNode(constraint).id, endNode(constraint).id, type(constraint)],
        [startNode(evidence).id, endNode(evidence).id, type(evidence)]] AS edges
UNION
MATCH p = (fn:Function {id: $fn})<-[:MODIFIED]-(commit:Commit)<-[:CONTAINS]-(pull:PR)<-[:CAUSED_BY]-(incident:Incident)
RETURN 'incident' AS kind,
       [node IN nodes(p) | {id: node.id, label: labels(node)[0],
         text: coalesce(node.qualified_name, node.message, node.title)}] AS nodes,
       [edge IN relationships(p) | [startNode(edge).id, endNode(edge).id, type(edge)]] AS edges
UNION
MATCH p = (fn:Function {id: $fn})<-[:MODIFIED]-(commit:Commit)<-[:RESOLVED_BY]-(incident:Incident)
RETURN 'incident' AS kind,
       [node IN nodes(p) | {id: node.id, label: labels(node)[0],
         text: coalesce(node.qualified_name, node.message, node.title)}] AS nodes,
       [edge IN relationships(p) | [startNode(edge).id, endNode(edge).id, type(edge)]] AS edges
UNION
MATCH p = (fn:Function {id: $fn})<-[:CALLS*1..3]-(caller:Function)
RETURN 'blast' AS kind,
       [node IN nodes(p) | {id: node.id, label: labels(node)[0], text: node.qualified_name}] AS nodes,
       [edge IN relationships(p) | [startNode(edge).id, endNode(edge).id, type(edge)]] AS edges
