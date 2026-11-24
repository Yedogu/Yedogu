import type { ChannelConfig } from "../types.js";
import {
  splitMessageChunks,
  type ChannelAdapter,
  type ChannelAdapterCallbacks,
  type IncomingChannelMessage,
} from "./types.js";

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  bot?: boolean;
}

interface DiscordMessageCreate {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: DiscordUser;
  content: string;
  mentions?: DiscordUser[];
  referenced_message?: { author?: DiscordUser } | null;
}

interface DiscordGatewayPayload {
  op: number;
  d: any;
  s?: number | null;
  t?: string | null;
}

// Intents: GUILDS (1<<0) | GUILD_MESSAGES (1<<9) | DIRECT_MESSAGES (1<<12) | MESSAGE_CONTENT (1<<15)
const INTENTS_FULL = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15);
const INTENTS_NO_CONTENT = (1 << 0) | (1 << 9) | (1 << 12);

export class DiscordChannelAdapter implements ChannelAdapter {
  public readonly id: string;
  public readonly platform = "discord" as const;

  private running = false;
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeq: number | null = null;
  private botId = "";
  private botUsername = "";
  private intents = INTENTS_FULL;
  private backoffMs = 2000;
  private readonly apiBaseUrl: string;

  constructor(
    private readonly config: ChannelConfig,
    private readonly callbacks: ChannelAdapterCallbacks,
    opts?: { apiBaseUrl?: string },
  ) {
    this.id = config.id;
    this.apiBaseUrl = (opts?.apiBaseUrl || "https://discord.com/api/v10").replace(/\/+$/, "");
  }

  private async restCall<T>(method: string, route: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.apiBaseUrl}${route}`, {
      method,
      headers: {
        Authorization: `Bot ${this.config.token.trim()}`,
        "Content-Type": "application/json",
        "User-Agent": "YEDOGU (https://github.com/yedogu, 1.0.0)",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && typeof data === "object" && "message" in data)
        ? String((data as { message?: string }).message)
        : `HTTP ${res.status}`;
      throw new Error(`Discord ${method} ${route} failed: ${msg}`);
    }
    return data as T;
  }

  public async start(): Promise<void> {
    if (this.running) return;
    if (!this.config.token?.trim()) {
      throw new Error("Discord bot token is required.");
    }
    if (typeof globalThis.WebSocket !== "function") {
      throw new Error("Global WebSocket is unavailable in this Node.js runtime (requires Node >= 22).");
    }

    this.callbacks.onStatusChange({ state: "connecting", lastError: undefined });

    const me = await this.restCall<DiscordUser>("GET", "/users/@me");
    this.botId = me.id;
    this.botUsername = me.username;

    const gw = await this.restCall<{ url: string }>("GET", "/gateway/bot");
    const gwUrl = `${gw.url.replace(/\/+$/, "")}/?v=10&encoding=json`;

    this.running = true;
    this.backoffMs = 2000;
    this.connectGateway(gwUrl);
  }

  public async stop(): Promise<void> {
    this.running = false;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, "YEDOGU stopping");
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.callbacks.onStatusChange({ state: "disconnected" });
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private connectGateway(gwUrl: string): void {
    if (!this.running) return;
    this.clearTimers();

    const ws = new WebSocket(gwUrl);
    this.ws = ws;

    ws.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      let payload: DiscordGatewayPayload;
      try {
        payload = JSON.parse(raw) as DiscordGatewayPayload;
      } catch {
        return;
      }

      if (payload.s !== undefined && payload.s !== null) {
        this.lastSeq = payload.s;
      }

      switch (payload.op) {
        case 10: {
          // Hello -> begin heartbeat & Identify
          const interval = Number(payload.d?.heartbeat_interval || 41250);
          this.startHeartbeat(interval);
          this.sendGateway({
            op: 2,
            d: {
              token: this.config.token.trim(),
              intents: this.intents,
              properties: {
                os: process.platform,
                browser: "yedogu",
                device: "yedogu",
              },
            },
          });
          break;
        }
        case 1: {
          // Immediate heartbeat request
          this.sendGateway({ op: 1, d: this.lastSeq });
          break;
        }
        case 7: {
          // Reconnect requested by Discord
          ws.close(4000, "Reconnect requested");
          break;
        }
        case 9: {
          // Invalid session
          this.lastSeq = null;
          ws.close(4000, "Invalid session");
          break;
        }
        case 0: {
          if (payload.t === "READY") {
            const user = payload.d?.user as DiscordUser | undefined;
            if (user) {
              this.botId = user.id;
              this.botUsername = user.username;
            }
            this.backoffMs = 2000;
            this.callbacks.onStatusChange({
              state: "connected",
              botId: this.botId,
              botUsername: `@${this.botUsername}`,
              lastError: undefined,
            });
            this.callbacks.onNotice(
              "info",
              `Discord bot @${this.botUsername} connected to Gateway v10.`,
            );
          } else if (payload.t === "MESSAGE_CREATE") {
            void this.handleMessageCreate(payload.d as DiscordMessageCreate);
          }
          break;
        }
      }
    });

    ws.addEventListener("close", (ev) => {
      this.clearTimers();
      this.ws = null;
      if (!this.running) return;

      // 4004 = Authentication failed
      if (ev.code === 4004) {
        this.running = false;
        const msg = "Discord authentication failed (code 4004). Verify your Bot Token.";
        this.callbacks.onStatusChange({ state: "error", lastError: msg });
        this.callbacks.onNotice("error", msg);
        return;
      }

      // 4014 = Disallowed Intent (Message Content Intent not toggled in Dev Portal)
      if (ev.code === 4014 && this.intents === INTENTS_FULL) {
        this.intents = INTENTS_NO_CONTENT;
        this.callbacks.onNotice(
          "warn",
          "Discord Message Content Intent (4014) is disabled in Developer Portal — reconnecting in DM/mention-only mode. Enable Message Content Intent for full server channel messages.",
        );
        this.reconnectTimer = setTimeout(() => this.connectGateway(gwUrl), 1500);
        return;
      }

      const reason = `Gateway closed (${ev.code}${ev.reason ? `: ${ev.reason}` : ""})`;
      this.callbacks.onStatusChange({ state: "connecting", lastError: reason });
      const wait = this.backoffMs;
      this.backoffMs = Math.min(30_000, this.backoffMs * 2);
      this.reconnectTimer = setTimeout(() => this.connectGateway(gwUrl), wait);
    });

    ws.addEventListener("error", () => {
      // Close handler manages reconnect & error state
    });
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.sendGateway({ op: 1, d: this.lastSeq });
    }, intervalMs);
  }

  private sendGateway(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private async handleMessageCreate(msg: DiscordMessageCreate): Promise<void> {
    if (!msg.author || msg.author.bot || msg.author.id === this.botId) return;

    const isGroup = Boolean(msg.guild_id);
    const mentionedInList = Boolean(msg.mentions?.some((u) => u.id === this.botId));
    const isReplyToBot = Boolean(msg.referenced_message?.author?.id === this.botId);
    const mentionRegex = this.botId ? new RegExp(`<@!?${this.botId}>`, "g") : null;
    const rawContent = (msg.content || "").trim();
    const mentionedInText = Boolean(mentionRegex && mentionRegex.test(rawContent));
    const wasMentioned = !isGroup || mentionedInList || mentionedInText || isReplyToBot;

    const cleanText = (mentionRegex ? rawContent.replace(mentionRegex, "") : rawContent).trim();
    if (!cleanText) return;

    const senderName = msg.author.global_name || msg.author.username || msg.author.id;

    const incoming: IncomingChannelMessage = {
      channelId: this.id,
      platform: "discord",
      chatId: msg.channel_id,
      senderId: msg.author.id,
      senderName,
      text: cleanText,
      isGroup,
      wasMentioned,
      messageId: msg.id,
      reply: async (replyText: string) => {
        await this.sendChunkedReply(msg.channel_id, replyText, msg.id);
      },
      sendTyping: async () => {
        await this.restCall("POST", `/channels/${encodeURIComponent(msg.channel_id)}/typing`).catch(
          () => {},
        );
      },
    };

    await this.callbacks.onMessage(incoming);
  }

  private async sendChunkedReply(
    channelId: string,
    text: string,
    replyToMessageId?: string,
  ): Promise<void> {
    const chunks = splitMessageChunks(text, 1900);
    for (let i = 0; i < chunks.length; i++) {
      const payload: Record<string, unknown> = { content: chunks[i] };
      if (i === 0 && replyToMessageId) {
        payload.message_reference = {
          message_id: replyToMessageId,
          fail_if_not_exists: false,
        };
      }
      await this.restCall("POST", `/channels/${encodeURIComponent(channelId)}/messages`, payload);
    }
  }
}
