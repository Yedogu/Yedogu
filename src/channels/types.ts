import crypto from "node:crypto";
import type { ChannelConfig, ChannelPlatform, ChannelRuntimeStatus } from "../types.js";

export interface IncomingChannelMessage {
  channelId: string;
  platform: ChannelPlatform;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  isGroup: boolean;
  wasMentioned: boolean;
  messageId?: string;
  threadId?: string;
  reply: (text: string) => Promise<void>;
  sendTyping?: () => Promise<void>;
}

export interface ChannelAdapterCallbacks {
  onMessage: (msg: IncomingChannelMessage) => Promise<void>;
  onStatusChange: (patch: Partial<ChannelRuntimeStatus>) => void;
  onNotice: (level: "info" | "warn" | "error", message: string) => void;
}

export interface ChannelAdapter {
  readonly id: string;
  readonly platform: ChannelPlatform;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Generates a human-friendly one-time pairing code (e.g. `YDG-4F9A2C`).
 */
export function generatePairingCode(): string {
  return `YDG-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Constant-time comparison for pairing codes and webhook secrets.
 */
export function safeEqualSecret(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Masks sensitive bot tokens / webhook secrets for display in UI or API snapshots.
 */
export function maskChannelToken(token: string | undefined): string {
  if (!token) return "";
  if (token.length <= 10) return "••••••••";
  return `${token.slice(0, 5)}••••${token.slice(-4)}`;
}

/**
 * Splits long AI replies cleanly into platform-safe chunks (Telegram: 4096, Discord: 2000, Slack: 3500)
 * while preferring paragraph/line boundaries and preserving unbalanced fenced code blocks.
 */
export function splitMessageChunks(raw: string, maxLen: number): string[] {
  const text = (raw || "").trim();
  if (!text) return ["(No response)"];
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;
  let openFence: string | null = null;

  while (remaining.length > 0) {
    const prefix: string = openFence ? `${openFence}\n` : "";
    const reserveForClose = 5; // "\n```"
    const budget = Math.max(64, maxLen - prefix.length - reserveForClose);

    if (remaining.length <= maxLen - prefix.length) {
      chunks.push(prefix + remaining);
      break;
    }

    let cut = remaining.lastIndexOf("\n\n", budget);
    if (cut < Math.floor(budget * 0.45)) {
      cut = remaining.lastIndexOf("\n", budget);
    }
    if (cut < Math.floor(budget * 0.45)) {
      cut = remaining.lastIndexOf(" ", budget);
    }
    if (cut <= 0) {
      cut = budget;
    }

    let part: string = prefix + remaining.slice(0, cut).trimEnd();
    remaining = remaining.slice(cut).trimStart();

    // Track whether a markdown code fence is left open across the split
    let activeFence: string | null = null;
    for (const line of part.split(/\r?\n/)) {
      const m = line.match(/^\s*(```[a-zA-Z0-9_-]*)/);
      if (m) {
        if (activeFence) activeFence = null;
        else activeFence = m[1];
      }
    }

    if (activeFence) {
      part += "\n```";
      openFence = activeFence;
    } else {
      openFence = null;
    }

    chunks.push(part);
  }

  return chunks;
}

export function createInitialRuntimeStatus(cfg: ChannelConfig): ChannelRuntimeStatus {
  return {
    id: cfg.id,
    name: cfg.name,
    platform: cfg.platform,
    state: "disconnected",
    messagesIn: 0,
    messagesOut: 0,
    webhookPath: cfg.platform === "webhook" ? `/api/channels/webhook/${cfg.id}` : undefined,
  };
}
