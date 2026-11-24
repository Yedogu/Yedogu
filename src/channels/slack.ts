import type { ChannelConfig } from "../types.js";
import {
  splitMessageChunks,
  type ChannelAdapter,
  type ChannelAdapterCallbacks,
  type IncomingChannelMessage,
} from "./types.js";

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  url?: string;
  user_id?: string;
  bot_id?: string;
  user?: string;
  team?: string;
}

interface SlackSocketEnvelope {
  envelope_id?: string;
  type: string;
  payload?: {
    event?: {
      type: string;
      subtype?: string;
      bot_id?: string;
      user?: string;
      text?: string;
      channel?: string;
      channel_type?: string;
      ts?: string;
      thread_ts?: string;
    };
  };
}

export class SlackChannelAdapter implements ChannelAdapter {
  public readonly id: string;
  public readonly platform = "slack" as const;

  private running = false;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private botUserId = "";
  private botName = "";
  private backoffMs = 2000;
  private readonly apiBaseUrl: string;
  private readonly seenEvents = new Set<string>();

  constructor(
    private readonly config: ChannelConfig,
    private readonly callbacks: ChannelAdapterCallbacks,
    opts?: { apiBaseUrl?: string },
  ) {
    this.id = config.id;
    this.apiBaseUrl = (opts?.apiBaseUrl || "https://slack.com/api").replace(/\/+$/, "");
  }

  private async slackPost(
    method: string,
    token: string,
    body?: Record<string, unknown>,
  ): Promise<SlackApiResponse> {
    const res = await fetch(`${this.apiBaseUrl}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: body ? JSON.stringify(body) : "{}",
    });
    const data = (await res.json().catch(() => null)) as SlackApiResponse | null;
    if (!res.ok || !data || !data.ok) {
      throw new Error(`Slack ${method} failed: ${data?.error || `HTTP ${res.status}`}`);
    }
    return data;
  }

  public async start(): Promise<void> {
    if (this.running) return;
    if (!this.config.token?.trim()) {
      throw new Error("Slack Bot Token (xoxb-...) is required.");
    }
    if (!this.config.appToken?.trim()) {
      throw new Error("Slack App-Level Token (xapp-...) with connections:write is required for Socket Mode.");
    }
    if (typeof globalThis.WebSocket !== "function") {
      throw new Error("Global WebSocket is unavailable in this Node.js runtime (requires Node >= 22).");
    }

    this.callbacks.onStatusChange({ state: "connecting", lastError: undefined });

    const auth = await this.slackPost("auth.test", this.config.token);
    this.botUserId = auth.user_id || auth.bot_id || "";
    this.botName = auth.user || "slack-bot";

    this.running = true;
    this.backoffMs = 2000;
    await this.openSocket();
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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

  private async openSocket(): Promise<void> {
    if (!this.running) return;
    try {
      const conn = await this.slackPost("apps.connections.open", this.config.appToken!);
      if (!conn.url) throw new Error("Slack did not return a Socket Mode WebSocket URL.");

      const ws = new WebSocket(conn.url);
      this.ws = ws;

      ws.addEventListener("message", (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
        let env: SlackSocketEnvelope;
        try {
          env = JSON.parse(raw) as SlackSocketEnvelope;
        } catch {
          return;
        }

        // Always ACK envelopes immediately so Slack doesn't retry
        if (env.envelope_id && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ envelope_id: env.envelope_id }));
        }

        if (env.type === "hello") {
          this.backoffMs = 2000;
          this.callbacks.onStatusChange({
            state: "connected",
            botId: this.botUserId,
            botUsername: `@${this.botName}`,
            lastError: undefined,
          });
          this.callbacks.onNotice("info", `Slack bot @${this.botName} connected (Socket Mode).`);
        } else if (env.type === "disconnect") {
          ws.close(4000, "Slack requested disconnect");
        } else if (env.type === "events_api" && env.payload?.event) {
          void this.handleEvent(env.payload.event);
        }
      });

      ws.addEventListener("close", () => {
        this.ws = null;
        if (!this.running) return;
        this.callbacks.onStatusChange({ state: "connecting" });
        const wait = this.backoffMs;
        this.backoffMs = Math.min(30_000, this.backoffMs * 2);
        this.reconnectTimer = setTimeout(() => void this.openSocket(), wait);
      });

      ws.addEventListener("error", () => {
        // Handled by close event
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onStatusChange({ state: "error", lastError: msg });
      this.callbacks.onNotice("error", `Slack connection failed: ${msg}`);
      if (this.running) {
        const wait = this.backoffMs;
        this.backoffMs = Math.min(30_000, this.backoffMs * 2);
        this.reconnectTimer = setTimeout(() => void this.openSocket(), wait);
      }
    }
  }

  private async handleEvent(
    event: NonNullable<NonNullable<SlackSocketEnvelope["payload"]>["event"]>,
  ): Promise<void> {
    if (event.type !== "message" && event.type !== "app_mention") return;
    if (event.subtype || event.bot_id || !event.user || event.user === this.botUserId) return;
    if (!event.channel || !event.text) return;

    // Deduplicate when both `message` and `app_mention` fire for the same ts
    const dedupKey = `${event.channel}:${event.ts || ""}`;
    if (event.ts) {
      if (this.seenEvents.has(dedupKey)) return;
      this.seenEvents.add(dedupKey);
      if (this.seenEvents.size > 500) {
        const first = this.seenEvents.values().next().value;
        if (first) this.seenEvents.delete(first);
      }
    }

    const isDm = event.channel_type === "im" || event.channel.startsWith("D");
    const isGroup = !isDm;
    const mentionTag = this.botUserId ? `<@${this.botUserId}>` : "";
    const wasMentioned =
      !isGroup || event.type === "app_mention" || (Boolean(mentionTag) && event.text.includes(mentionTag));

    const cleanText = mentionTag
      ? event.text.split(mentionTag).join("").trim()
      : event.text.trim();
    if (!cleanText) return;

    const replyThread = isGroup ? event.thread_ts || event.ts : undefined;

    const incoming: IncomingChannelMessage = {
      channelId: this.id,
      platform: "slack",
      chatId: event.channel,
      senderId: event.user,
      senderName: event.user,
      text: cleanText,
      isGroup,
      wasMentioned,
      messageId: event.ts,
      threadId: replyThread,
      reply: async (replyText: string) => {
        const chunks = splitMessageChunks(replyText, 3500);
        for (const chunk of chunks) {
          await this.slackPost("chat.postMessage", this.config.token, {
            channel: event.channel,
            text: chunk,
            ...(replyThread ? { thread_ts: replyThread } : {}),
          });
        }
      },
    };

    await this.callbacks.onMessage(incoming);
  }
}
