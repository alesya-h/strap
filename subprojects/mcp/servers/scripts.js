#!/usr/bin/env node
import { startMcpServer } from "#strap/mcp/stdio";
startMcpServer({ name: "strap-scripts", group: "scripts" });
