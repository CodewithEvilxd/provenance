import { existsSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { closeGraphClient } = await import("@provenance/graph/client");
const { createReasoningServer } = await import("./tools.js");
const server = createReasoningServer();
const transport = new StdioServerTransport();
transport.onclose = () => void closeGraphClient();
await server.connect(transport);
