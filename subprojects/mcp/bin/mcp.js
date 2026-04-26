#!/usr/bin/env node
import { startMcpServer } from "#strap/mcp/stdio";

const group = process.argv[2] || "all";
startMcpServer({ name: `strap-${group}`, group });
