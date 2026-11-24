import type { ChannelConfig } from "../types.js";
import type { ChannelAdapter, ChannelAdapterCallbacks } from "./types.js";

/**
 * Generic HTTP Webhook Bridge adapter.
 * Exposed by YedoguDaemon at `POST /api/channels/webhook/:id` so any messaging client
 * (WhatsApp bridge, Matrix, n8n, iOS Shortcuts, custom bots) can text YEDOGU over HTTP.
 */
export class WebhookChannelAdapter implements ChannelAdapter {
  public readonly id: string;
  public readonly platform = "webhook" as const;

  constructor(
    private readonly config: ChannelConfig,
    private readonly callbacks: ChannelAdapterCallbacks,
  ) {
    this.id = config.id;
  }

  public async start(): Promise<void> {
    this.callbacks.onStatusChange({
      state: "connected",
      botUsername: `/api/channels/webhook/${this.id}`,
      webhookPath: `/api/channels/webhook/${this.id}`,
      lastError: undefined,
    });
    this.callbacks.onNotice(
      "info",
      `Webhook bridge "${this.config.name}" active at /api/channels/webhook/${this.id}.`,
    );
  }

  public async stop(): Promise<void> {
    this.callbacks.onStatusChange({ state: "disconnected" });
  }
}
