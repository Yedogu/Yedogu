import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AgentDefinition,
  ChannelConfig,
  McpServerConfig,
  ProjectConfig,
  ProviderConfig,
  ReasoningEffort,
  SessionData,
} from "../types.js";

export interface StoredCredentials {
  [providerId: string]: {
    apiKey?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
    updatedAt: string;
  };
}

export interface GlobalConfig {
  defaultModel: string; // "provider/model"
  reasoningEffort?: ReasoningEffort;
  defaultAgent: string;
  agentModels: Record<string, string>;
  credentials: StoredCredentials;
  customProviders: ProviderConfig[];
  customAgents: AgentDefinition[];
  mcpServers: McpServerConfig[];
  channels: ChannelConfig[];
  projects: ProjectConfig[];
  theme: string;
}

export const YEDOGU_HOME = path.join(os.homedir(), ".yedogu");
const CONFIG_PATH = path.join(YEDOGU_HOME, "config.json");
const SESSIONS_DIR = path.join(YEDOGU_HOME, "sessions");

function ensureDirs(): void {
  fs.mkdirSync(YEDOGU_HOME, { recursive: true });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function defaultGlobalConfig(): GlobalConfig {
  return {
    defaultModel: "openai/gpt-5",
    reasoningEffort: "medium",
    defaultAgent: "commander",
    agentModels: {},
    credentials: {},
    customProviders: [],
    customAgents: [],
    mcpServers: [
      {
        name: "rea",
        command: "npx",
        args: ["-y", "rea-agents@latest", "mcp"],
        enabled: false,
      },
    ],
    channels: [],
    projects: [],
    theme: "claude",
  };
}

export function loadGlobalConfig(): GlobalConfig {
  ensureDirs();
  const existing = readJsonSafe<Partial<GlobalConfig>>(CONFIG_PATH);
  const defaults = defaultGlobalConfig();
  if (!existing) {
    saveGlobalConfig(defaults);
    return defaults;
  }
  const merged: GlobalConfig = {
    ...defaults,
    ...existing,
    agentModels: { ...defaults.agentModels, ...(existing.agentModels ?? {}) },
    credentials: { ...(existing.credentials ?? {}) },
    customProviders: existing.customProviders ?? [],
    customAgents: existing.customAgents ?? [],
    mcpServers: existing.mcpServers ?? defaults.mcpServers,
    channels: existing.channels ?? [],
    projects: existing.projects ?? [],
  };

  // Auto-migrate deprecated OpenAI Chat Completions model IDs
  let migrated = false;
  if (merged.defaultModel === "openai/gpt-5-codex" || merged.defaultModel === "codex/gpt-5-codex") {
    merged.defaultModel = merged.defaultModel.replace(/\/gpt-5-codex$/, "/gpt-5");
    migrated = true;
  }
  for (const [ag, spec] of Object.entries(merged.agentModels)) {
    if (spec === "openai/gpt-5-codex" || spec === "codex/gpt-5-codex") {
      merged.agentModels[ag] = spec.replace(/\/gpt-5-codex$/, "/gpt-5");
      migrated = true;
    }
  }
  if (migrated) saveGlobalConfig(merged);
  return merged;
}

export function saveGlobalConfig(cfg: GlobalConfig): void {
  ensureDirs();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
  try {
    if (process.platform !== "win32") {
      fs.chmodSync(CONFIG_PATH, 0o600);
    }
  } catch {
    // Ignore permission errors on Windows
  }
}

/**
 * Discovers credentials already configured on the researcher's machine:
 * - Environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, etc.)
 * - Codex CLI auth (~/.codex/auth.json)
 * - Claude Code auth (~/.claude/.credentials.json)
 * - OpenCode auth (~/.local/share/opencode/auth.json or ~/.config/opencode/opencode.json)
 */
export function discoverExternalCredentials(): Record<
  string,
  { apiKey: string; source: ProviderConfig["authSource"]; baseUrl?: string }
> {
  const discovered: Record<
    string,
    { apiKey: string; source: ProviderConfig["authSource"]; baseUrl?: string }
  > = {};

  const home = os.homedir();

  // 1. Codex CLI (~/.codex/auth.json)
  const codexAuth = readJsonSafe<{
    OPENAI_API_KEY?: string;
    tokens?: { access_token?: string };
  }>(path.join(home, ".codex", "auth.json"));
  if (codexAuth?.OPENAI_API_KEY) {
    discovered["openai"] = { apiKey: codexAuth.OPENAI_API_KEY, source: "codex-cli" };
    discovered["codex"] = { apiKey: codexAuth.OPENAI_API_KEY, source: "codex-cli" };
  } else if (codexAuth?.tokens?.access_token) {
    discovered["codex"] = { apiKey: codexAuth.tokens.access_token, source: "codex-cli" };
  }

  // 2. Claude Code (~/.claude/.credentials.json)
  const claudeAuth = readJsonSafe<{
    claudeAiOauth?: { accessToken?: string };
    apiKey?: string;
  }>(path.join(home, ".claude", ".credentials.json"));
  if (claudeAuth?.apiKey) {
    discovered["anthropic"] = { apiKey: claudeAuth.apiKey, source: "claude-cli" };
  } else if (claudeAuth?.claudeAiOauth?.accessToken) {
    discovered["anthropic"] = {
      apiKey: claudeAuth.claudeAiOauth.accessToken,
      source: "claude-cli",
    };
  }

  // 3. OpenCode auth (~/.local/share/opencode/auth.json)
  const opencodeAuth = readJsonSafe<
    Record<string, { key?: string; access?: string; type?: string }>
  >(path.join(home, ".local", "share", "opencode", "auth.json"));
  if (opencodeAuth) {
    for (const [pid, entry] of Object.entries(opencodeAuth)) {
      const token = entry?.key || entry?.access;
      if (token && !discovered[pid]) {
        discovered[pid] = { apiKey: token, source: "opencode" };
      }
    }
  }

  return discovered;
}

export function getExternalCliAuthPath(providerId: string): string | null {
  const home = os.homedir();
  const id = providerId.trim().toLowerCase();
  if (id === "codex") return path.join(home, ".codex", "auth.json");
  if (id === "anthropic") return path.join(home, ".claude", ".credentials.json");
  return null;
}

export function removeExternalCliCredentials(providerId: string): boolean {
  const filePath = getExternalCliAuthPath(providerId);
  if (!filePath) return false;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // Ignore fs errors
  }
  return false;
}

export function createSession(
  workspace: string,
  cfg: GlobalConfig,
  name?: string,
  projectId?: string,
): SessionData {
  ensureDirs();
  const id = `ses_${crypto.randomBytes(6).toString("hex")}`;
  const now = new Date().toISOString();
  const session: SessionData = {
    id,
    name: name || "New chat",
    projectId,
    pinned: false,
    workspace: path.resolve(workspace),
    activeAgent: cfg.defaultAgent || "commander",
    activeModel: cfg.defaultModel || "openai/gpt-5",
    reasoningEffort: cfg.reasoningEffort || "medium",
    agentModels: { ...cfg.agentModels },
    scope: {
      mode: "advisory",
      allow: [],
      deny: [],
      engagementName: path.basename(path.resolve(workspace)) || "default-engagement",
    },
    messages: [],
    findings: [],
    httpHistory: [],
    artifacts: [],
    swarmWorkers: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    createdAt: now,
    updatedAt: now,
  };
  saveSession(session);
  return session;
}

export function saveSession(session: SessionData): void {
  ensureDirs();
  session.updatedAt = new Date().toISOString();
  const target = path.join(SESSIONS_DIR, `${session.id}.json`);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2), "utf8");
  fs.renameSync(tmp, target);
}

export function loadSession(sessionId: string): SessionData | null {
  ensureDirs();
  return readJsonSafe<SessionData>(path.join(SESSIONS_DIR, `${sessionId}.json`));
}

export function deleteSession(sessionId: string): boolean {
  ensureDirs();
  const target = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      return true;
    }
  } catch {
    // Ignore fs errors
  }
  return false;
}

export function listSessions(): Array<{
  id: string;
  name: string;
  projectId?: string;
  pinned?: boolean;
  workspace: string;
  activeAgent: string;
  activeModel: string;
  messagesCount: number;
  findingsCount: number;
  updatedAt: string;
}> {
  ensureDirs();
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  const list = [];
  for (const file of files) {
    const s = readJsonSafe<SessionData>(path.join(SESSIONS_DIR, file));
    if (!s) continue;
    list.push({
      id: s.id,
      name: s.name,
      projectId: s.projectId,
      pinned: Boolean(s.pinned),
      workspace: s.workspace,
      activeAgent: s.activeAgent,
      activeModel: s.activeModel,
      messagesCount: s.messages.length,
      findingsCount: s.findings.length,
      updatedAt: s.updatedAt,
    });
  }
  return list.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
