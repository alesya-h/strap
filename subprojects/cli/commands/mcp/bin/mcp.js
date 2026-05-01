#!/usr/bin/env node
import { startMcpServer } from "../src/stdio.js";

const group = process.argv[2] || "all";
startMcpServer({ name: `strap-${group}`, group });
