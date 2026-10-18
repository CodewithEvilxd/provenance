// Trace a Decision to its real source, constrained targets, supersession and related PRs
MATCH (decision:Decision {id: $id})-[relation:DERIVED_FROM|CONSTRAINS|SUPERSEDES]->(linked)
RETURN {id: decision.id, label: 'Decision', text: decision.summary, url: null} AS fromNode,
       {id: linked.id, label: labels(linked)[0],
        text: coalesce(linked.body, linked.message, linked.title, linked.path, linked.qualified_name, linked.summary),
        url: coalesce(linked.html_url, linked.url), path: linked.path,
        strength: relation.strength} AS toNode,
       type(relation) AS relation
UNION
MATCH (decision:Decision {id: $id})-[:DERIVED_FROM]->(source)-[relation:ON]->(pull:PR)
RETURN {id: source.id, label: labels(source)[0], text: coalesce(source.body, source.message),
        url: coalesce(source.html_url, source.url)} AS fromNode,
       {id: pull.id, label: 'PR', text: pull.title, url: coalesce(pull.html_url, pull.url)} AS toNode,
       type(relation) AS relation
UNION
MATCH (decision:Decision {id: $id})-[:DERIVED_FROM]->(source)-[:ON]->(pull:PR)-[relation:CONTAINS]->(commit:Commit)
RETURN {id: pull.id, label: 'PR', text: pull.title, url: coalesce(pull.html_url, pull.url)} AS fromNode,
       {id: commit.id, label: 'Commit', text: commit.message, url: coalesce(commit.html_url, commit.url)} AS toNode,
       type(relation) AS relation
UNION
MATCH (decision:Decision {id: $id})-[:CONSTRAINS]->(target)<-[relation:MODIFIED]-(commit:Commit)
RETURN {id: commit.id, label: 'Commit', text: commit.message, url: coalesce(commit.html_url, commit.url)} AS fromNode,
       {id: target.id, label: labels(target)[0],
        text: coalesce(target.path, target.qualified_name), url: null, path: target.path} AS toNode,
       type(relation) AS relation
UNION
MATCH (newer:Decision)-[relation:SUPERSEDES]->(decision:Decision {id: $id})
RETURN {id: newer.id, label: 'Decision', text: newer.summary, url: null} AS fromNode,
       {id: decision.id, label: 'Decision', text: decision.summary, url: null} AS toNode,
       type(relation) AS relation
LIMIT $limit
