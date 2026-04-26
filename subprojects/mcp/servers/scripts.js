#!/usr/bin/env node
import { startMcpServer } from "../../../src/mcp-stdio.js";
startMcpServer({ name: "strap-scripts", group: "scripts" });
