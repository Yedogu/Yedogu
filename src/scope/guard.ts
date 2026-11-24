import type { ScopeConfig } from "../types.js";

export interface ScopeCheckResult {
  allowed: boolean;
  reason: string;
  matchedRule?: string;
  targetHost?: string;
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function extractHost(target: string): string {
  const trimmed = target.trim();
  try {
    if (trimmed.includes("://")) {
      return new URL(trimmed).hostname.toLowerCase();
    }
    if (trimmed.includes("/") && !trimmed.includes("\\") && !trimmed.startsWith("/")) {
      return new URL(`https://${trimmed}`).hostname.toLowerCase();
    }
  } catch {
    // Fallback to raw host/path matching
  }
  return trimmed.split(":")[0].toLowerCase();
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let val = 0;
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) return null;
    val = (val << 8) + num;
  }
  return val >>> 0;
}

function matchCidr(host: string, rule: string): boolean {
  const [net, bitsStr] = rule.split("/");
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const hostInt = ipToInt(host);
  const netInt = ipToInt(net);
  if (hostInt === null || netInt === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (hostInt & mask) === (netInt & mask);
}

function matchRule(target: string, rule: string): boolean {
  const cleanRule = rule.trim().toLowerCase();
  if (!cleanRule) return false;

  const targetLower = target.trim().toLowerCase();
  const host = extractHost(targetLower);

  // Localhost always matchable if explicitly added
  if (cleanRule.includes("/") && /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(cleanRule)) {
    return matchCidr(host, cleanRule);
  }

  // URL prefix match
  if (cleanRule.startsWith("http://") || cleanRule.startsWith("https://")) {
    return targetLower.startsWith(cleanRule);
  }

  // Wildcard domain match (*.target.com matches sub.target.com and target.com)
  if (cleanRule.startsWith("*.")) {
    const bare = cleanRule.slice(2);
    if (host === bare || host.endsWith(`.${bare}`)) return true;
  }

  const rx = wildcardToRegex(cleanRule);
  return rx.test(host) || rx.test(targetLower);
}

export function checkScope(target: string, scope: ScopeConfig): ScopeCheckResult {
  const host = extractHost(target);

  // Always check explicit deny list first
  for (const rule of scope.deny) {
    if (matchRule(target, rule)) {
      return {
        allowed: false,
        reason: `Blocked by out-of-scope deny rule: "${rule}"`,
        matchedRule: rule,
        targetHost: host,
      };
    }
  }

  // If allowlist is empty, allow in advisory mode or warn in enforced mode for non-localhost
  if (scope.allow.length === 0) {
    if (scope.mode === "enforced" && host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      return {
        allowed: false,
        reason: `Scope is ENFORCED with an empty allowlist. Add target via "/scope add ${host}" or switch to "/scope advisory".`,
        targetHost: host,
      };
    }
    return {
      allowed: true,
      reason: "No scope restrictions configured (open/advisory).",
      targetHost: host,
    };
  }

  for (const rule of scope.allow) {
    if (matchRule(target, rule)) {
      return {
        allowed: true,
        reason: `Matched in-scope allow rule: "${rule}"`,
        matchedRule: rule,
        targetHost: host,
      };
    }
  }

  if (scope.mode === "advisory") {
    return {
      allowed: true,
      reason: `ADVISORY WARNING: "${host}" is not in the configured scope allowlist.`,
      targetHost: host,
    };
  }

  return {
    allowed: false,
    reason: `Blocked: "${host}" does not match any in-scope allow rule (${scope.allow.join(", ")}).`,
    targetHost: host,
  };
}

/**
 * Evidence Hygiene: redacts session cookies, Authorization headers, JWTs,
 * and common cloud/API keys before exporting reports.
 */
export function redactEvidence(text: string): string {
  if (!text) return text;
  return text
    // Authorization headers
    .replace(/(Authorization\s*:\s*(?:Bearer|Basic|Token)\s+)([^\s\r\n"']+)/gi, "$1[REDACTED_TOKEN]")
    // Cookie / Set-Cookie values
    .replace(/((?:Set-)?Cookie\s*:\s*[^=;\r\n]+=)([^;\r\n]+)/gi, "$1[REDACTED_COOKIE]")
    // Raw JWTs (keep header, redact payload & signature)
    .replace(/\b(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "$1.[REDACTED_PAYLOAD].[REDACTED_SIG]")
    // AWS access keys
    .replace(/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, "$1[REDACTED_AWS_KEY]")
    // OpenAI / Anthropic / GitHub / Stripe / Slack tokens
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{12,}|xapp-[0-9]+-[A-Za-z0-9-]{12,})\b/g, "[REDACTED_API_KEY]")
    // Telegram Bot API tokens
    .replace(/\b\d{8,11}:[A-Za-z0-9_-]{30,}\b/g, "[REDACTED_BOT_TOKEN]");
}
