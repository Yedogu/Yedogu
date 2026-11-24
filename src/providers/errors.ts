import type { ProviderConfig } from "../types.js";
import { redactEvidence } from "../scope/guard.js";

export type ProviderErrorKind =
  | "model_not_found"
  | "auth_failed"
  | "quota_exceeded"
  | "rate_limit"
  | "context_length"
  | "bad_request"
  | "network_error"
  | "server_error"
  | "aborted"
  | "unknown";

export interface ProviderErrorDetails {
  kind: ProviderErrorKind;
  providerId: string;
  providerName: string;
  modelId: string;
  status?: number;
  apiCode?: string;
  apiMessage: string;
  hint: string;
  suggestedModels: string[];
  retryAfterSec?: number;
}

export class ProviderApiError extends Error {
  public readonly kind: ProviderErrorKind;
  public readonly providerId: string;
  public readonly providerName: string;
  public readonly modelId: string;
  public readonly status?: number;
  public readonly apiCode?: string;
  public readonly apiMessage: string;
  public readonly hint: string;
  public readonly suggestedModels: string[];
  public readonly retryAfterSec?: number;

  constructor(details: ProviderErrorDetails) {
    const formatted = formatProviderApiErrorText(details);
    super(formatted);
    this.name = "ProviderApiError";
    this.kind = details.kind;
    this.providerId = details.providerId;
    this.providerName = details.providerName;
    this.modelId = details.modelId;
    this.status = details.status;
    this.apiCode = details.apiCode;
    this.apiMessage = details.apiMessage;
    this.hint = details.hint;
    this.suggestedModels = details.suggestedModels;
    this.retryAfterSec = details.retryAfterSec;
  }
}

function cleanSingleLine(text: string, maxLen = 220): string {
  const flat = redactEvidence(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, maxLen - 1).trimEnd()}…`;
}

function extractStructuredApiError(rawBody: string): {
  message: string;
  code?: string;
  type?: string;
} {
  const trimmed = (rawBody || "").trim();
  if (!trimmed) return { message: "" };

  try {
    const parsed = JSON.parse(trimmed) as Record<string, any>;
    // OpenAI / Anthropic / Gemini / OpenRouter standard { error: { message, code, type, status } }
    if (parsed.error && typeof parsed.error === "object") {
      const e = parsed.error as Record<string, any>;
      return {
        message: typeof e.message === "string" ? e.message : JSON.stringify(e),
        code: typeof e.code === "string" ? e.code : typeof e.status === "string" ? e.status : undefined,
        type: typeof e.type === "string" ? e.type : undefined,
      };
    }
    // Ollama / simple APIs: { error: "model '...' not found" }
    if (typeof parsed.error === "string") {
      return { message: parsed.error };
    }
    if (typeof parsed.message === "string") {
      return {
        message: parsed.message,
        code: typeof parsed.code === "string" ? parsed.code : undefined,
      };
    }
    // Gemini array-wrapped error: [{ error: { ... } }]
    if (Array.isArray(parsed) && parsed[0]?.error) {
      const e = parsed[0].error as Record<string, any>;
      return {
        message: typeof e.message === "string" ? e.message : "",
        code: typeof e.status === "string" ? e.status : undefined,
      };
    }
  } catch {
    // Non-JSON body (e.g. HTML reverse proxy error page)
    if (/<html|<!doctype/i.test(trimmed)) {
      return { message: "Upstream gateway returned an HTML error page." };
    }
  }

  return { message: cleanSingleLine(trimmed, 220) };
}

function pickSuggestedModels(provider: ProviderConfig, failedModelId: string): string[] {
  const candidates = provider.models
    .map((m) => m.id)
    .filter((id) => id.toLowerCase() !== failedModelId.toLowerCase() && !/gpt-5-codex/i.test(id));
  return candidates.slice(0, 3).map((id) => `${provider.id}/${id}`);
}

export function buildProviderHttpError(
  provider: ProviderConfig,
  modelId: string,
  status: number,
  statusText: string,
  rawBody: string,
  retryAfterHeader?: string | null,
): ProviderApiError {
  const parsed = extractStructuredApiError(rawBody);
  const apiMessage = cleanSingleLine(parsed.message || statusText || `HTTP ${status}`);
  const lowerMsg = apiMessage.toLowerCase();
  const lowerCode = (parsed.code || parsed.type || "").toLowerCase();
  const retryAfterSec = retryAfterHeader && /^\d+$/.test(retryAfterHeader.trim())
    ? Number(retryAfterHeader.trim())
    : undefined;
  const suggestedModels = pickSuggestedModels(provider, modelId);

  let kind: ProviderErrorKind = "unknown";
  let hint = `Try again or switch models with /model.`;

  if (
    status === 404 ||
    lowerCode === "model_not_found" ||
    lowerCode === "not_found_error" ||
    /deprecated|model.*not found|does not exist|no such model|unknown model/i.test(lowerMsg)
  ) {
    kind = "model_not_found";
    if (suggestedModels.length > 0) {
      hint = `Switch model: /model ${suggestedModels[0]}${suggestedModels.length > 1 ? ` (or ${suggestedModels.slice(1).join(", ")})` : ""}`;
    } else {
      hint = `Run /model to pick a supported model.`;
    }
  } else if (
    status === 401 ||
    status === 403 ||
    lowerCode === "invalid_api_key" ||
    lowerCode === "authentication_error" ||
    lowerCode === "permission_error" ||
    /invalid api key|unauthorized|authentication|permission denied|expired token/i.test(lowerMsg)
  ) {
    kind = "auth_failed";
    hint = provider.local
      ? `Check your local ${provider.name} configuration or switch provider with /model.`
      : `Reconnect credentials with /connect ${provider.id} <API_KEY> or switch provider with /model.`;
  } else if (
    lowerCode === "insufficient_quota" ||
    /insufficient_quota|exceeded your current quota|billing|credit balance|out of credits/i.test(lowerMsg)
  ) {
    kind = "quota_exceeded";
    hint = `Check billing/credits on ${provider.name} or switch providers with /model.`;
  } else if (
    status === 429 ||
    lowerCode === "rate_limit_error" ||
    lowerCode === "rate_limit_exceeded" ||
    /rate limit|too many requests/i.test(lowerMsg)
  ) {
    kind = "rate_limit";
    hint = retryAfterSec
      ? `Retry in ~${retryAfterSec}s or switch to another model with /model.`
      : `Wait a few seconds and retry, or switch models with /model.`;
  } else if (
    lowerCode === "context_length_exceeded" ||
    /context length|maximum context|too many tokens|prompt is too long|input is too long/i.test(lowerMsg)
  ) {
    kind = "context_length";
    hint = `Run /compact to shorten history or /new to start a fresh session.`;
  } else if (status === 400 || status === 422) {
    kind = "bad_request";
    hint = `Check your selected model (${provider.id}/${modelId}) or switch with /model.`;
  } else if (status >= 500 || status === 529) {
    kind = "server_error";
    hint = `${provider.name} is temporarily unavailable. Retry shortly or switch models with /model.`;
  }

  return new ProviderApiError({
    kind,
    providerId: provider.id,
    providerName: provider.name,
    modelId,
    status,
    apiCode: parsed.code || parsed.type,
    apiMessage,
    hint,
    suggestedModels,
    retryAfterSec,
  });
}

export function buildProviderNetworkError(
  provider: ProviderConfig,
  modelId: string,
  err: unknown,
): ProviderApiError {
  const e = err as Error & { name?: string; cause?: { code?: string; message?: string }; code?: string };

  if (e?.name === "AbortError") {
    return new ProviderApiError({
      kind: "aborted",
      providerId: provider.id,
      providerName: provider.name,
      modelId,
      apiMessage: "Request cancelled.",
      hint: "",
      suggestedModels: [],
    });
  }

  const netCode = e?.cause?.code || e?.code || "";
  const rawMsg = e?.cause?.message || e?.message || String(err);

  if (provider.local && (netCode === "ECONNREFUSED" || /fetch failed|ECONNREFUSED/i.test(rawMsg))) {
    return new ProviderApiError({
      kind: "network_error",
      providerId: provider.id,
      providerName: provider.name,
      modelId,
      apiCode: netCode || "ECONNREFUSED",
      apiMessage: `Local ${provider.name} is not reachable at ${provider.baseUrl}.`,
      hint: `Start ${provider.name} locally, or switch to a cloud provider with /model.`,
      suggestedModels: [],
    });
  }

  return new ProviderApiError({
    kind: "network_error",
    providerId: provider.id,
    providerName: provider.name,
    modelId,
    apiCode: netCode || undefined,
    apiMessage: cleanSingleLine(netCode ? `${netCode}: ${rawMsg}` : rawMsg),
    hint: `Check your internet/proxy connection to ${provider.name} (${provider.baseUrl}) and retry.`,
    suggestedModels: [],
  });
}

function formatProviderApiErrorText(d: ProviderErrorDetails): string {
  if (d.kind === "aborted") {
    return "Generation cancelled.";
  }

  const headerMap: Record<ProviderErrorKind, string> = {
    model_not_found: `Model unavailable: ${d.providerId}/${d.modelId}`,
    auth_failed: `Authentication failed for ${d.providerName}${d.status ? ` (HTTP ${d.status})` : ""}`,
    quota_exceeded: `Quota exceeded on ${d.providerName}`,
    rate_limit: `Rate limited by ${d.providerName}${d.retryAfterSec ? ` (retry in ${d.retryAfterSec}s)` : ""}`,
    context_length: `Context window exceeded on ${d.providerId}/${d.modelId}`,
    bad_request: `Request rejected by ${d.providerName} (${d.providerId}/${d.modelId})`,
    network_error: `Connection failed for ${d.providerName}`,
    server_error: `${d.providerName} temporarily unavailable${d.status ? ` (HTTP ${d.status})` : ""}`,
    aborted: "Generation cancelled.",
    unknown: `${d.providerName} error${d.status ? ` (HTTP ${d.status})` : ""}`,
  };

  const lines = [headerMap[d.kind]];
  if (d.apiMessage && d.apiMessage !== headerMap[d.kind]) {
    lines.push(`Reason: ${d.apiMessage}`);
  }
  if (d.hint) {
    lines.push(`Next: ${d.hint}`);
  }
  return lines.join("\n");
}

/**
 * Formats any thrown error cleanly for Telegram/Discord/Slack, TUI, and Browser UI
 * without leaking raw JSON payloads, HTML error pages, or secrets.
 */
export function formatFriendlyError(err: unknown): string {
  if (err instanceof ProviderApiError) {
    return err.message;
  }
  const raw = err instanceof Error ? err.message : String(err);
  if ((err as { name?: string })?.name === "AbortError") {
    return "Generation cancelled.";
  }

  // If a raw JSON error object somehow slipped into an Error message, extract its human message
  const jsonStart = raw.indexOf("{");
  if (jsonStart !== -1 && raw.includes('"error"')) {
    const prefix = raw.slice(0, jsonStart).trim().replace(/:\s*$/, "");
    const extracted = extractStructuredApiError(raw.slice(jsonStart));
    if (extracted.message) {
      return prefix ? `${cleanSingleLine(prefix, 90)}\nReason: ${cleanSingleLine(extracted.message)}` : cleanSingleLine(extracted.message);
    }
  }

  return redactEvidence(raw).trim() || "Unexpected error occurred.";
}
