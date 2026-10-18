// Verify displayed path node ids exist in the selected graph
UNWIND $ids AS id
MATCH (node {id: id})
RETURN node.id AS id
