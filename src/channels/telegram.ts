import type { ChannelConfig } from "../types.js";
import {
  splitMessageChunks,
  type ChannelAdapter,
  type ChannelAdapterCallbacks,
  type IncomingChannelMessage,
} from "./types.js";

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: {
    id: number;
    type: "private" | "group" | "supergroup" | "channel";
    title?: string;
    username?: string;
  };
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export class TelegramChannelAdapter implements ChannelAdapter {
  public readonly id: string;
  public readonly platform = "telegram" as const;

  private running = false;
  private abortController: AbortController | null = null;
  private pollOffset = 0;
  private botId = "";
  private botUsername = "";
  private readonly apiBaseUrl: string;
  private readonly pollTimeoutSec: number;

  constructor(
    private readonly config: ChannelConfig,
    private readonly callbacks: ChannelAdapterCallbacks,
    opts?: { apiBaseUrl?: string; pollTimeoutSec?: number },
  ) {
    this.id = config.id;
    this.apiBaseUrl = (opts?.apiBaseUrl || "https://api.telegram.org").replace(/\/+$/, "");
    this.pollTimeoutSec = opts?.pollTimeoutSec ?? 25;
  }

  private endpoint(method: string): string {
    return `${this.apiBaseUrl}/bot${encodeURIComponent(this.config.token)}/${method}`;
  }

  private async apiCall<T>(
    method: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await fetch(this.endpoint(method), {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    const data = (await res.json().catch(() => null)) as TelegramApiResponse<T> | null;
    if (!res.ok || !data || !data.ok) {
      const desc = data?.description || `HTTP ${res.status}`;
      const err = new Error(`Telegram ${method} failed: ${desc}`) as Error & { code?: number };
      err.code = data?.error_code ?? res.status;
      throw err;
    }
    return data.result as T;
  }

  public async start(): Promise<void> {
    if (this.running) return;
    if (!this.config.token?.trim()) {
      throw new Error("Telegram bot token is required.");
    }

    this.callbacks.onStatusChange({ state: "connecting", lastError: undefined });

    const me = await this.apiCall<TelegramUser>("getMe");
    this.botId = String(me.id);
    this.botUsername = me.username || me.first_name || `bot_${me.id}`;

    // Clear any stale webhook silently so long-polling getUpdates works reliably
    await this.apiCall("deleteWebhook", { drop_pending_updates: false }).catch(() => {
      // Ignore if test mock doesn't implement deleteWebhook
    });

    this.running = true;
    this.abortController = new AbortController();
    this.callbacks.onStatusChange({
      state: "connected",
      botId: this.botId,
      botUsername: `@${this.botUsername.replace(/^@/, "")}`,
      lastError: undefined,
    });
    this.callbacks.onNotice(
      "info",
      `Telegram bot @${this.botUsername.replace(/^@/, "")} connected (long-polling).`,
    );

    void this.pollLoop();
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.callbacks.onStatusChange({ state: "disconnected" });
  }

  private async pollLoop(): Promise<void> {
    let backoffMs = 1500;

    while (this.running) {
      try {
        const updates = await this.apiCall<TelegramUpdate[]>(
          "getUpdates",
          {
            offset: this.pollOffset,
            timeout: this.pollTimeoutSec,
            allowed_updates: ["message"],
          },
          this.abortController?.signal,
        );
        backoffMs = 1500;

        for (const upd of updates || []) {
          if (upd.update_id >= this.pollOffset) {
            this.pollOffset = upd.update_id + 1;
          }
          if (upd.message) {
            void this.handleMessage(upd.message);
          }
        }
      } catch (err) {
        if (!this.running) break;
        const e = err as Error & { name?: string; code?: number };
        if (e.name === "AbortError") break;

        // Fatal auth or multi-instance conflict
        if (e.code === 401) {
          this.running = false;
          this.callbacks.onStatusChange({ state: "error", lastError: e.message });
          this.callbacks.onNotice("error", `Telegram auth failed for "${this.config.name}": ${e.message}`);
          break;
        }
        if (e.code === 409) {
          this.callbacks.onStatusChange({
            state: "error",
            lastError: "Conflict (409): another bot instance or webhook is polling this token.",
          });
          this.callbacks.onNotice(
            "warn",
            `Telegram 409 conflict on "${this.config.name}" — retrying in ${Math.round(backoffMs / 1000)}s.`,
          );
        } else {
          this.callbacks.onStatusChange({ lastError: e.message });
        }

        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(30_000, backoffMs * 2);
      }
    }
  }

  private async handleMessage(msg: TelegramMessage): Promise<void> {
    if (!msg.from || msg.from.is_bot) return;

    const rawText = (msg.text ?? msg.caption ?? "").trim();
    if (!rawText) return;

    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
    const bareUsername = this.botUsername.replace(/^@/, "");
    const mentionRegex = bareUsername
      ? new RegExp(`@${bareUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
      : null;

    const isReplyToBot = Boolean(
      msg.reply_to_message?.from && String(msg.reply_to_message.from.id) === this.botId,
    );
    const hasMention = Boolean(mentionRegex && mentionRegex.test(rawText));
    const isCommandForBot = Boolean(
      rawText.startsWith("/") &&
        (!rawText.split(/\s+/)[0].includes("@") ||
          rawText.split(/\s+/)[0].toLowerCase().endsWith(`@${bareUsername.toLowerCase()}`)),
    );

    const wasMentioned = !isGroup || hasMention || isReplyToBot || isCommandForBot;

    // Clean leading @botusername or /cmd@botusername suffixes
    let cleanText = rawText;
    if (bareUsername) {
      cleanText = cleanText
        .replace(
          new RegExp(`^(\\/[a-z0-9_]+)@${bareUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
          "$1",
        )
        .replace(new RegExp(`@${bareUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig"), "")
        .trim();
    }

    if (!cleanText) return;

    const senderName = msg.from.username
      ? `@${msg.from.username}`
      : [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || String(msg.from.id);

    const chatId = String(msg.chat.id);
    const incoming: IncomingChannelMessage = {
      channelId: this.id,
      platform: "telegram",
      chatId,
      senderId: String(msg.from.id),
      senderName,
      text: cleanText,
      isGroup,
      wasMentioned,
      messageId: String(msg.message_id),
      reply: async (replyText: string) => {
        await this.sendChunkedReply(msg.chat.id, replyText, msg.message_id);
      },
      sendTyping: async () => {
        await this.apiCall("sendChatAction", {
          chat_id: msg.chat.id,
          action: "typing",
        }).catch(() => {});
      },
    };

    await this.callbacks.onMessage(incoming);
  }

  private async sendChunkedReply(
    chatId: number,
    text: string,
    replyToMessageId?: number,
  ): Promise<void> {
    const chunks = splitMessageChunks(text, 3900);
    for (let i = 0; i < chunks.length; i++) {
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text: chunks[i],
      };
      if (i === 0 && replyToMessageId) {
        payload.reply_to_message_id = replyToMessageId;
      }
      await this.apiCall("sendMessage", payload);
    }
  }
}
