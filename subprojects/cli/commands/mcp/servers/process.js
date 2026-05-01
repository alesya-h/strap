#!/usr/bin/env node
import { startMcpServer } from "../src/stdio.js";
startMcpServer({ name: "strap-process", group: "process" });
