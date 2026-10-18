import { createSchema } from "../packages/graph/src/schema.js";
import { closeGraphClient } from "../packages/graph/src/client.js";

const argumentsList = process.argv.slice(2);
const repository =
  (argumentsList[0] === "--" ? argumentsList[1] : argumentsList[0]) ??
  process.env.DEMO_REPO ??
  "unjs/ufo";
await createSchema(`repo:${repository}`);
await closeGraphClient();
process.stdout.write(`Schema ready for repo:${repository}\n`);
