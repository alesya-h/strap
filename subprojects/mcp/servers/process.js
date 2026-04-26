#!/usr/bin/env node
import { startMcpServer } from "#strap/mcp/stdio";
startMcpServer({ name: "strap-process", group: "process" });
