#!/usr/bin/env node
import { startMcpServer } from "#strap/mcp/stdio";
startMcpServer({ name: "strap-web", group: "web" });
