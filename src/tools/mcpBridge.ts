import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpServerConfig } from "../types.js";

interface PendingRequest {
  resolve: (val: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export interface McpToolInfo {
  server: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

class McpStdioClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private buffer = "";
  public tools: McpToolInfo[] = [];
  public connected = false;

  constructor(public readonly config: McpServerConfig) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    const isWin = process.platform === "win32";
    const cmd = isWin && this.config.command === "npx" ? "npx.cmd" : this.config.command;

    this.proc = spawn(cmd, this.config.args, {
      env: { ...process.env, ...(this.config.env ?? {}) },
      shell: isWin,
      windowsHide: true,
    });

    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) continue;
        try {
          const msg = JSON.parse(trimmed) as {
            id?: number;
            result?: unknown;
            error?: { message?: string };
          };
          if (typeof msg.id === "number" && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            clearTimeout(p.timer);
            if (msg.error) p.reject(new Error(msg.error.message || "MCP error"));
            else p.resolve(msg.result);
          }
        } catch {
          // ignore non-JSON log lines
        }
      }
    });

    this.proc.on("exit", () => {
      this.connected = false;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error(`MCP server "${this.config.name}" exited.`));
      }
      this.pending.clear();
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "yedogu", version: "1.0.0" },
    });
    this.notify("notifications/initialized", {});

    const listRes = (await this.request("tools/list", {})) as {
      tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
    };
    this.tools = (listRes?.tools ?? []).map((t) => ({
      server: this.config.name,
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || { type: "object", properties: {} },
    }));
    this.connected = true;
  }

  private notify(method: string, params: unknown): void {
    if (!this.proc) return;
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    this.proc.stdin.write(payload);
  }

  private request(method: string, params: unknown, timeoutMs = 25000): Promise<unknown> {
    if (!this.proc) return Promise.reject(new Error("MCP server not started"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.proc!.stdin.write(payload);
    });
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) await this.connect();
    return this.request("tools/call", { name: toolName, arguments: args }, 90000);
  }

  disconnect(): void {
    this.connected = false;
    try {
      this.proc?.kill();
    } catch {
      // ignore
    }
    this.proc = null;
  }
}

export class McpManager {
  private clients = new Map<string, McpStdioClient>();

  listConfigured(configs: McpServerConfig[]): Array<{
    name: string;
    command: string;
    args: string[];
    enabled: boolean;
    connected: boolean;
    toolCount: number;
  }> {
    return configs.map((c) => {
      const client = this.clients.get(c.name);
      return {
        name: c.name,
        command: c.command,
        args: c.args,
        enabled: c.enabled,
        connected: Boolean(client?.connected),
        toolCount: client?.tools.length ?? 0,
      };
    });
  }

  async connectServer(config: McpServerConfig): Promise<McpToolInfo[]> {
    let client = this.clients.get(config.name);
    if (!client) {
      client = new McpStdioClient(config);
      this.clients.set(config.name, client);
    }
    await client.connect();
    return client.tools;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    configs: McpServerConfig[],
  ): Promise<string> {
    const cfg = configs.find((c) => c.name === serverName);
    if (!cfg) {
      throw new Error(`MCP server "${serverName}" is not configured. Use "/mcp add" first.`);
    }
    let client = this.clients.get(serverName);
    if (!client) {
      client = new McpStdioClient(cfg);
      this.clients.set(serverName, client);
    }
    if (!client.connected) {
      await client.connect();
    }
    const result = await client.callTool(toolName, args);
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  }

  getAllTools(): McpToolInfo[] {
    const out: McpToolInfo[] = [];
    for (const c of this.clients.values()) {
      if (c.connected) out.push(...c.tools);
    }
    return out;
  }

  shutdown(): void {
    for (const c of this.clients.values()) {
      c.disconnect();
    }
    this.clients.clear();
  }
}
