import crypto from "node:crypto";
import { saveGlobalConfig } from "../config/store.js";
import type { YedoguEngine } from "../agents/orchestrator.js";
import { formatFriendlyError } from "../providers/errors.js";
import type {
  ChannelConfig,
  ChannelPlatform,
  ChannelPublicView,
  ChannelRuntimeStatus,
  MessageSource,
} from "../types.js";
import {
  createInitialRuntimeStatus,
  generatePairingCode,
  maskChannelToken,
  safeEqualSecret,
  type ChannelAdapter,
  type IncomingChannelMessage,
} from "./types.js";
import { TelegramChannelAdapter } from "./telegram.js";
import { DiscordChannelAdapter } from "./discord.js";
import { SlackChannelAdapter } from "./slack.js";
import { WebhookChannelAdapter } from "./webhook.js";

export interface CreateChannelInput {
  id?: string;
  name?: string;
  platform: ChannelPlatform;
  token?: string;
  appToken?: string;
  callbackUrl?: string;
  defaultAgent?: string;
  allowedUsers?: string[];
  allowedChats?: string[];
  allowAll?: boolean;
  requireMentionInGroups?: boolean;
  autoStart?: boolean;
  enabled?: boolean;
}

export interface ChannelAdapterTestOverrides {
  telegramApiBaseUrl?: string;
  telegramPollTimeoutSec?: number;
  discordApiBaseUrl?: string;
  slackApiBaseUrl?: string;
}

export class ChannelManager {
  private readonly adapters = new Map<string, ChannelAdapter>();
  private readonly statuses = new Map<string, ChannelRuntimeStatus>();
  private promptQueue: Promise<void> = Promise.resolve();
  private testOverrides: ChannelAdapterTestOverrides = {};

  constructor(private readonly engine: YedoguEngine) {
    for (const cfg of this.engine.config.channels || []) {
      this.statuses.set(cfg.id, createInitialRuntimeStatus(cfg));
    }
  }

  /** Used in automated tests to point adapters at local mock HTTP servers. */
  public setTestOverrides(overrides: ChannelAdapterTestOverrides): void {
    this.testOverrides = overrides;
  }

  public getConfigs(): ChannelConfig[] {
    if (!this.engine.config.channels) {
      this.engine.config.channels = [];
    }
    return this.engine.config.channels;
  }

  public getConfig(id: string): ChannelConfig | undefined {
    const clean = id.trim().toLowerCase();
    return this.getConfigs().find((c) => c.id.toLowerCase() === clean);
  }

  public getRuntimeStatus(id: string): ChannelRuntimeStatus {
    const cfg = this.getConfig(id);
    const existing = this.statuses.get(id);
    if (existing) return existing;
    if (cfg) {
      const init = createInitialRuntimeStatus(cfg);
      this.statuses.set(cfg.id, init);
      return init;
    }
    return {
      id,
      name: id,
      platform: "webhook",
      state: "disconnected",
      messagesIn: 0,
      messagesOut: 0,
    };
  }

  public getPublicViews(): ChannelPublicView[] {
    return this.getConfigs().map((cfg) => this.toPublicView(cfg));
  }

  public toPublicView(cfg: ChannelConfig): ChannelPublicView {
    return {
      id: cfg.id,
      name: cfg.name,
      platform: cfg.platform,
      enabled: cfg.enabled,
      autoStart: cfg.autoStart,
      tokenPreview: maskChannelToken(cfg.token),
      hasAppToken: Boolean(cfg.appToken),
      callbackUrl: cfg.callbackUrl,
      defaultAgent: cfg.defaultAgent,
      allowedUsers: [...cfg.allowedUsers],
      allowedChats: [...cfg.allowedChats],
      allowAll: cfg.allowAll,
      requireMentionInGroups: cfg.requireMentionInGroups,
      pairingCode: cfg.pairingCode,
      status: { ...this.getRuntimeStatus(cfg.id) },
      createdAt: cfg.createdAt,
      updatedAt: cfg.updatedAt,
    };
  }

  private emitChannelUpdated(id?: string): void {
    this.engine.emitEvent("channel.updated", {
      channelId: id ?? null,
      channels: this.getPublicViews(),
    });
  }

  public upsertChannel(input: CreateChannelInput): ChannelPublicView {
    const platform = input.platform;
    if (!["telegram", "discord", "slack", "webhook"].includes(platform)) {
      throw new Error(`Unsupported channel platform "${platform}". Use telegram, discord, slack, or webhook.`);
    }

    const now = new Date().toISOString();
    const existing = input.id ? this.getConfig(input.id) : undefined;
    const id =
      existing?.id ||
      (input.id
        ? input.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
        : `${platform.slice(0, 3)}_${crypto.randomBytes(3).toString("hex")}`);

    if (!id) throw new Error("Invalid channel ID.");

    // Auto-generate a secure Bearer secret for webhook bridges if none provided
    const resolvedToken =
      (input.token !== undefined ? input.token.trim() : existing?.token) ||
      (platform === "webhook" ? `ydg_wh_${crypto.randomBytes(18).toString("hex")}` : "");

    if (!resolvedToken) {
      throw new Error(`A bot token is required for ${platform}.`);
    }

    const resolvedAppToken =
      input.appToken !== undefined ? input.appToken.trim() || undefined : existing?.appToken;
    if (platform === "slack" && !resolvedAppToken) {
      throw new Error("Slack Socket Mode requires both Bot Token (xoxb-...) and App-Level Token (xapp-...).");
    }

    const allowedUsers =
      input.allowedUsers !== undefined
        ? Array.from(new Set(input.allowedUsers.map((s) => s.trim()).filter(Boolean)))
        : existing?.allowedUsers ?? [];

    const allowedChats =
      input.allowedChats !== undefined
        ? Array.from(new Set(input.allowedChats.map((s) => s.trim()).filter(Boolean)))
        : existing?.allowedChats ?? [];

    const allowAll = input.allowAll ?? existing?.allowAll ?? false;

    // Generate a one-time pairing code whenever no users/chats are allowlisted yet
    const pairingCode =
      existing?.pairingCode ||
      (!allowAll && allowedUsers.length === 0 && allowedChats.length === 0
        ? generatePairingCode()
        : undefined);

    const cfg: ChannelConfig = {
      id,
      name: (input.name || existing?.name || `${platform[0].toUpperCase()}${platform.slice(1)} Bot`).trim(),
      platform,
      enabled: input.enabled ?? existing?.enabled ?? true,
      autoStart: input.autoStart ?? existing?.autoStart ?? true,
      token: resolvedToken,
      appToken: resolvedAppToken,
      callbackUrl: input.callbackUrl !== undefined ? input.callbackUrl.trim() || undefined : existing?.callbackUrl,
      defaultAgent: input.defaultAgent !== undefined ? input.defaultAgent.trim() || undefined : existing?.defaultAgent,
      allowedUsers,
      allowedChats,
      allowAll,
      requireMentionInGroups: input.requireMentionInGroups ?? existing?.requireMentionInGroups ?? true,
      pairingCode,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const list = this.getConfigs();
    const idx = list.findIndex((c) => c.id === id);
    if (idx >= 0) list[idx] = cfg;
    else list.push(cfg);

    if (!this.statuses.has(id)) {
      this.statuses.set(id, createInitialRuntimeStatus(cfg));
    } else {
      const st = this.statuses.get(id)!;
      st.name = cfg.name;
      st.platform = cfg.platform;
    }

    saveGlobalConfig(this.engine.config);
    this.emitChannelUpdated(id);
    return this.toPublicView(cfg);
  }

  public async deleteChannel(id: string): Promise<boolean> {
    const cfg = this.getConfig(id);
    if (!cfg) return false;
    await this.stopChannel(cfg.id);
    this.engine.config.channels = this.getConfigs().filter((c) => c.id !== cfg.id);
    this.statuses.delete(cfg.id);
    saveGlobalConfig(this.engine.config);
    this.emitChannelUpdated(cfg.id);
    return true;
  }

  public rotatePairingCode(id: string): string {
    const cfg = this.getConfig(id);
    if (!cfg) throw new Error(`Channel not found: ${id}`);
    cfg.pairingCode = generatePairingCode();
    cfg.updatedAt = new Date().toISOString();
    saveGlobalConfig(this.engine.config);
    this.emitChannelUpdated(cfg.id);
    return cfg.pairingCode;
  }

  public updateAccessControl(
    id: string,
    action: {
      addUser?: string;
      removeUser?: string;
      addChat?: string;
      removeChat?: string;
      allowAll?: boolean;
      requireMentionInGroups?: boolean;
      defaultAgent?: string;
    },
  ): ChannelPublicView {
    const cfg = this.getConfig(id);
    if (!cfg) throw new Error(`Channel not found: ${id}`);

    if (action.addUser?.trim()) {
      const u = action.addUser.trim();
      if (!cfg.allowedUsers.includes(u)) cfg.allowedUsers.push(u);
    }
    if (action.removeUser?.trim()) {
      cfg.allowedUsers = cfg.allowedUsers.filter((u) => u !== action.removeUser!.trim());
    }
    if (action.addChat?.trim()) {
      const ch = action.addChat.trim();
      if (!cfg.allowedChats.includes(ch)) cfg.allowedChats.push(ch);
    }
    if (action.removeChat?.trim()) {
      cfg.allowedChats = cfg.allowedChats.filter((ch) => ch !== action.removeChat!.trim());
    }
    if (typeof action.allowAll === "boolean") {
      cfg.allowAll = action.allowAll;
    }
    if (typeof action.requireMentionInGroups === "boolean") {
      cfg.requireMentionInGroups = action.requireMentionInGroups;
    }
    if (action.defaultAgent !== undefined) {
      cfg.defaultAgent = action.defaultAgent.trim() || undefined;
    }

    cfg.updatedAt = new Date().toISOString();
    saveGlobalConfig(this.engine.config);
    this.emitChannelUpdated(cfg.id);
    return this.toPublicView(cfg);
  }

  private buildAdapter(cfg: ChannelConfig): ChannelAdapter {
    const callbacks = {
      onMessage: (msg: IncomingChannelMessage) => this.handleIncomingMessage(msg),
      onStatusChange: (patch: Partial<ChannelRuntimeStatus>) => {
        const cur = this.getRuntimeStatus(cfg.id);
        Object.assign(cur, patch);
        this.statuses.set(cfg.id, cur);
        this.emitChannelUpdated(cfg.id);
      },
      onNotice: (level: "info" | "warn" | "error", message: string) => {
        this.engine.emitEvent("system.notice", { level, message });
      },
    };

    switch (cfg.platform) {
      case "telegram":
        return new TelegramChannelAdapter(cfg, callbacks, {
          apiBaseUrl: this.testOverrides.telegramApiBaseUrl,
          pollTimeoutSec: this.testOverrides.telegramPollTimeoutSec,
        });
      case "discord":
        return new DiscordChannelAdapter(cfg, callbacks, {
          apiBaseUrl: this.testOverrides.discordApiBaseUrl,
        });
      case "slack":
        return new SlackChannelAdapter(cfg, callbacks, {
          apiBaseUrl: this.testOverrides.slackApiBaseUrl,
        });
      case "webhook":
        return new WebhookChannelAdapter(cfg, callbacks);
    }
  }

  public async startChannel(id: string): Promise<ChannelPublicView> {
    const cfg = this.getConfig(id);
    if (!cfg) throw new Error(`Channel not found: ${id}`);

    // Stop any previous instance cleanly
    if (this.adapters.has(cfg.id)) {
      await this.stopChannel(cfg.id);
    }

    cfg.enabled = true;
    saveGlobalConfig(this.engine.config);

    const adapter = this.buildAdapter(cfg);
    this.adapters.set(cfg.id, adapter);

    try {
      await adapter.start();
    } catch (err) {
      this.adapters.delete(cfg.id);
      const msg = err instanceof Error ? err.message : String(err);
      const st = this.getRuntimeStatus(cfg.id);
      st.state = "error";
      st.lastError = msg;
      this.emitChannelUpdated(cfg.id);
      throw err;
    }

    return this.toPublicView(cfg);
  }

  public async stopChannel(id: string): Promise<ChannelPublicView | null> {
    const cfg = this.getConfig(id);
    const adapter = this.adapters.get(id);
    if (adapter) {
      this.adapters.delete(id);
      await adapter.stop().catch(() => {});
    }
    if (cfg) {
      cfg.enabled = false;
      saveGlobalConfig(this.engine.config);
      const st = this.getRuntimeStatus(cfg.id);
      st.state = "disconnected";
      this.emitChannelUpdated(cfg.id);
      return this.toPublicView(cfg);
    }
    return null;
  }

  public async startAutoChannels(): Promise<void> {
    const targets = this.getConfigs().filter((c) => c.enabled && c.autoStart);
    for (const cfg of targets) {
      if (this.adapters.has(cfg.id)) continue;
      this.startChannel(cfg.id).catch((err) => {
        this.engine.emitEvent("system.notice", {
          level: "warn",
          message: `Auto-start failed for channel "${cfg.name}" (${cfg.platform}): ${err instanceof Error ? err.message : String(err)}`,
        });
      });
    }
  }

  public async stopAll(): Promise<void> {
    const running = Array.from(this.adapters.entries());
    this.adapters.clear();
    await Promise.all(
      running.map(async ([id, adapter]) => {
        await adapter.stop().catch(() => {});
        const st = this.statuses.get(id);
        if (st) st.state = "disconnected";
      }),
    );
  }

  /**
   * Handles inbound HTTP POST to `/api/channels/webhook/:id`.
   */
  public async handleWebhookRequest(
    channelId: string,
    headers: Record<string, string | string[] | undefined>,
    body: Record<string, unknown>,
  ): Promise<{
    statusCode: number;
    payload: Record<string, unknown>;
  }> {
    const cfg = this.getConfig(channelId);
    if (!cfg || cfg.platform !== "webhook") {
      return { statusCode: 404, payload: { error: `Webhook channel "${channelId}" not found.` } };
    }

    const st = this.getRuntimeStatus(cfg.id);
    if (st.state !== "connected") {
      return { statusCode: 503, payload: { error: `Webhook channel "${cfg.id}" is stopped.` } };
    }

    // Verify Bearer or X-Yedogu-Secret
    const authRaw = Array.isArray(headers["authorization"])
      ? headers["authorization"][0]
      : headers["authorization"] || "";
    const bearer = authRaw.startsWith("Bearer ") ? authRaw.slice(7).trim() : "";
    const xSecret = Array.isArray(headers["x-yedogu-secret"])
      ? headers["x-yedogu-secret"][0]
      : headers["x-yedogu-secret"] || "";
    const supplied = bearer || xSecret || "";

    if (!supplied || !safeEqualSecret(supplied, cfg.token)) {
      return { statusCode: 401, payload: { error: "Invalid webhook secret." } };
    }

    const text = String(body.text ?? body.message ?? body.prompt ?? "").trim();
    if (!text) {
      return { statusCode: 400, payload: { error: "Missing 'text' or 'message' field in JSON body." } };
    }

    const senderId = String(body.senderId ?? body.userId ?? "webhook-user");
    const senderName = String(body.senderName ?? body.username ?? senderId);
    const chatId = String(body.chatId ?? body.channelId ?? "webhook-chat");

    let capturedReply = "";
    const incoming: IncomingChannelMessage = {
      channelId: cfg.id,
      platform: "webhook",
      chatId,
      senderId,
      senderName,
      text,
      isGroup: false,
      wasMentioned: true,
      reply: async (replyText: string) => {
        capturedReply = capturedReply ? `${capturedReply}\n\n${replyText}` : replyText;
        if (cfg.callbackUrl) {
          await fetch(cfg.callbackUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Yedogu-Channel": cfg.id,
            },
            body: JSON.stringify({
              channelId: cfg.id,
              chatId,
              senderId,
              reply: replyText,
              sessionId: this.engine.session.id,
              agentId: this.engine.session.activeAgent,
            }),
          }).catch(() => {});
        }
      },
    };

    await this.handleIncomingMessage(incoming);

    return {
      statusCode: 200,
      payload: {
        ok: true,
        channelId: cfg.id,
        sessionId: this.engine.session.id,
        agentId: this.engine.session.activeAgent,
        model: this.engine.getEffectiveModelForAgent(this.engine.session.activeAgent),
        reply: capturedReply,
      },
    };
  }

  /**
   * Unified inbound pipeline for Telegram, Discord, Slack, and Webhook messages:
   * Group-mention check -> Pairing/Allowlist security gate -> Remote commands -> Serialized AI execution.
   */
  public async handleIncomingMessage(msg: IncomingChannelMessage): Promise<void> {
    const cfg = this.getConfig(msg.channelId);
    if (!cfg) return;

    // 1. Respect group mention requirement (always allow explicit /pair even in groups)
    const isPairCmd = /^\/pair(\s+|$)/i.test(msg.text);
    if (msg.isGroup && cfg.requireMentionInGroups && !msg.wasMentioned && !isPairCmd) {
      return;
    }

    const status = this.getRuntimeStatus(cfg.id);
    status.messagesIn += 1;
    status.lastActivityAt = new Date().toISOString();
    this.emitChannelUpdated(cfg.id);

    const sendReply = async (text: string) => {
      await msg.reply(text);
      status.messagesOut += 1;
      status.lastActivityAt = new Date().toISOString();
      this.emitChannelUpdated(cfg.id);
    };

    // 2. Pairing command (self-authorization via one-time code shown in YEDOGU)
    if (isPairCmd) {
      const code = msg.text.replace(/^\/pair\s*/i, "").trim().toUpperCase();
      if (!cfg.pairingCode) {
        await sendReply(
          "No active pairing code on this channel. Generate one in YEDOGU via `/channels` (or the War-Room UI).",
        );
        return;
      }
      if (!code || !safeEqualSecret(code, cfg.pairingCode.toUpperCase())) {
        await sendReply("Invalid pairing code.");
        return;
      }

      if (!cfg.allowedUsers.includes(msg.senderId)) {
        cfg.allowedUsers.push(msg.senderId);
      }
      // Consume one-time code so a leaked chat log cannot authorize anyone else
      cfg.pairingCode = undefined;
      cfg.updatedAt = new Date().toISOString();
      saveGlobalConfig(this.engine.config);
      this.emitChannelUpdated(cfg.id);
      this.engine.emitEvent("system.notice", {
        level: "info",
        message: `Paired ${cfg.platform} user ${msg.senderName} (${msg.senderId}) on "${cfg.name}".`,
      });
      await sendReply(
        `Paired with YEDOGU! Your ${cfg.platform} ID (${msg.senderId}) is now authorized.\n` +
          `Active agent: @${this.engine.session.activeAgent} (${this.engine.getEffectiveModelForAgent(this.engine.session.activeAgent)})\n` +
          `Text me anything, prefix with @recon / @web-hunter / @reverser, or type /help for commands.`,
      );
      return;
    }

    // 3. Access Control Gate (deny-by-default for security since YEDOGU has shell/FS/HTTP tools)
    const authorized =
      cfg.allowAll ||
      cfg.allowedUsers.includes(msg.senderId) ||
      cfg.allowedChats.includes(msg.chatId);

    if (!authorized) {
      this.engine.emitEvent("system.notice", {
        level: "warn",
        message: `Blocked unauthorized ${cfg.platform} message from ${msg.senderName} (userId=${msg.senderId}, chatId=${msg.chatId}) on "${cfg.name}". Pair via /pair or run: /channels allow ${cfg.id} ${msg.senderId}`,
      });
      await sendReply(
        `Unauthorized sender (ID: ${msg.senderId}).\n` +
          `To connect, send \`/pair <CODE>\` using the pairing code shown in YEDOGU (/channels), ` +
          `or ask the operator to allow your ID.`,
      );
      return;
    }

    // 4. Built-in Remote Control Slash Commands
    if (msg.text.startsWith("/")) {
      const handled = await this.handleRemoteCommand(msg, cfg, sendReply);
      if (handled) return;
    }

    // 5. Route directly to YEDOGU AI (serialized queue to avoid clobbering concurrent runs)
    const runTask = async () => {
      // Wait briefly if terminal/browser is mid-turn
      let waitTicks = 0;
      while (this.engine.busy && waitTicks < 120) {
        await new Promise((r) => setTimeout(r, 500));
        waitTicks++;
      }

      let typingTimer: ReturnType<typeof setInterval> | null = null;
      if (msg.sendTyping) {
        void msg.sendTyping();
        typingTimer = setInterval(() => {
          void msg.sendTyping?.();
        }, 4500);
      }

      try {
        const source: MessageSource = {
          channelId: cfg.id,
          platform: cfg.platform,
          senderName: msg.senderName,
          senderId: msg.senderId,
          chatId: msg.chatId,
        };

        const beforeCount = this.engine.session.messages.length;
        const finalMsg = await this.engine.sendPrompt(msg.text, cfg.defaultAgent, source);

        // Count any tool calls executed during this turn
        const turnMessages = this.engine.session.messages.slice(beforeCount);
        const toolCount = turnMessages.filter((m) => m.role === "tool").length;

        let outText = (finalMsg.content || "").trim() || "(Completed with no text output)";
        if (toolCount > 0) {
          outText += `\n\n— @${finalMsg.agentId || this.engine.session.activeAgent} · ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
        }
        await sendReply(outText);
      } catch (err) {
        const friendly = formatFriendlyError(err);
        this.engine.emitEvent("system.notice", {
          level: "error",
          message: `[${cfg.name}] ${friendly}`,
        });
        await sendReply(friendly).catch(() => {});
      } finally {
        if (typingTimer) clearInterval(typingTimer);
      }
    };

    const next = this.promptQueue.then(runTask, runTask);
    this.promptQueue = next.catch(() => {});
    await next;
  }

  private async handleRemoteCommand(
    msg: IncomingChannelMessage,
    cfg: ChannelConfig,
    sendReply: (text: string) => Promise<void>,
  ): Promise<boolean> {
    const parts = msg.text.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const rest = msg.text.slice(parts[0].length).trim();

    switch (cmd) {
      case "/start":
      case "/help": {
        const agent = this.engine.session.activeAgent;
        const model = this.engine.getEffectiveModelForAgent(agent);
        await sendReply(
          [
            `YEDOGU Remote Bridge (${cfg.platform})`,
            `Active: @${agent} · ${model}`,
            "",
            "Just send any message to chat with the AI directly.",
            "Prefix with @recon, @web-hunter, @reverser, @exploit-dev, @cloud-iam, @web3-auditor, or @triage-report for one-shot specialist routing.",
            "",
            "Remote commands:",
            "/status — Session, model, scope & findings telemetry",
            "/agent [id] — List or switch active specialist agent",
            "/model [provider/model] — Show or switch model",
            "/findings — Summary of recorded findings",
            "/new [name] — Start a fresh session",
            "/abort — Stop active generation",
          ].join("\n"),
        );
        return true;
      }

      case "/status": {
        const s = this.engine.session;
        const model = this.engine.getEffectiveModelForAgent(s.activeAgent);
        await sendReply(
          [
            `Session: ${s.id} (${s.name})`,
            `Workspace: ${s.workspace}`,
            `Agent: @${s.activeAgent}`,
            `Model: ${model}`,
            `Scope: ${s.scope.mode.toUpperCase()} (${s.scope.allow.length} allow, ${s.scope.deny.length} deny)`,
            `Findings: ${s.findings.length} | HTTP: ${s.httpHistory.length} | Artifacts: ${s.artifacts.length}`,
            `Busy: ${this.engine.busy ? "yes" : "no"}`,
          ].join("\n"),
        );
        return true;
      }

      case "/agent":
      case "/agents": {
        if (args.length === 0) {
          const list = this.engine
            .getAgents()
            .map((a) => `${a.id === this.engine.session.activeAgent ? "• " : "  "}@${a.id} — ${a.title}`)
            .join("\n");
          await sendReply(`Specialist Agents:\n${list}\n\nSwitch with: /agent <id>`);
          return true;
        }
        try {
          const switched = this.engine.setActiveAgent(args[0]);
          await sendReply(`Switched active agent to @${switched.id} (${switched.title}).`);
        } catch (err) {
          await sendReply(err instanceof Error ? err.message : String(err));
        }
        return true;
      }

      case "/model":
      case "/models": {
        if (args.length === 0) {
          const cur = this.engine.getEffectiveModelForAgent(this.engine.session.activeAgent);
          const connected = this.engine.getConnectedProviders();
          const lines = [`Active model: ${cur}`, ""];
          if (connected.length > 0) {
            lines.push("Available on connected providers:");
            for (const p of connected) {
              const sample = p.models.slice(0, 4).map((m) => `${p.id}/${m.id}`).join(", ");
              lines.push(`• ${p.id}: ${sample}`);
            }
          } else {
            lines.push("No providers connected yet. Run /connect in YEDOGU.");
          }
          lines.push("", "Switch with: /model <provider/model>");
          await sendReply(lines.join("\n"));
          return true;
        }
        try {
          const normalized = this.engine.setModel(args[0]);
          await sendReply(`Switched model to ${normalized}.`);
        } catch (err) {
          await sendReply(formatFriendlyError(err));
        }
        return true;
      }

      case "/findings": {
        const list = this.engine.session.findings;
        if (list.length === 0) {
          await sendReply("No findings recorded in this session yet.");
          return true;
        }
        const summary = list
          .slice(0, 15)
          .map(
            (f) =>
              `[${f.severity.toUpperCase()}${f.cvssScore !== undefined ? ` ${f.cvssScore}` : ""}] ${f.title} (${f.target})`,
          )
          .join("\n");
        await sendReply(`Findings (${list.length}):\n${summary}`);
        return true;
      }

      case "/new": {
        const s = this.engine.newSession(rest || undefined);
        await sendReply(`Started new session: ${s.id} (${s.name})`);
        return true;
      }

      case "/abort": {
        const aborted = this.engine.abortActive();
        await sendReply(aborted ? "Aborted active AI generation." : "No active generation to abort.");
        return true;
      }

      case "/ask": {
        // Optional explicit /ask <prompt> wrapper (helpful in group chats)
        if (!rest) {
          await sendReply("Usage: /ask <your prompt>");
          return true;
        }
        msg.text = rest;
        return false; // Fall through to AI execution
      }

      default:
        // Unknown slash text: pass through to the AI (e.g. "/api/v1/users looks vulnerable")
        return false;
    }
  }
}
