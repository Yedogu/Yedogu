import crypto from "node:crypto";
import { checkScope } from "../scope/guard.js";
import type { HttpCapture, ScopeConfig } from "../types.js";

const TRACKED_SEC_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

export interface HttpForgeRequest {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  followRedirects?: boolean;
  timeoutMs?: number;
}

export async function executeHttpForge(
  req: HttpForgeRequest,
  scope: ScopeConfig,
  agentId: string,
): Promise<{ capture: HttpCapture; blockedReason?: string }> {
  const method = (req.method || "GET").toUpperCase();
  const scopeResult = checkScope(req.url, scope);

  if (!scopeResult.allowed) {
    const blocked: HttpCapture = {
      id: `http_${crypto.randomBytes(4).toString("hex")}`,
      timestamp: new Date().toISOString(),
      agentId,
      method,
      url: req.url,
      requestHeaders: req.headers ?? {},
      requestBody: req.body,
      status: 0,
      statusText: "SCOPE_BLOCKED",
      responseHeaders: {},
      responseBody: scopeResult.reason,
      durationMs: 0,
      bodySha256: "",
      securityHeaders: { present: [], missing: [...TRACKED_SEC_HEADERS] },
      scopeAllowed: false,
    };
    return { capture: blocked, blockedReason: scopeResult.reason };
  }

  const start = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 20000);

  try {
    const headers: Record<string, string> = {
      "User-Agent": "YEDOGU-Security-Harness/1.0",
      ...(req.headers ?? {}),
    };

    const res = await fetch(req.url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : req.body,
      redirect: req.followRedirects === false ? "manual" : "follow",
      signal: ctrl.signal,
    });

    const rawBody = await res.text();
    const durationMs = Date.now() - start;
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k.toLowerCase()] = v;
    });

    const present: string[] = [];
    const missing: string[] = [];
    for (const h of TRACKED_SEC_HEADERS) {
      if (responseHeaders[h]) present.push(h);
      else missing.push(h);
    }

    const bodySha256 = crypto.createHash("sha256").update(rawBody).digest("hex");

    const capture: HttpCapture = {
      id: `http_${crypto.randomBytes(4).toString("hex")}`,
      timestamp: new Date().toISOString(),
      agentId,
      method,
      url: req.url,
      requestHeaders: headers,
      requestBody: req.body,
      status: res.status,
      statusText: res.statusText,
      responseHeaders,
      responseBody: rawBody.slice(0, 64000),
      durationMs,
      bodySha256,
      securityHeaders: { present, missing },
      scopeAllowed: true,
    };

    return { capture };
  } finally {
    clearTimeout(timeout);
  }
}
