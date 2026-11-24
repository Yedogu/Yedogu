export type ProviderProtocol = "openai" | "anthropic" | "gemini";

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface ProviderModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsReasoning?: boolean;
  reasoningLevels?: ReasoningEffort[];
  inputCostPer1M?: number;
  outputCostPer1M?: number;
  tags?: string[];
}

export interface ProviderConfig {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  envKeys: string[];
  apiKey?: string;
  authSource?: "config" | "env" | "codex-cli" | "claude-cli" | "agy-cli" | "gcloud" | "opencode" | "local";
  headers?: Record<string, string>;
  models: ProviderModelInfo[];
  defaultModel: string;
  local?: boolean;
  custom?: boolean;
}

export type AgentMode = "primary" | "subagent" | "all";

export type ToolPermission = "allow" | "ask" | "deny";

export interface AgentDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  mode: AgentMode;
  color: string;
  badge: string;
  systemPrompt: string;
  preferredModel?: string; // format: "provider/model"
  maxSteps: number;
  temperature: number;
  permissions: Record<string, ToolPermission>;
  builtin?: boolean;
}

export interface ScopeConfig {
  mode: "enforced" | "advisory";
  allow: string[]; // domains, wildcards (*.example.com), CIDRs, URLs, or local paths
  deny: string[];  // explicitly out-of-scope rules
  engagementName: string;
  notes?: string;
}

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "draft" | "validated" | "triaged" | "reported" | "rejected";

export interface FindingRecord {
  id: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  cvssVector?: string;
  cvssScore?: number;
  target: string;
  category: string;
  agentId: string;
  summary: string;
  impact: string;
  reproduction: string;
  remediation: string;
  evidenceIds: string[];
  triageGate: {
    inScope: boolean;
    reproducible: boolean;
    realSecurityImpact: boolean;
    notAlwaysRejected: boolean;
    twoAccountOrOobProven: boolean;
    evidenceRedacted: boolean;
    cvssJustified: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface HttpCapture {
  id: string;
  timestamp: string;
  agentId: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  durationMs: number;
  bodySha256: string;
  securityHeaders: {
    present: string[];
    missing: string[];
  };
  scopeAllowed: boolean;
}

export interface BinaryArtifactSummary {
  id: string;
  timestamp: string;
  path: string;
  format: string;
  architecture: string;
  sizeBytes: number;
  sha256: string;
  entropy: number;
  mitigations: Record<string, boolean | string>;
  sections: Array<{
    name: string;
    virtualAddress?: string;
    size: number;
    entropy: number;
    flags?: string;
  }>;
  highlights: string[];
  interestingStrings: string[];
  entries?: string[];
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  output?: string;
  isError?: boolean;
  durationMs?: number;
  status: "running" | "done" | "error" | "blocked";
}

export type ChannelPlatform = "telegram" | "discord" | "slack" | "webhook";

export interface ChannelConfig {
  id: string;
  name: string;
  platform: ChannelPlatform;
  enabled: boolean;
  autoStart: boolean;
  token: string; // Bot token (Telegram/Discord/Slack xoxb) or Bearer secret (Webhook)
  appToken?: string; // Slack Socket Mode xapp- token
  callbackUrl?: string; // Optional outbound callback URL for generic webhook
  defaultAgent?: string; // Optional override agent for this channel
  allowedUsers: string[]; // Authorized sender IDs
  allowedChats: string[]; // Authorized chat/channel IDs
  allowAll: boolean; // Default false: require pairing or explicit allowlist
  requireMentionInGroups: boolean; // In group chats/servers, only respond on @mention or reply
  pairingCode?: string; // One-time self-authorization code (e.g. YDG-A1B2C3)
  createdAt: string;
  updatedAt: string;
}

export interface ChannelRuntimeStatus {
  id: string;
  name: string;
  platform: ChannelPlatform;
  state: "disconnected" | "connecting" | "connected" | "error";
  botUsername?: string;
  botId?: string;
  lastError?: string;
  messagesIn: number;
  messagesOut: number;
  lastActivityAt?: string;
  webhookPath?: string;
}

export interface ChannelPublicView {
  id: string;
  name: string;
  platform: ChannelPlatform;
  enabled: boolean;
  autoStart: boolean;
  tokenPreview: string;
  hasAppToken?: boolean;
  callbackUrl?: string;
  defaultAgent?: string;
  allowedUsers: string[];
  allowedChats: string[];
  allowAll: boolean;
  requireMentionInGroups: boolean;
  pairingCode?: string;
  status: ChannelRuntimeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MessageSource {
  channelId: string;
  platform: ChannelPlatform;
  senderName: string;
  senderId: string;
  chatId: string;
}

export interface ChatAttachment {
  name: string;
  mimeType: string;
  size: number;
  savedPath?: string;
}

export interface ChatAttachmentInput {
  name: string;
  mimeType: string;
  size: number;
  content: string;
  encoding: "utf8" | "base64";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  agentId?: string;
  model?: string;
  content: string;
  reasoning?: string;
  attachments?: ChatAttachment[];
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
  toolName?: string;
  source?: MessageSource;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  timestamp: string;
}

export interface SwarmWorkerState {
  id: string;
  agentId: string;
  model: string;
  objective: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  toolCallsCount: number;
  findingsAdded: number;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface ProjectConfig {
  id: string;
  name: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionData {
  id: string;
  name: string;
  projectId?: string;
  pinned?: boolean;
  workspace: string;
  activeAgent: string;
  activeModel: string; // "provider/model"
  reasoningEffort?: ReasoningEffort;
  agentModels: Record<string, string>; // per-agent pinned model overrides
  scope: ScopeConfig;
  messages: ChatMessage[];
  findings: FindingRecord[];
  httpHistory: HttpCapture[];
  artifacts: BinaryArtifactSummary[];
  swarmWorkers: SwarmWorkerState[];
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessEvent {
  type:
    | "session.updated"
    | "message.start"
    | "message.delta"
    | "reasoning.delta"
    | "message.done"
    | "tool.start"
    | "tool.done"
    | "http.captured"
    | "artifact.analyzed"
    | "finding.updated"
    | "scope.updated"
    | "swarm.updated"
    | "agent.changed"
    | "model.changed"
    | "provider.updated"
    | "channel.updated"
    | "system.notice";
  sessionId: string;
  timestamp: string;
  payload: unknown;
}
