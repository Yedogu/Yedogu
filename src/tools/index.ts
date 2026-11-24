import type { ToolSchema } from "../providers/client.js";
import type { AgentDefinition, FindingSeverity, SessionData } from "../types.js";
import { executeHttpForge } from "./httpForge.js";
import { runJsRecon } from "./jsRecon.js";
import { runBinaryTriage } from "./binaryTriage.js";
import { createFinding, exportFindingsReport } from "./findings.js";
import { fsGlob, fsGrep, fsRead, fsWrite } from "./fsOps.js";
import { executeShell } from "./pty.js";
import type { McpManager } from "./mcpBridge.js";
import type { GlobalConfig } from "../config/store.js";

export interface ToolExecutionContext {
  session: SessionData;
  agent: AgentDefinition;
  config: GlobalConfig;
  mcpManager: McpManager;
  emit: (type: any, payload: unknown) => void;
  persist: () => void;
  runSwarm: (tasks: Array<{ agent: string; objective: string }>) => Promise<string>;
}

export const BUILTIN_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: "pty_exec",
    description:
      "Execute a shell command in the workspace directory (PowerShell on Windows, /bin/sh on POSIX). Use for recon CLIs, PoC execution, git/patch diffing, or scripting.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Exact shell command to run" },
        timeoutMs: { type: "number", description: "Optional timeout in ms (default 60000)" },
      },
      required: ["command"],
    },
  },
  {
    name: "http_forge",
    description:
      "Send a crafted HTTP/HTTPS request through YEDOGU's scope-enforced HTTP Repeater. Automatically logs request/response headers, status, latency, SHA-256 hash, and security headers into the live HTTP History.",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string", description: "HTTP method (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD)" },
        url: { type: "string", description: "Target URL (must satisfy active scope rules)" },
        headers: { type: "object", description: "Optional HTTP headers map", additionalProperties: { type: "string" } },
        body: { type: "string", description: "Optional raw request body" },
        followRedirects: { type: "boolean", description: "Follow HTTP redirects (default true)" },
      },
      required: ["url"],
    },
  },
  {
    name: "js_recon",
    description:
      "Analyze a JavaScript file, webpack bundle, source map, or directory to extract hidden API endpoints, GraphQL operations, WebSockets, dangerous DOM sinks, and hardcoded secrets.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory path to scan (relative to workspace or absolute)" },
      },
      required: ["path"],
    },
  },
  {
    name: "binary_triage",
    description:
      "Perform instant static triage on a native binary or package (PE32/PE32+, ELF, Mach-O, ZIP/APK/IPA, ASAR). Returns SHA-256, architecture, mitigations (ASLR/DEP/CFG/PIE/NX), section entropy, overlays/Bun markers, archive inventory, and interesting strings.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to binary or package file" },
      },
      required: ["path"],
    },
  },
  {
    name: "fs_read",
    description: "Read a text file with line numbers, or list directory contents.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory path" },
        startLine: { type: "number", description: "1-indexed start line (default 1)" },
        endLine: { type: "number", description: "1-indexed end line (default startLine + 300)" },
      },
      required: ["path"],
    },
  },
  {
    name: "fs_write",
    description: "Write a file (e.g., PoC exploit script, fuzzing harness, or exported report) to disk.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Destination path" },
        content: { type: "string", description: "Full file contents" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "fs_grep",
    description: "Search source code recursively with a regex pattern (skips node_modules/.git/dist).",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex or substring to search for" },
        path: { type: "string", description: "Optional subpath to narrow search" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "fs_glob",
    description: "List workspace files matching an optional path substring.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Optional substring filter (e.g. '.sol', 'auth', '.js')" },
      },
    },
  },
  {
    name: "finding_record",
    description:
      "Record a validated security finding into the session Finding & Evidence Ledger with automatic secret redaction and CVSS 3.1 calculation.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Impact-first vulnerability title" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
        cvssVector: { type: "string", description: "CVSS 3.1 vector string e.g. CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N" },
        target: { type: "string", description: "Affected host, endpoint, contract, or binary path" },
        category: { type: "string", description: "Vulnerability class (e.g. IDOR, SSRF, RCE, Auth Bypass, Reentrancy)" },
        summary: { type: "string", description: "Technical root cause & observation" },
        impact: { type: "string", description: "Concrete, proven security impact (no speculation)" },
        reproduction: { type: "string", description: "Deterministic steps / HTTP request / PoC command" },
        remediation: { type: "string", description: "Actionable engineering fix" },
        evidenceIds: { type: "array", items: { type: "string" }, description: "Associated HTTP capture IDs, artifact IDs, or REA evidence IDs" },
      },
      required: ["title", "target", "summary", "impact", "reproduction"],
    },
  },
  {
    name: "finding_list",
    description: "List all recorded findings in the active session ledger.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "finding_report",
    description: "Generate a sanitized Markdown vulnerability report in HackerOne, Bugcrowd, or Enterprise Red-Team format.",
    parameters: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["hackerone", "bugcrowd", "redteam"] },
      },
    },
  },
  {
    name: "swarm_dispatch",
    description:
      "Launch multiple specialist security subagents in parallel (e.g., @recon, @web-hunter, @reverser, @exploit-dev, @cloud-iam, @web3-auditor, @triage-report) and collect all their findings.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          description: "List of parallel subagent assignments",
          items: {
            type: "object",
            properties: {
              agent: { type: "string", description: "Agent ID (recon, web-hunter, reverser, exploit-dev, cloud-iam, web3-auditor, triage-report)" },
              objective: { type: "string", description: "Specific scoped task and expected evidence deliverable" },
            },
            required: ["agent", "objective"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "mcp_call",
    description:
      "Invoke a tool exposed by a connected MCP server (such as REA reverse-engineering tools like open_binary, inspect_pe_resources, analyze_javascript_application, inspect_android_package).",
    parameters: {
      type: "object",
      properties: {
        server: { type: "string", description: "Configured MCP server name (e.g. 'rea')" },
        tool: { type: "string", description: "Exact MCP tool name" },
        arguments: { type: "object", description: "Tool arguments JSON object" },
      },
      required: ["server", "tool"],
    },
  },
];

export function getToolsForAgent(agent: AgentDefinition): ToolSchema[] {
  return BUILTIN_TOOL_SCHEMAS.filter((schema) => {
    const perm = agent.permissions[schema.name];
    return perm !== "deny" && perm !== undefined;
  });
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ output: string; isError: boolean }> {
  const perm = ctx.agent.permissions[name];
  if (!perm || perm === "deny") {
    return {
      output: `Permission denied: agent @${ctx.agent.id} is not permitted to invoke tool "${name}".`,
      isError: true,
    };
  }

  try {
    switch (name) {
      case "pty_exec": {
        const command = String(args.command ?? "").trim();
        if (!command) throw new Error("Missing required parameter: command");
        const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 60000;
        const res = await executeShell(command, ctx.session.workspace, timeoutMs);
        const out = [
          `Exit Code: ${res.exitCode} (${res.durationMs}ms${res.timedOut ? " - TIMED OUT" : ""})`,
          res.stdout ? `STDOUT:\n${res.stdout.slice(0, 16000)}` : "STDOUT: (empty)",
          res.stderr ? `STDERR:\n${res.stderr.slice(0, 8000)}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        return { output: out, isError: res.exitCode !== 0 };
      }

      case "http_forge": {
        const url = String(args.url ?? "").trim();
        if (!url) throw new Error("Missing required parameter: url");
        const { capture, blockedReason } = await executeHttpForge(
          {
            method: typeof args.method === "string" ? args.method : "GET",
            url,
            headers: (args.headers as Record<string, string> | undefined) ?? {},
            body: typeof args.body === "string" ? args.body : undefined,
            followRedirects: typeof args.followRedirects === "boolean" ? args.followRedirects : true,
          },
          ctx.session.scope,
          ctx.agent.id,
        );
        ctx.session.httpHistory.unshift(capture);
        if (ctx.session.httpHistory.length > 200) ctx.session.httpHistory.pop();
        ctx.persist();
        ctx.emit("http.captured", capture);

        if (blockedReason) {
          return { output: `SCOPE GUARD BLOCKED REQUEST (${capture.id}): ${blockedReason}`, isError: true };
        }

        const headerLines = Object.entries(capture.responseHeaders)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");

        return {
          output:
            `HTTP Capture ID: ${capture.id}\n` +
            `${capture.method} ${capture.url} -> ${capture.status} ${capture.statusText} (${capture.durationMs}ms)\n` +
            `Body SHA-256: ${capture.bodySha256}\n` +
            `Missing Security Headers: ${capture.securityHeaders.missing.join(", ") || "none"}\n\n` +
            `Response Headers:\n${headerLines}\n\n` +
            `Response Body (truncated to 10KB):\n${capture.responseBody.slice(0, 10240)}`,
          isError: false,
        };
      }

      case "js_recon": {
        const target = String(args.path ?? ctx.session.workspace);
        const abs = target.startsWith(".") ? `${ctx.session.workspace}/${target}` : target;
        const result = runJsRecon(abs);
        return { output: JSON.stringify(result, null, 2), isError: false };
      }

      case "binary_triage": {
        const target = String(args.path ?? "");
        if (!target) throw new Error("Missing required parameter: path");
        const summary = runBinaryTriage(target);
        ctx.session.artifacts.unshift(summary);
        if (ctx.session.artifacts.length > 50) ctx.session.artifacts.pop();
        ctx.persist();
        ctx.emit("artifact.analyzed", summary);
        return { output: JSON.stringify(summary, null, 2), isError: false };
      }

      case "fs_read": {
        const filePath = String(args.path ?? "");
        const startLine = typeof args.startLine === "number" ? args.startLine : 1;
        const endLine = typeof args.endLine === "number" ? args.endLine : undefined;
        return { output: fsRead(ctx.session.workspace, filePath, startLine, endLine), isError: false };
      }

      case "fs_write": {
        const filePath = String(args.path ?? "");
        const content = String(args.content ?? "");
        return { output: fsWrite(ctx.session.workspace, filePath, content), isError: false };
      }

      case "fs_grep": {
        const pattern = String(args.pattern ?? "");
        const subPath = typeof args.path === "string" ? args.path : ".";
        return { output: fsGrep(ctx.session.workspace, pattern, subPath), isError: false };
      }

      case "fs_glob": {
        const pattern = typeof args.pattern === "string" ? args.pattern : "";
        return { output: fsGlob(ctx.session.workspace, pattern), isError: false };
      }

      case "finding_record": {
        const finding = createFinding(
          {
            title: String(args.title ?? "Untitled Finding"),
            severity: args.severity as FindingSeverity | undefined,
            cvssVector: typeof args.cvssVector === "string" ? args.cvssVector : undefined,
            target: String(args.target ?? ctx.session.workspace),
            category: typeof args.category === "string" ? args.category : undefined,
            summary: String(args.summary ?? ""),
            impact: String(args.impact ?? ""),
            reproduction: String(args.reproduction ?? ""),
            remediation: typeof args.remediation === "string" ? args.remediation : undefined,
            evidenceIds: Array.isArray(args.evidenceIds) ? args.evidenceIds.map(String) : [],
          },
          ctx.agent.id,
        );
        ctx.session.findings.unshift(finding);
        ctx.persist();
        ctx.emit("finding.updated", finding);
        return {
          output: `Recorded finding ${finding.id} [${finding.severity.toUpperCase()}${finding.cvssScore !== undefined ? ` / CVSS ${finding.cvssScore}` : ""}]: ${finding.title}`,
          isError: false,
        };
      }

      case "finding_list": {
        if (ctx.session.findings.length === 0) {
          return { output: "No findings recorded in this session yet.", isError: false };
        }
        return { output: JSON.stringify(ctx.session.findings, null, 2), isError: false };
      }

      case "finding_report": {
        const fmt = (args.format as "hackerone" | "bugcrowd" | "redteam") || "redteam";
        return { output: exportFindingsReport(ctx.session, fmt), isError: false };
      }

      case "swarm_dispatch": {
        const rawTasks = Array.isArray(args.tasks) ? args.tasks : [];
        const tasks = rawTasks
          .map((t: any) => ({
            agent: String(t?.agent || "recon").replace(/^@/, ""),
            objective: String(t?.objective || "").trim(),
          }))
          .filter((t) => Boolean(t.objective));
        if (tasks.length === 0) {
          throw new Error("swarm_dispatch requires at least one task with { agent, objective }.");
        }
        const summary = await ctx.runSwarm(tasks);
        return { output: summary, isError: false };
      }

      case "mcp_call": {
        const server = String(args.server ?? "");
        const tool = String(args.tool ?? "");
        const toolArgs = (args.arguments as Record<string, unknown>) ?? {};
        const output = await ctx.mcpManager.callTool(server, tool, toolArgs, ctx.config.mcpServers);
        return { output: output.slice(0, 20000), isError: false };
      }

      default:
        return { output: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return {
      output: `Tool "${name}" failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}
