import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  createSession,
  deleteSession,
  listSessions,
  loadGlobalConfig,
  loadSession,
  removeExternalCliCredentials,
  saveGlobalConfig,
  saveSession,
  type GlobalConfig,
} from "../config/store.js";
import {
  fetchProviderModels,
  formatModelDisplayName,
  isProviderConnected,
  parseModelSpec,
  pickBestDefaultModel,
  probeLocalOllamaModels,
  resolveProviders,
} from "../providers/registry.js";
import { streamCompletion } from "../providers/client.js";
import { resolveAgents } from "../agents/roster.js";
import { executeTool, getToolsForAgent } from "../tools/index.js";
import { executeHttpForge, type HttpForgeRequest } from "../tools/httpForge.js";
import { runBinaryTriage } from "../tools/binaryTriage.js";
import { runJsRecon } from "../tools/jsRecon.js";
import { createFinding, exportFindingsReport } from "../tools/findings.js";
import { McpManager } from "../tools/mcpBridge.js";
import { ChannelManager } from "../channels/manager.js";
import type {
  AgentDefinition,
  ChatAttachment,
  ChatAttachmentInput,
  ChatMessage,
  FindingRecord,
  FindingSeverity,
  HarnessEvent,
  McpServerConfig,
  MessageSource,
  ProjectConfig,
  ProviderConfig,
  ProviderModelInfo,
  ProviderProtocol,
  ReasoningEffort,
  SessionData,
  SwarmWorkerState,
  ToolCallRecord,
} from "../types.js";

export function deriveChatTitle(prompt: string): string {
  const cleaned = prompt
    .replace(/\r?\n+/g, " ")
    .replace(/^[#>`\s]+/, "")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "New chat";
  if (cleaned.length <= 48) return cleaned;
  const cut = cleaned.slice(0, 48);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

function normalizeFolderKey(folder: string): string {
  const abs = path.resolve(folder);
  return process.platform === "win32" ? abs.toLowerCase() : abs;
}

export interface CustomProviderInput {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  models?: string[];
}

export class YedoguEngine extends EventEmitter {
  public config: GlobalConfig;
  public session: SessionData;
  public readonly mcpManager = new McpManager();
  public readonly channels: ChannelManager;
  private activeAbort: AbortController | null = null;
  private liveModelsCache = new Map<string, ProviderModelInfo[]>();
  private liveModelsMeta = new Map<string, { live: boolean; error?: string; updatedAt: string }>();
  public busy = false;
  public daemonUrl = "";

  constructor(workspace: string, resumeSessionId?: string) {
    super();
    this.config = loadGlobalConfig();
    this.channels = new ChannelManager(this);
    const providers = this.getProviders();

    // Auto-select a connected provider if default is unauthenticated
    try {
      const parsed = parseModelSpec(this.config.defaultModel, providers);
      if (!parsed.provider.apiKey) {
        const best = pickBestDefaultModel(providers);
        this.config.defaultModel = best;
        saveGlobalConfig(this.config);
      }
    } catch {
      this.config.defaultModel = pickBestDefaultModel(providers);
      saveGlobalConfig(this.config);
    }

    let loaded: SessionData | null = null;
    if (resumeSessionId) {
      loaded = loadSession(resumeSessionId);
      if (loaded && (loaded.activeModel === "openai/gpt-5-codex" || loaded.activeModel === "codex/gpt-5-codex")) {
        loaded.activeModel = loaded.activeModel.replace(/\/gpt-5-codex$/, "/gpt-5");
        saveSession(loaded);
      }
    }
    this.session = loaded ?? createSession(workspace, this.config);
    const proj = this.ensureProjectForWorkspace(this.session.workspace);
    if (!this.session.projectId) {
      this.session.projectId = proj.id;
      this.persist();
    }
  }

  public emitEvent(type: HarnessEvent["type"], payload: unknown): void {
    const evt: HarnessEvent = {
      type,
      sessionId: this.session.id,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.emit("event", evt);
  }

  public persist(): void {
    saveSession(this.session);
  }

  public getProviders(): ProviderConfig[] {
    return resolveProviders(this.config).map((p) => {
      const live = this.liveModelsCache.get(p.id);
      if (live && live.length > 0 && (isProviderConnected(p) || p.local)) {
        const models = p.custom
          ? [...new Map([...p.models, ...live].map((m) => [m.id, m])).values()]
          : [...live];
        return { ...p, models };
      }
      return p;
    });
  }

  public getConnectedProviders(): ProviderConfig[] {
    return this.getProviders().filter(isProviderConnected);
  }

  public getProviderLiveMeta(
    providerId: string,
  ): { live: boolean; error?: string; updatedAt: string } | undefined {
    return this.liveModelsMeta.get(providerId.toLowerCase());
  }

  public async refreshProviderModels(
    providerId?: string,
  ): Promise<Array<{ providerId: string; count: number; live: boolean; error?: string }>> {
    const allProviders = this.getProviders();
    const targets = providerId
      ? allProviders.filter((p) => p.id === providerId.toLowerCase() && (isProviderConnected(p) || p.local))
      : allProviders.filter((p) => isProviderConnected(p) || p.id === "ollama");

    const results = await Promise.all(
      targets.map(async (p) => {
        if (p.id === "ollama") {
          const ollamaNames = await probeLocalOllamaModels(p.baseUrl);
          if (ollamaNames.length > 0) {
            const liveModels: ProviderModelInfo[] = ollamaNames.map((id) => ({
              id,
              name: formatModelDisplayName(id),
              contextWindow: 65536,
              supportsTools: true,
              supportsReasoning: /r1|qwq|thinking|reasoning/i.test(id),
              tags: ["local", "live", "detected"],
            }));
            this.liveModelsCache.set("ollama", liveModels);
            this.liveModelsMeta.set("ollama", { live: true, updatedAt: new Date().toISOString() });
            return { providerId: "ollama", count: liveModels.length, live: true };
          }
          if (!isProviderConnected(p)) {
            this.liveModelsCache.delete("ollama");
            return { providerId: "ollama", count: 0, live: false };
          }
        }
        const customConfig = this.config.customProviders.find((configured) => configured.id === p.id);
        const res = await fetchProviderModels(p);
        if (p.custom && customConfig !== this.config.customProviders.find((configured) => configured.id === p.id)) {
          return { providerId: p.id, count: 0, live: false, error: "Provider settings changed during model refresh. Refresh again." };
        }
        if (res.live && res.models.length > 0) {
          this.liveModelsCache.set(p.id, res.models);
          this.liveModelsMeta.set(p.id, { live: true, updatedAt: new Date().toISOString() });
        } else {
          if (/HTTP (401|403)|not running|no local models/i.test(res.error || "")) {
            this.liveModelsCache.delete(p.id);
          }
          this.liveModelsMeta.set(p.id, { live: false, error: res.error, updatedAt: new Date().toISOString() });
        }
        return {
          providerId: p.id,
          count: res.models.length,
          live: res.live,
          error: res.error,
        };
      }),
    );

    if (results.some((r) => r.live || r.error)) {
      this.emitEvent("provider.updated", { refreshed: results.map((r) => r.providerId) });
    }
    return results;
  }

  public hasLiveModelsCached(providerId: string): boolean {
    return this.liveModelsCache.has(providerId);
  }

  public getAgents(): AgentDefinition[] {
    return resolveAgents(this.config);
  }

  public getAgent(id?: string): AgentDefinition {
    const agents = this.getAgents();
    const targetId = (id || this.session.activeAgent || "commander").replace(/^@/, "").toLowerCase();
    return agents.find((a) => a.id === targetId) ?? agents[0];
  }

  public getEffectiveModelForAgent(agentId: string): string {
    return (
      this.session.agentModels[agentId] ||
      this.config.agentModels[agentId] ||
      this.getAgent(agentId).preferredModel ||
      this.session.activeModel ||
      this.config.defaultModel
    );
  }

  public setActiveAgent(agentId: string): AgentDefinition {
    const clean = agentId.replace(/^@/, "").toLowerCase();
    const agent = this.getAgents().find((a) => a.id === clean);
    if (!agent) {
      throw new Error(
        `Unknown agent "@${clean}". Available: ${this.getAgents()
          .map((a) => `@${a.id}`)
          .join(", ")}`,
      );
    }
    this.session.activeAgent = agent.id;
    this.persist();
    this.emitEvent("agent.changed", { agentId: agent.id, agent });
    return agent;
  }

  public setModel(modelSpec: string, forAgentId?: string): string {
    const providers = this.getProviders();
    const { provider, modelId } = parseModelSpec(modelSpec, providers);
    const normalized = `${provider.id}/${modelId}`;

    if (forAgentId) {
      const clean = forAgentId.replace(/^@/, "").toLowerCase();
      this.session.agentModels[clean] = normalized;
      this.config.agentModels[clean] = normalized;
      saveGlobalConfig(this.config);
    } else {
      this.session.activeModel = normalized;
      this.config.defaultModel = normalized;
      saveGlobalConfig(this.config);
    }
    this.persist();
    this.emitEvent("model.changed", { model: normalized, agentId: forAgentId ?? null });
    return normalized;
  }

  public clearAgentModel(agentId: string): void {
    const clean = agentId.replace(/^@/, "").toLowerCase();
    delete this.session.agentModels[clean];
    delete this.config.agentModels[clean];
    saveGlobalConfig(this.config);
    this.persist();
    this.emitEvent("model.changed", { model: this.session.activeModel, agentId: clean, cleared: true });
  }

  public setReasoningEffort(effort: ReasoningEffort): ReasoningEffort {
    const allowed: ReasoningEffort[] = ["none", "low", "medium", "high", "xhigh"];
    const normalized = allowed.includes(effort) ? effort : "medium";
    this.session.reasoningEffort = normalized;
    this.config.reasoningEffort = normalized;
    saveGlobalConfig(this.config);
    this.persist();
    this.emitEvent("model.changed", {
      model: this.session.activeModel,
      reasoningEffort: normalized,
      agentId: null,
    });
    return normalized;
  }

  public getFavoriteModels(): string[] {
    return Array.isArray(this.config.favoriteModels) ? [...this.config.favoriteModels] : [];
  }

  public toggleFavoriteModel(key: string): string[] {
    const clean = key.trim().toLowerCase();
    if (!clean) return this.getFavoriteModels();
    const set = new Set(this.getFavoriteModels());
    if (set.has(clean)) set.delete(clean);
    else set.add(clean);
    this.config.favoriteModels = [...set];
    saveGlobalConfig(this.config);
    this.emitEvent("model.changed", { favoriteModels: this.config.favoriteModels });
    return [...this.config.favoriteModels];
  }

  public connectProvider(providerId: string, apiKey: string, baseUrl?: string): ProviderConfig {
    const id = providerId.trim().toLowerCase();
    const existing = this.getProviders().find((p) => p.id === id);
    if (!existing) {
      throw new Error(`Unknown provider "${id}". Use addCustomProvider for custom endpoints.`);
    }
    this.config.credentials[id] = {
      apiKey: apiKey.trim(),
      baseUrl: baseUrl?.trim() || this.config.credentials[id]?.baseUrl,
      updatedAt: new Date().toISOString(),
    };
    saveGlobalConfig(this.config);
    const updated = this.getProviders().find((p) => p.id === id)!;
    this.emitEvent("provider.updated", { providerId: id, connected: true });
    return updated;
  }

  public disconnectProvider(
    providerId: string,
    opts?: { removeCliAuth?: boolean },
  ): {
    provider: ProviderConfig;
    removedConfig: boolean;
    removedCliAuth: boolean;
    stillConnectedViaEnv: boolean;
  } {
    const id = providerId.trim().toLowerCase();
    const existing = this.getProviders().find((p) => p.id === id);
    if (!existing) {
      throw new Error(`Unknown provider "${id}".`);
    }

    const removedConfig = Boolean(this.config.credentials[id]);
    if (removedConfig) {
      delete this.config.credentials[id];
      saveGlobalConfig(this.config);
    }

    const removedCliAuth = opts?.removeCliAuth ? removeExternalCliCredentials(id) : false;
    this.liveModelsCache.delete(id);

    const providers = this.getProviders();
    const updated = providers.find((p) => p.id === id)!;
    const stillConnected = isProviderConnected(updated);

    if (!stillConnected && this.session.activeModel.startsWith(`${id}/`)) {
      const nextBest = pickBestDefaultModel(providers);
      this.session.activeModel = nextBest;
      this.config.defaultModel = nextBest;
      saveGlobalConfig(this.config);
      this.persist();
    }

    this.emitEvent("provider.updated", { providerId: id, connected: stillConnected });
    return {
      provider: updated,
      removedConfig,
      removedCliAuth,
      stillConnectedViaEnv: stillConnected && updated.authSource === "env",
    };
  }

  public addCustomProvider(input: CustomProviderInput): ProviderConfig {
    const id = input.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!id) throw new Error("Invalid custom provider ID.");
    if (this.getProviders().some((p) => p.id === id)) {
      throw new Error(`Provider "${id}" already exists. Edit its settings instead.`);
    }
    return this.saveCustomProvider({ ...input, id });
  }

  public updateCustomProvider(
    providerId: string,
    patch: Partial<Omit<CustomProviderInput, "id">>,
  ): ProviderConfig {
    const id = providerId.trim().toLowerCase();
    const existing = this.config.customProviders.find((p) => p.id === id);
    if (!existing) throw new Error(`Custom provider "${id}" was not found.`);
    const resolved = this.getProviders().find((p) => p.id === id)!;
    return this.saveCustomProvider({
      id,
      name: patch.name ?? existing.name,
      protocol: patch.protocol ?? existing.protocol,
      baseUrl: patch.baseUrl ?? resolved.baseUrl,
      apiKey: patch.apiKey,
      defaultModel: patch.defaultModel ?? existing.defaultModel,
      models: patch.models ?? existing.models.filter((m) => m.id !== existing.defaultModel).map((m) => m.id),
    }, existing);
  }

  private saveCustomProvider(input: CustomProviderInput, existing?: ProviderConfig): ProviderConfig {
    const id = input.id;
    if (!["openai", "anthropic", "gemini"].includes(input.protocol)) {
      throw new Error("Choose an OpenAI, Anthropic, or Gemini protocol.");
    }
    const baseUrl = input.baseUrl.trim();
    try {
      if (!["http:", "https:"].includes(new URL(baseUrl).protocol)) throw new Error();
    } catch {
      throw new Error("Enter a valid HTTP or HTTPS endpoint URL.");
    }
    const defaultModel = input.defaultModel.trim() || "default";
    if (/[\s,]/.test(defaultModel)) throw new Error("Enter a single default model ID without spaces or commas.");
    if (input.models !== undefined && (!Array.isArray(input.models) || input.models.some((m) => typeof m !== "string"))) {
      throw new Error("Model IDs must be a list of strings.");
    }
    const modelIds = [...new Set([defaultModel, ...(input.models ?? []).map((m) => m.trim()).filter(Boolean)])];
    if (modelIds.some((m) => /[\s,]/.test(m))) throw new Error("Enter model IDs without spaces or commas.");
    const provider: ProviderConfig = {
      ...existing,
      id,
      name: input.name.trim() || id,
      protocol: input.protocol,
      baseUrl,
      envKeys: [],
      defaultModel,
      custom: true,
      models: modelIds.map((modelId) =>
        existing?.models.find((m) => m.id === modelId) ?? {
          id: modelId,
          name: modelId,
          contextWindow: 128000,
          supportsTools: true,
          tags: ["custom"],
        },
      ),
    };
    this.config.customProviders = existing
      ? this.config.customProviders.map((p) => p.id === id ? provider : p)
      : [...this.config.customProviders, provider];
    const stored = this.config.credentials[id];
    const apiKey = input.apiKey?.trim() || stored?.apiKey;
    if (stored || apiKey) {
      this.config.credentials[id] = {
        ...stored,
        apiKey,
        baseUrl,
        updatedAt: new Date().toISOString(),
      };
    }
    this.liveModelsCache.delete(id);
    if (existing) {
      const removedSpecs = new Set(existing.models.filter((m) => !modelIds.includes(m.id)).map((m) => `${id}/${m.id}`));
      const replaceRemoved = (spec: string) => removedSpecs.has(spec) ? `${id}/${defaultModel}` : spec;
      this.config.defaultModel = replaceRemoved(this.config.defaultModel);
      this.session.activeModel = replaceRemoved(this.session.activeModel);
      for (const pins of [this.config.agentModels, this.session.agentModels]) {
        for (const [agentId, spec] of Object.entries(pins)) pins[agentId] = replaceRemoved(spec);
      }
      this.persist();
    }
    saveGlobalConfig(this.config);
    const updated = this.getProviders().find((p) => p.id === id)!;
    this.emitEvent("provider.updated", { providerId: id, connected: isProviderConnected(updated) });
    return updated;
  }

  public deleteCustomProvider(providerId: string): boolean {
    const id = providerId.trim().toLowerCase();
    const exists = this.config.customProviders.some((p) => p.id === id);
    if (!exists) return false;

    this.config.customProviders = this.config.customProviders.filter((p) => p.id !== id);
    if (this.config.credentials[id]) {
      delete this.config.credentials[id];
    }
    this.liveModelsCache.delete(id);
    this.liveModelsMeta.delete(id);

    const providers = this.getProviders();
    const fallback = pickBestDefaultModel(providers);
    if (this.config.defaultModel.startsWith(`${id}/`)) {
      this.config.defaultModel = fallback;
    }
    if (this.session.activeModel.startsWith(`${id}/`)) {
      this.session.activeModel = fallback;
    }
    for (const pins of [this.config.agentModels, this.session.agentModels]) {
      for (const [agentId, spec] of Object.entries(pins)) {
        if (spec.startsWith(`${id}/`)) {
          delete pins[agentId];
        }
      }
    }

    saveGlobalConfig(this.config);
    this.persist();
    this.emitEvent("provider.updated", { providerId: id, deleted: true });
    return true;
  }

  public addCustomAgent(agent: Omit<AgentDefinition, "builtin">): AgentDefinition {
    const id = agent.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!id) throw new Error("Invalid agent ID.");
    const def: AgentDefinition = { ...agent, id, name: id, builtin: false };
    this.config.customAgents = [...this.config.customAgents.filter((a) => a.id !== id), def];
    saveGlobalConfig(this.config);
    this.emitEvent("session.updated", { agents: this.getAgents() });
    return def;
  }

  public updateScope(patch: Partial<SessionData["scope"]>): SessionData["scope"] {
    this.session.scope = {
      ...this.session.scope,
      ...patch,
      allow: patch.allow ?? this.session.scope.allow,
      deny: patch.deny ?? this.session.scope.deny,
    };
    this.persist();
    this.emitEvent("scope.updated", this.session.scope);
    return this.session.scope;
  }

  public addScopeRule(kind: "allow" | "deny", rule: string): SessionData["scope"] {
    const clean = rule.trim();
    if (!clean) return this.session.scope;
    const list = this.session.scope[kind];
    if (!list.includes(clean)) list.push(clean);
    this.persist();
    this.emitEvent("scope.updated", this.session.scope);
    return this.session.scope;
  }

  public removeScopeRule(kind: "allow" | "deny", rule: string): SessionData["scope"] {
    this.session.scope[kind] = this.session.scope[kind].filter((r) => r !== rule.trim());
    this.persist();
    this.emitEvent("scope.updated", this.session.scope);
    return this.session.scope;
  }

  public async runDirectHttp(req: HttpForgeRequest) {
    const res = await executeHttpForge(req, this.session.scope, this.session.activeAgent);
    this.session.httpHistory.unshift(res.capture);
    if (this.session.httpHistory.length > 200) this.session.httpHistory.pop();
    this.persist();
    this.emitEvent("http.captured", res.capture);
    return res;
  }

  public runDirectBinaryTriage(filePath: string) {
    const summary = runBinaryTriage(filePath);
    this.session.artifacts.unshift(summary);
    if (this.session.artifacts.length > 50) this.session.artifacts.pop();
    this.persist();
    this.emitEvent("artifact.analyzed", summary);
    return summary;
  }

  public runDirectJsRecon(targetPath: string) {
    return runJsRecon(targetPath);
  }

  public addDirectFinding(input: Parameters<typeof createFinding>[0]): FindingRecord {
    const f = createFinding(input, this.session.activeAgent);
    this.session.findings.unshift(f);
    this.persist();
    this.emitEvent("finding.updated", f);
    return f;
  }

  public updateFindingStatus(
    findingId: string,
    patch: Partial<Pick<FindingRecord, "status" | "severity" | "triageGate">>,
  ): FindingRecord {
    const f = this.session.findings.find((item) => item.id === findingId);
    if (!f) throw new Error(`Finding not found: ${findingId}`);
    if (patch.status) f.status = patch.status;
    if (patch.severity) f.severity = patch.severity;
    if (patch.triageGate) f.triageGate = { ...f.triageGate, ...patch.triageGate };
    f.updatedAt = new Date().toISOString();
    this.persist();
    this.emitEvent("finding.updated", f);
    return f;
  }

  public getReport(format: "hackerone" | "bugcrowd" | "redteam" = "redteam"): string {
    return exportFindingsReport(this.session, format);
  }

  public addMcpServer(server: McpServerConfig): void {
    this.config.mcpServers = [
      ...this.config.mcpServers.filter((m) => m.name !== server.name),
      server,
    ];
    saveGlobalConfig(this.config);
  }

  public async connectMcpServer(name: string) {
    const cfg = this.config.mcpServers.find((m) => m.name === name);
    if (!cfg) throw new Error(`MCP server "${name}" not found.`);
    cfg.enabled = true;
    saveGlobalConfig(this.config);
    return this.mcpManager.connectServer(cfg);
  }

  public ensureProjectForWorkspace(workspace: string): ProjectConfig {
    const abs = path.resolve(workspace);
    const key = normalizeFolderKey(abs);
    const existing = this.config.projects.find((p) => normalizeFolderKey(p.folder) === key);
    if (existing) return existing;

    const now = new Date().toISOString();
    const project: ProjectConfig = {
      id: `prj_${crypto.randomBytes(4).toString("hex")}`,
      name: path.basename(abs) || "Workspace",
      folder: abs,
      createdAt: now,
      updatedAt: now,
    };
    this.config.projects.push(project);
    saveGlobalConfig(this.config);
    return project;
  }

  public getProjects(): ProjectConfig[] {
    this.ensureProjectForWorkspace(this.session.workspace);
    return this.config.projects;
  }

  public createProject(input: { name?: string; folder: string }): { project: ProjectConfig; session: SessionData } {
    const rawFolder = String(input.folder || "").trim();
    if (!rawFolder) throw new Error("Project folder path is required.");
    const abs = path.resolve(rawFolder);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error(`Directory not found: ${abs}`);
    }

    const key = normalizeFolderKey(abs);
    const now = new Date().toISOString();
    let project = this.config.projects.find((p) => normalizeFolderKey(p.folder) === key);
    if (project) {
      if (input.name && input.name.trim()) {
        project.name = input.name.trim();
        project.updatedAt = now;
        saveGlobalConfig(this.config);
      }
    } else {
      project = {
        id: `prj_${crypto.randomBytes(4).toString("hex")}`,
        name: (input.name || "").trim() || path.basename(abs) || "Workspace",
        folder: abs,
        createdAt: now,
        updatedAt: now,
      };
      this.config.projects.push(project);
      saveGlobalConfig(this.config);
    }

    this.session = createSession(project.folder, this.config, "New chat", project.id);
    this.emitEvent("session.updated", { projectId: project.id, sessionId: this.session.id });
    return { project, session: this.session };
  }

  public updateProject(id: string, fields: { name?: string; folder?: string }): ProjectConfig {
    const project = this.config.projects.find((p) => p.id === id);
    if (!project) throw new Error(`Project not found: ${id}`);

    if (typeof fields.name === "string" && fields.name.trim()) {
      project.name = fields.name.trim();
    }
    if (typeof fields.folder === "string" && fields.folder.trim()) {
      const abs = path.resolve(fields.folder.trim());
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
        throw new Error(`Directory not found: ${abs}`);
      }
      project.folder = abs;
      if (this.session.projectId === id) {
        this.session.workspace = abs;
        this.persist();
      }
    }
    project.updatedAt = new Date().toISOString();
    saveGlobalConfig(this.config);
    this.emitEvent("session.updated", { projectId: project.id });
    return project;
  }

  public clearProjectChats(projectId: string): { deletedCount: number; session: SessionData } {
    const project = this.config.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const projKey = normalizeFolderKey(project.folder);
    const matching = listSessions().filter(
      (s) => s.projectId === projectId || (!s.projectId && normalizeFolderKey(s.workspace) === projKey),
    );
    let deletedCount = 0;
    for (const s of matching) {
      if (deleteSession(s.id)) deletedCount++;
    }

    const activeBelongs =
      this.session.projectId === projectId ||
      (!this.session.projectId && normalizeFolderKey(this.session.workspace) === projKey);

    if (activeBelongs) {
      this.session = createSession(project.folder, this.config, "New chat", project.id);
    }
    this.emitEvent("session.updated", { clearedProjectId: projectId, deletedCount });
    return { deletedCount, session: this.session };
  }

  public deleteProject(projectId: string): { deleted: boolean; session: SessionData } {
    const idx = this.config.projects.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error(`Project not found: ${projectId}`);
    const [removed] = this.config.projects.splice(idx, 1);
    const projKey = normalizeFolderKey(removed.folder);

    for (const s of listSessions()) {
      if (s.projectId === projectId || (!s.projectId && normalizeFolderKey(s.workspace) === projKey)) {
        deleteSession(s.id);
      }
    }
    saveGlobalConfig(this.config);

    const activeBelongs =
      this.session.projectId === projectId ||
      (!this.session.projectId && normalizeFolderKey(this.session.workspace) === projKey);

    if (activeBelongs) {
      const nextProj = this.config.projects[0] ?? this.ensureProjectForWorkspace(process.cwd());
      const nextKey = normalizeFolderKey(nextProj.folder);
      const candidate = listSessions().find(
        (s) => s.projectId === nextProj.id || (!s.projectId && normalizeFolderKey(s.workspace) === nextKey),
      );
      const loaded = candidate ? loadSession(candidate.id) : null;
      this.session = loaded ?? createSession(nextProj.folder, this.config, "New chat", nextProj.id);
    }

    this.emitEvent("session.updated", { deletedProjectId: projectId });
    return { deleted: true, session: this.session };
  }

  public switchSession(sessionId: string): SessionData {
    const loaded = loadSession(sessionId);
    if (!loaded) throw new Error(`Session not found: ${sessionId}`);
    const proj = this.ensureProjectForWorkspace(loaded.workspace);
    if (!loaded.projectId) {
      loaded.projectId = proj.id;
      saveSession(loaded);
    }
    this.session = loaded;
    this.emitEvent("session.updated", { sessionId: loaded.id });
    return loaded;
  }

  public newSession(name?: string, projectId?: string): SessionData {
    const project =
      (projectId ? this.config.projects.find((p) => p.id === projectId) : undefined) ??
      this.ensureProjectForWorkspace(this.session.workspace);
    this.session = createSession(project.folder, this.config, name, project.id);
    this.emitEvent("session.updated", { sessionId: this.session.id, projectId: project.id });
    return this.session;
  }

  public updateSession(sessionId: string, fields: { name?: string; pinned?: boolean }): SessionData {
    const target = sessionId === this.session.id ? this.session : loadSession(sessionId);
    if (!target) throw new Error(`Session not found: ${sessionId}`);
    if (typeof fields.name === "string" && fields.name.trim()) {
      target.name = fields.name.trim();
    }
    if (typeof fields.pinned === "boolean") {
      target.pinned = fields.pinned;
    }
    saveSession(target);
    if (target.id === this.session.id) {
      this.session = target;
    }
    this.emitEvent("session.updated", { sessionId: target.id });
    return target;
  }

  public deleteSessionById(sessionId: string): { deleted: boolean; session: SessionData } {
    const deleted = deleteSession(sessionId);
    if (sessionId === this.session.id) {
      const proj = this.ensureProjectForWorkspace(this.session.workspace);
      const projKey = normalizeFolderKey(proj.folder);
      const nextSummary = listSessions().find(
        (s) => s.projectId === proj.id || (!s.projectId && normalizeFolderKey(s.workspace) === projKey),
      );
      const loaded = nextSummary ? loadSession(nextSummary.id) : null;
      this.session = loaded ?? createSession(proj.folder, this.config, "New chat", proj.id);
    }
    this.emitEvent("session.updated", { deletedSessionId: sessionId });
    return { deleted, session: this.session };
  }

  public setTheme(themeId: string): string {
    const clean = themeId.trim().toLowerCase();
    this.config.theme = clean;
    saveGlobalConfig(this.config);
    this.emitEvent("session.updated", { theme: clean });
    return clean;
  }

  public clearMessages(): void {
    this.session.messages = [];
    this.persist();
    this.emitEvent("session.updated", this.getSnapshot());
  }

  public compactSession(): string {
    if (this.session.messages.length <= 6) {
      return "Session is already compact (<= 6 messages).";
    }
    const kept = this.session.messages.slice(-6);
    const archivedCount = this.session.messages.length - kept.length;
    const summaryMsg: ChatMessage = {
      id: `msg_${crypto.randomBytes(4).toString("hex")}`,
      role: "assistant",
      agentId: "commander",
      content: `[Compacted ${archivedCount} earlier messages. Findings in ledger: ${this.session.findings.length}. HTTP captures: ${this.session.httpHistory.length}. Analyzed binaries: ${this.session.artifacts.length}.]`,
      timestamp: new Date().toISOString(),
    };
    this.session.messages = [summaryMsg, ...kept];
    this.persist();
    this.emitEvent("session.updated", this.getSnapshot());
    return `Compacted ${archivedCount} earlier messages to save context window.`;
  }

  public abortActive(): boolean {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
      this.busy = false;
      this.emitEvent("system.notice", { level: "warn", message: "Generation aborted by operator." });
      return true;
    }
    return false;
  }

  private buildDynamicSystemPrompt(agent: AgentDefinition): string {
    const scopeLine =
      this.session.scope.allow.length > 0
        ? `Scope Mode: ${this.session.scope.mode.toUpperCase()} | Allow: ${this.session.scope.allow.join(", ")} | Deny: ${this.session.scope.deny.join(", ") || "none"}`
        : `Scope Mode: ${this.session.scope.mode.toUpperCase()} (No explicit host rules yet)`;

    const mcpTools = this.mcpManager.getAllTools();
    const mcpBlock =
      mcpTools.length > 0
        ? `\nCONNECTED MCP TOOLS (invoke via mcp_call):\n` +
          mcpTools
            .slice(0, 40)
            .map((t) => `- ${t.server}::${t.name}: ${t.description.slice(0, 120)}`)
            .join("\n")
        : "";

    return `${agent.systemPrompt}

RUNTIME CONTEXT:
- Workspace: ${this.session.workspace}
- Engagement: ${this.session.scope.engagementName}
- ${scopeLine}
- Recorded Findings: ${this.session.findings.length} | HTTP Captures: ${this.session.httpHistory.length} | Binary Artifacts: ${this.session.artifacts.length}
- Available Specialist Agents for swarm_dispatch: ${this.getAgents().map((a) => a.id).join(", ")}${mcpBlock}`;
  }

  /**
   * Sends a user prompt (supports leading `@agentName` routing) and executes the
   * full streaming agentic tool-calling loop.
   */
  public async sendPrompt(
    rawInput: string,
    overrideAgentId?: string,
    source?: MessageSource,
    attachments?: ChatAttachmentInput[],
  ): Promise<ChatMessage> {
    let promptText = rawInput.trim();
    const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 8) : [];
    if (!promptText && safeAttachments.length > 0) {
      promptText = "Analyze the attached file(s).";
    }
    let targetAgentId = overrideAgentId || this.session.activeAgent;

    // Detect leading @agent mention (e.g. "@reverser triage app.exe")
    const mentionMatch = promptText.match(/^@([a-z0-9_-]+)\s+([\s\S]+)$/i);
    if (mentionMatch) {
      const candidate = mentionMatch[1].toLowerCase();
      if (this.getAgents().some((a) => a.id === candidate)) {
        targetAgentId = candidate;
        promptText = mentionMatch[2].trim();
      }
    }

    const agent = this.getAgent(targetAgentId);
    const modelSpec = this.getEffectiveModelForAgent(agent.id);
    const providers = this.getProviders();
    const { provider, modelId } = parseModelSpec(modelSpec, providers);

    const hadUserMessages = this.session.messages.some((m) => m.role === "user");
    const isDefaultName =
      !this.session.name?.trim() ||
      this.session.name === "New chat" ||
      /^op-\d{4}-\d{2}-\d{2}-[a-f0-9]+$/i.test(this.session.name);
    if (!hadUserMessages && isDefaultName) {
      this.session.name = deriveChatTitle(promptText);
    }

    const savedAttachments: ChatAttachment[] = [];
    const attachmentContextBlocks: string[] = [];
    if (safeAttachments.length > 0) {
      let uploadDir = path.join(this.session.workspace, ".yedogu-uploads");
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
      } catch {
        uploadDir = path.join(os.tmpdir(), "yedogu-uploads");
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      for (const att of safeAttachments) {
        const cleanName = path.basename(att.name || "attachment.bin").replace(/[^a-zA-Z0-9._-]/g, "_") || "attachment.bin";
        const dest = path.join(uploadDir, `${Date.now().toString(36)}-${cleanName}`);
        try {
          const buf = att.encoding === "base64"
            ? Buffer.from(att.content || "", "base64")
            : Buffer.from(att.content || "", "utf8");
          fs.writeFileSync(dest, buf);
          savedAttachments.push({
            name: att.name || cleanName,
            mimeType: att.mimeType || "application/octet-stream",
            size: buf.length,
            savedPath: dest,
          });
          if (att.encoding === "utf8" && buf.length <= 65536) {
            attachmentContextBlocks.push(
              `[ATTACHED FILE: ${att.name || cleanName} | path: ${dest} | ${buf.length} bytes]\n\`\`\`\n${att.content}\n\`\`\``,
            );
          } else {
            attachmentContextBlocks.push(
              `[ATTACHED FILE: ${att.name || cleanName} | mime: ${att.mimeType || "application/octet-stream"} | size: ${buf.length} bytes | savedPath: ${dest}]`,
            );
          }
        } catch {
          // Ignore individual write failure
        }
      }
    }

    const userMsg: ChatMessage = {
      id: `msg_${crypto.randomBytes(4).toString("hex")}`,
      role: "user",
      agentId: agent.id,
      content: promptText,
      attachments: savedAttachments.length > 0 ? savedAttachments : undefined,
      source,
      timestamp: new Date().toISOString(),
    };
    this.session.messages.push(userMsg);
    this.persist();
    this.emitEvent("message.done", userMsg);
    if (!hadUserMessages && isDefaultName) {
      this.emitEvent("session.updated", { sessionId: this.session.id, name: this.session.name });
    }

    this.busy = true;
    this.activeAbort = new AbortController();
    const lenAfterUserMsg = this.session.messages.length;

    const llmConversation: ChatMessage[] =
      attachmentContextBlocks.length > 0
        ? [
            ...this.session.messages.slice(0, -1),
            {
              ...userMsg,
              content: `${promptText}\n\n${attachmentContextBlocks.join("\n\n")}`,
            },
          ]
        : this.session.messages;

    try {
      const reply = await this.runAgentLoop(agent, provider, modelId, llmConversation, this.activeAbort.signal);
      if (attachmentContextBlocks.length > 0 && llmConversation.length > lenAfterUserMsg) {
        this.session.messages.push(...llmConversation.slice(lenAfterUserMsg));
        this.persist();
      }
      return reply;
    } catch (err) {
      // Roll back the dangling user message if the provider failed before producing any assistant reply
      // so consecutive failed prompts don't poison alternating user/assistant history.
      if (
        this.session.messages.length === lenAfterUserMsg &&
        this.session.messages[this.session.messages.length - 1]?.id === userMsg.id
      ) {
        this.session.messages.pop();
        this.persist();
        this.emitEvent("session.updated", { rolledBackMessageId: userMsg.id });
      }
      throw err;
    } finally {
      this.busy = false;
      this.activeAbort = null;
    }
  }

  private async runAgentLoop(
    agent: AgentDefinition,
    provider: ProviderConfig,
    modelId: string,
    conversation: ChatMessage[],
    signal: AbortSignal,
    isSubagent = false,
  ): Promise<ChatMessage> {
    const tools = getToolsForAgent(agent);
    const systemPrompt = this.buildDynamicSystemPrompt(agent);
    let lastAssistantMsg: ChatMessage | null = null;

    for (let step = 0; step < agent.maxSteps; step++) {
      const msgId = `msg_${crypto.randomBytes(4).toString("hex")}`;
      if (!isSubagent) {
        this.emitEvent("message.start", {
          id: msgId,
          agentId: agent.id,
          model: `${provider.id}/${modelId}`,
        });
      }

      const result = await streamCompletion({
        provider,
        modelId,
        systemPrompt,
        messages: conversation,
        tools,
        temperature: agent.temperature,
        reasoningEffort: this.session.reasoningEffort || this.config.reasoningEffort,
        signal,
        onTextDelta: (delta) => {
          if (!isSubagent) this.emitEvent("message.delta", { id: msgId, delta, agentId: agent.id });
        },
        onReasoningDelta: (delta) => {
          if (!isSubagent) this.emitEvent("reasoning.delta", { id: msgId, delta, agentId: agent.id });
        },
      });

      this.session.totalInputTokens += result.usage.inputTokens;
      this.session.totalOutputTokens += result.usage.outputTokens;

      const toolCallRecords: ToolCallRecord[] = result.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        status: "running",
      }));

      const assistantMsg: ChatMessage = {
        id: msgId,
        role: "assistant",
        agentId: agent.id,
        model: `${provider.id}/${modelId}`,
        content: result.content,
        reasoning: result.reasoning || undefined,
        toolCalls: toolCallRecords.length > 0 ? toolCallRecords : undefined,
        usage: result.usage,
        timestamp: new Date().toISOString(),
      };

      conversation.push(assistantMsg);
      lastAssistantMsg = assistantMsg;
      if (!isSubagent) {
        this.persist();
        this.emitEvent("message.done", assistantMsg);
      }

      if (result.toolCalls.length === 0) {
        break;
      }

      // Execute requested tools
      for (const tc of toolCallRecords) {
        const started = Date.now();
        if (!isSubagent) {
          this.emitEvent("tool.start", {
            messageId: msgId,
            agentId: agent.id,
            toolCall: tc,
          });
        }

        const execRes = await executeTool(tc.name, tc.arguments, {
          session: this.session,
          agent,
          config: this.config,
          mcpManager: this.mcpManager,
          emit: (type, payload) => this.emitEvent(type, payload),
          persist: () => this.persist(),
          runSwarm: (tasks) => this.runSwarm(tasks),
        });

        tc.output = execRes.output;
        tc.isError = execRes.isError;
        tc.durationMs = Date.now() - started;
        tc.status = execRes.isError ? "error" : "done";

        if (!isSubagent) {
          this.emitEvent("tool.done", {
            messageId: msgId,
            agentId: agent.id,
            toolCall: tc,
          });
        }

        const toolMsg: ChatMessage = {
          id: `msg_${crypto.randomBytes(4).toString("hex")}`,
          role: "tool",
          agentId: agent.id,
          toolCallId: tc.id,
          toolName: tc.name,
          content: execRes.output,
          timestamp: new Date().toISOString(),
        };
        conversation.push(toolMsg);
      }
      if (!isSubagent) this.persist();
    }

    return (
      lastAssistantMsg ?? {
        id: `msg_${crypto.randomBytes(4).toString("hex")}`,
        role: "assistant",
        agentId: agent.id,
        model: `${provider.id}/${modelId}`,
        content: "(No response generated)",
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Executes multiple specialist security agents concurrently in isolated
   * sub-conversations while sharing the live Finding & HTTP Evidence Ledger.
   */
  public async runSwarm(
    tasks: Array<{ agent: string; objective: string }>,
  ): Promise<string> {
    const providers = this.getProviders();
    const workers: SwarmWorkerState[] = tasks.map((t) => {
      const ag = this.getAgent(t.agent);
      const modelSpec = this.getEffectiveModelForAgent(ag.id);
      return {
        id: `sw_${crypto.randomBytes(3).toString("hex")}`,
        agentId: ag.id,
        model: modelSpec,
        objective: t.objective,
        status: "queued",
        startedAt: new Date().toISOString(),
        toolCallsCount: 0,
        findingsAdded: 0,
      };
    });

    this.session.swarmWorkers.unshift(...workers);
    if (this.session.swarmWorkers.length > 40) {
      this.session.swarmWorkers = this.session.swarmWorkers.slice(0, 40);
    }
    this.persist();
    this.emitEvent("swarm.updated", this.session.swarmWorkers);

    const results = await Promise.all(
      workers.map(async (worker) => {
        worker.status = "running";
        this.emitEvent("swarm.updated", this.session.swarmWorkers);

        const findingsBefore = this.session.findings.length;
        try {
          const agent = this.getAgent(worker.agentId);
          const { provider, modelId } = parseModelSpec(worker.model, providers);
          const subConvo: ChatMessage[] = [
            {
              id: `sub_${crypto.randomBytes(4).toString("hex")}`,
              role: "user",
              agentId: agent.id,
              content: worker.objective,
              timestamp: new Date().toISOString(),
            },
          ];
          const ctrl = new AbortController();
          const finalMsg = await this.runAgentLoop(agent, provider, modelId, subConvo, ctrl.signal, true);
          worker.toolCallsCount = subConvo.filter((m) => m.role === "tool").length;
          worker.findingsAdded = Math.max(0, this.session.findings.length - findingsBefore);
          worker.summary = finalMsg.content.slice(0, 1800);
          worker.status = "completed";
          worker.finishedAt = new Date().toISOString();
          this.persist();
          this.emitEvent("swarm.updated", this.session.swarmWorkers);
          return `### [@${worker.agentId} | ${worker.model} | ${worker.toolCallsCount} tools]\n${finalMsg.content}`;
        } catch (err) {
          worker.status = "failed";
          worker.finishedAt = new Date().toISOString();
          worker.summary = err instanceof Error ? err.message : String(err);
          this.persist();
          this.emitEvent("swarm.updated", this.session.swarmWorkers);
          return `### [@${worker.agentId} FAILED]\n${worker.summary}`;
        }
      }),
    );

    return `SWARM EXECUTION REPORT (${workers.length} workers):\n\n${results.join("\n\n---\n\n")}`;
  }

  public async getSnapshot() {
    const providers = this.getProviders().map((p) => {
      const meta = this.liveModelsMeta.get(p.id);
      const authOrLocalUnavailable =
        meta && !meta.live && /HTTP (401|403)|not running|no local models/i.test(meta.error || "");
      return {
        ...p,
        models: !p.custom && authOrLocalUnavailable ? [] : p.models,
        configuredModels: p.custom ? this.config.customProviders.find((configured) => configured.id === p.id)?.models : undefined,
        connected: isProviderConnected(p),
        liveStatus: meta ? (meta.live ? "live" : "error") : "idle",
        liveError: meta?.error,
        apiKey: p.apiKey && !p.local ? `${p.apiKey.slice(0, 5)}••••${p.apiKey.slice(-3)}` : undefined,
      };
    });
    const ollamaModels = await probeLocalOllamaModels();
    const ollama = providers.find((p) => p.id === "ollama");
    if (ollama && ollamaModels.length > 0) {
      const liveOllamaModels: ProviderModelInfo[] = ollamaModels.map((m) => ({
        id: m,
        name: formatModelDisplayName(m),
        contextWindow: 65536,
        supportsTools: true,
        supportsReasoning: /r1|qwq|thinking|reasoning/i.test(m),
        tags: ["local", "live", "detected"],
      }));
      this.liveModelsCache.set("ollama", liveOllamaModels);
      this.liveModelsMeta.set("ollama", { live: true, updatedAt: new Date().toISOString() });
      ollama.connected = true;
      ollama.liveStatus = "live";
      ollama.liveError = undefined;
      ollama.models = liveOllamaModels;
    }

    const projects = this.getProjects();
    const projectByFolder = new Map(projects.map((p) => [normalizeFolderKey(p.folder), p.id]));
    const fallbackProjId = this.session.projectId || projects[0]?.id;
    const sessions = listSessions().map((s) => ({
      ...s,
      projectId: s.projectId || projectByFolder.get(normalizeFolderKey(s.workspace)) || fallbackProjId,
    }));

    return {
      daemonUrl: this.daemonUrl,
      theme: this.config.theme,
      reasoningEffort: this.session.reasoningEffort || this.config.reasoningEffort || "medium",
      favoriteModels: this.getFavoriteModels(),
      session: this.session,
      sessions,
      projects,
      agents: this.getAgents(),
      providers,
      mcpServers: this.mcpManager.listConfigured(this.config.mcpServers),
      channels: this.channels.getPublicViews(),
      busy: this.busy,
    };
  }
}
