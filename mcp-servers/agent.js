#!/usr/bin/env node
import { startMcpServer } from "../src/mcp-stdio.js";
startMcpServer({ name: "strap-agent-tools", group: "agent" });
