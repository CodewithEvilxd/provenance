// Return observed Decision supersession links
MATCH (newer:Decision)-[:SUPERSEDES]->(older:Decision)
RETURN newer.id AS newer, older.id AS older
ORDER BY newer.id
LIMIT 100
