import { spawn } from "node:child_process";
import crypto from "node:crypto";
import type { ChatMessage, ProviderConfig, ReasoningEffort } from "../types.js";
import {
  ProviderApiError,
  buildProviderHttpError,
  buildProviderNetworkError,
} from "./errors.js";

export { ProviderApiError, formatFriendlyError } from "./errors.js";

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmStreamResult {
  content: string;
  reasoning: string;
  toolCalls: LlmToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface StreamOptions {
  provider: ProviderConfig;
  modelId: string;
  systemPrompt: string;
  messages: ChatMessage[];
  tools: ToolSchema[];
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
}

function safeJsonParse(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : { input: parsed };
  } catch {
    return { raw };
  }
}

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event?: string; data: string }> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        let eventName: string | undefined;
        const dataLines: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length > 0) {
          yield { event: eventName, data: dataLines.join("\n") };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function buildOpenAiMessages(systemPrompt: string, messages: ChatMessage[]): unknown[] {
  const out: unknown[] = [{ role: "system", content: systemPrompt }];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const msg: Record<string, unknown> = {
        role: "assistant",
        content: m.content || null,
      };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments ?? {}),
          },
        }));
      }
      out.push(msg);
    } else if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId || "call_unknown",
        content: m.content,
      });
    }
  }
  return out;
}

async function streamOpenAiCompatible(opts: StreamOptions): Promise<LlmStreamResult> {
  const { provider, modelId, systemPrompt, messages, tools, temperature, signal } = opts;
  const endpoint = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(provider.headers ?? {}),
  };
  if (provider.apiKey && !provider.local) {
    headers["Authorization"] = `Bearer ${provider.apiKey}`;
  } else if (provider.apiKey && provider.local) {
    headers["Authorization"] = `Bearer ${provider.apiKey}`;
  }

  const isReasoningModel = /^(o1|o3|o4|gpt-5|deepseek-reasoner)/i.test(modelId);
  const supportsOpenAiReasoningEffort = /(?:^|\/)(o1|o3|o4|gpt-5)/i.test(modelId);

  const payload: Record<string, unknown> = {
    model: modelId,
    messages: buildOpenAiMessages(systemPrompt, messages),
    stream: true,
    stream_options: { include_usage: true },
  };

  if (supportsOpenAiReasoningEffort && opts.reasoningEffort && opts.reasoningEffort !== "none") {
    payload.reasoning_effort = opts.reasoningEffort === "xhigh" ? "high" : opts.reasoningEffort;
  }

  if (!isReasoningModel && temperature !== undefined) {
    payload.temperature = temperature;
  }

  if (tools.length > 0) {
    payload.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    throw buildProviderNetworkError(provider, modelId, err);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw buildProviderHttpError(
      provider,
      modelId,
      res.status,
      res.statusText,
      errText,
      res.headers.get("retry-after"),
    );
  }

  if (!res.body) {
    throw buildProviderHttpError(provider, modelId, 502, "Empty response body", "");
  }

  let content = "";
  let reasoning = "";
  const tcAccumulator = new Map<number, { id: string; name: string; args: string }>();
  const usage = { inputTokens: 0, outputTokens: 0 };

  for await (const frame of parseSseStream(res.body)) {
    if (frame.data === "[DONE]") break;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(frame.data) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (parsed.error && typeof parsed.error === "object") {
      throw buildProviderHttpError(provider, modelId, 500, "Stream Error", JSON.stringify(parsed));
    }

    if (parsed.usage && typeof parsed.usage === "object") {
      const u = parsed.usage as Record<string, number>;
      usage.inputTokens = u.prompt_tokens ?? usage.inputTokens;
      usage.outputTokens = u.completion_tokens ?? usage.outputTokens;
    }

    const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
    const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
    if (!delta) continue;

    const reasoningChunk =
      (delta.reasoning_content as string | undefined) ||
      (delta.reasoning as string | undefined);
    if (reasoningChunk) {
      reasoning += reasoningChunk;
      opts.onReasoningDelta?.(reasoningChunk);
    }

    const textChunk = delta.content as string | undefined;
    if (textChunk) {
      content += textChunk;
      opts.onTextDelta?.(textChunk);
    }

    const deltaToolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
    if (deltaToolCalls) {
      for (const tc of deltaToolCalls) {
        const idx = typeof tc.index === "number" ? tc.index : 0;
        const current = tcAccumulator.get(idx) ?? {
          id: (tc.id as string) || `call_${crypto.randomBytes(4).toString("hex")}`,
          name: "",
          args: "",
        };
        if (typeof tc.id === "string" && tc.id) current.id = tc.id;
        const fn = tc.function as Record<string, string> | undefined;
        if (fn?.name) current.name += fn.name;
        if (fn?.arguments) current.args += fn.arguments;
        tcAccumulator.set(idx, current);
      }
    }
  }

  const toolCalls: LlmToolCall[] = [...tcAccumulator.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, tc]) => Boolean(tc.name))
    .map(([, tc]) => ({
      id: tc.id,
      name: tc.name,
      arguments: safeJsonParse(tc.args),
    }));

  return { content, reasoning, toolCalls, usage };
}

function buildAnthropicMessages(messages: ChatMessage[]): unknown[] {
  const out: Array<{ role: "user" | "assistant"; content: unknown[] }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      out.push({ role: "user", content: [{ type: "text", text: m.content }] });
    } else if (m.role === "assistant") {
      const blocks: unknown[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments ?? {},
        });
      }
      if (blocks.length > 0) {
        out.push({ role: "assistant", content: blocks });
      }
    } else if (m.role === "tool") {
      const toolBlock = {
        type: "tool_result",
        tool_use_id: m.toolCallId || "tool_unknown",
        content: m.content,
      };
      const prev = out[out.length - 1];
      if (prev && prev.role === "user") {
        prev.content.push(toolBlock);
      } else {
        out.push({ role: "user", content: [toolBlock] });
      }
    }
  }
  return out;
}

async function streamAnthropic(opts: StreamOptions): Promise<LlmStreamResult> {
  const { provider, modelId, systemPrompt, messages, tools, temperature, signal } = opts;
  const endpoint = `${provider.baseUrl.replace(/\/+$/, "")}/messages`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    ...(provider.headers ?? {}),
  };

  // Support both x-api-key (sk-ant-api*) and OAuth Bearer tokens
  if (provider.apiKey) {
    if (provider.apiKey.startsWith("sk-ant-oat") || provider.authSource === "claude-cli") {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
      headers["anthropic-beta"] = "oauth-2025-04-20";
    } else {
      headers["x-api-key"] = provider.apiKey;
    }
  }

  const payload: Record<string, unknown> = {
    model: modelId,
    max_tokens: 8192,
    system: systemPrompt,
    messages: buildAnthropicMessages(messages),
    stream: true,
  };
  const supportsAnthropicThinking = /claude-(?:opus-4|sonnet-4|3-7)/i.test(modelId);
  if (supportsAnthropicThinking && opts.reasoningEffort && opts.reasoningEffort !== "none") {
    const budgetMap: Record<Exclude<ReasoningEffort, "none">, number> = {
      low: 2048,
      medium: 6144,
      high: 16384,
      xhigh: 24576,
    };
    const budget = budgetMap[opts.reasoningEffort];
    payload.thinking = { type: "enabled", budget_tokens: budget };
    payload.max_tokens = Math.max(8192, budget + 4096);
  } else if (temperature !== undefined) {
    payload.temperature = temperature;
  }
  if (tools.length > 0) {
    payload.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    throw buildProviderNetworkError(provider, modelId, err);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw buildProviderHttpError(
      provider,
      modelId,
      res.status,
      res.statusText,
      errText,
      res.headers.get("retry-after"),
    );
  }
  if (!res.body) {
    throw buildProviderHttpError(provider, modelId, 502, "Empty response body", "");
  }

  let content = "";
  let reasoning = "";
  const usage = { inputTokens: 0, outputTokens: 0 };
  const toolBlocks = new Map<number, { id: string; name: string; json: string }>();

  for await (const frame of parseSseStream(res.body)) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(frame.data) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (parsed.error && typeof parsed.error === "object") {
      throw buildProviderHttpError(provider, modelId, 500, "Stream Error", JSON.stringify(parsed));
    }

    const type = parsed.type as string;
    if (type === "message_start") {
      const msg = parsed.message as { usage?: { input_tokens?: number } } | undefined;
      usage.inputTokens = msg?.usage?.input_tokens ?? usage.inputTokens;
    } else if (type === "message_delta") {
      const u = parsed.usage as { output_tokens?: number } | undefined;
      usage.outputTokens = u?.output_tokens ?? usage.outputTokens;
    } else if (type === "content_block_start") {
      const idx = parsed.index as number;
      const cb = parsed.content_block as Record<string, unknown> | undefined;
      if (cb?.type === "tool_use") {
        toolBlocks.set(idx, {
          id: (cb.id as string) || `toolu_${crypto.randomBytes(4).toString("hex")}`,
          name: (cb.name as string) || "",
          json: "",
        });
      }
    } else if (type === "content_block_delta") {
      const idx = parsed.index as number;
      const delta = parsed.delta as Record<string, unknown> | undefined;
      if (!delta) continue;
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        content += delta.text;
        opts.onTextDelta?.(delta.text);
      } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
        reasoning += delta.thinking;
        opts.onReasoningDelta?.(delta.thinking);
      } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const block = toolBlocks.get(idx);
        if (block) block.json += delta.partial_json;
      }
    }
  }

  const toolCalls: LlmToolCall[] = [...toolBlocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, b]) => Boolean(b.name))
    .map(([, b]) => ({
      id: b.id,
      name: b.name,
      arguments: safeJsonParse(b.json),
    }));

  return { content, reasoning, toolCalls, usage };
}

function buildGeminiContents(messages: ChatMessage[]): unknown[] {
  const out: Array<{ role: "user" | "model"; parts: unknown[] }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      out.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: tc.arguments ?? {},
          },
        });
      }
      if (parts.length > 0) {
        out.push({ role: "model", parts });
      }
    } else if (m.role === "tool") {
      const fnPart = {
        functionResponse: {
          name: m.toolName || "tool",
          response: { output: m.content },
        },
      };
      const prev = out[out.length - 1];
      if (prev && prev.role === "user") {
        prev.parts.push(fnPart);
      } else {
        out.push({ role: "user", parts: [fnPart] });
      }
    }
  }
  return out;
}

export function buildGeminiFunctionDeclarations(tools: ToolSchema[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.parameters,
  }));
}

async function streamAgyCli(opts: StreamOptions): Promise<LlmStreamResult> {
  const { provider, modelId, systemPrompt, messages, signal } = opts;

  const transcriptParts: string[] = [];
  if (systemPrompt.trim()) {
    transcriptParts.push(`[SYSTEM INSTRUCTIONS]\n${systemPrompt.trim()}`);
  }
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length === 1 && nonSystem[0].role === "user") {
    transcriptParts.push(nonSystem[0].content);
  } else {
    for (const m of nonSystem) {
      if (m.role === "user") {
        transcriptParts.push(`[USER]\n${m.content}`);
      } else if (m.role === "assistant") {
        transcriptParts.push(`[ASSISTANT]\n${m.content}`);
      } else if (m.role === "tool") {
        transcriptParts.push(`[TOOL:${m.toolName || "tool"}]\n${m.content}`);
      }
    }
  }
  const prompt = transcriptParts.join("\n\n");

  const args = [
    "--output-format",
    "stream-json",
    "--disable-slash-commands",
    "--model",
    modelId,
    "--print",
    prompt,
  ];

  return await new Promise<LlmStreamResult>((resolve, reject) => {
    const child = spawn("agy", args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let content = "";
    let reasoning = "";
    let stderrBuf = "";
    let lineBuf = "";
    const usage = { inputTokens: 0, outputTokens: 0 };

    const onAbort = () => {
      try {
        child.kill();
      } catch {
        // ignore
      }
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("{")) return;
      let ev: Record<string, any>;
      try {
        ev = JSON.parse(trimmed) as Record<string, any>;
      } catch {
        return;
      }

      if (ev.event === "step_update" && ev.step_update) {
        const su = ev.step_update as Record<string, any>;
        if (typeof su.thinking_delta === "string" && su.thinking_delta) {
          reasoning += su.thinking_delta;
          opts.onReasoningDelta?.(su.thinking_delta);
        }
        if (typeof su.text_delta === "string" && su.text_delta) {
          content += su.text_delta;
          opts.onTextDelta?.(su.text_delta);
        }
        if (su.usage && typeof su.usage === "object") {
          usage.inputTokens = Number(su.usage.input_tokens ?? usage.inputTokens);
          usage.outputTokens = Number(su.usage.output_tokens ?? usage.outputTokens);
        }
      } else if (ev.event === "result" && ev.result) {
        const r = ev.result as Record<string, any>;
        if (!content && typeof r.response === "string") {
          content = r.response;
          opts.onTextDelta?.(r.response);
        }
        if (r.usage && typeof r.usage === "object") {
          usage.inputTokens = Number(r.usage.input_tokens ?? usage.inputTokens);
          usage.outputTokens = Number(r.usage.output_tokens ?? usage.outputTokens);
        }
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      lineBuf += chunk.toString("utf8");
      const lines = lineBuf.split(/\r?\n/);
      lineBuf = lines.pop() ?? "";
      for (const l of lines) handleLine(l);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(
        new ProviderApiError({
          kind: "network_error",
          providerId: provider.id,
          providerName: `${provider.name} (Antigravity CLI)`,
          modelId,
          apiMessage: err.message,
          hint: "Ensure Google Antigravity CLI (`agy`) is installed and on your PATH, or switch to an API key via /connect gemini.",
          suggestedModels: [],
        }),
      );
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (lineBuf.trim()) handleLine(lineBuf);
      if (signal?.aborted) {
        reject(new Error("Request aborted."));
        return;
      }
      if (code !== 0 && !content) {
        reject(
          new ProviderApiError({
            kind: "unknown",
            providerId: provider.id,
            providerName: `${provider.name} (Antigravity CLI)`,
            modelId,
            apiMessage: stderrBuf.trim() || `agy exited with code ${code}`,
            hint: "Run `agy` to verify your Antigravity login, or switch models with /model.",
            suggestedModels: [],
          }),
        );
        return;
      }
      resolve({ content, reasoning, toolCalls: [], usage });
    });
  });
}

async function streamGemini(opts: StreamOptions): Promise<LlmStreamResult> {
  if (opts.provider.authSource === "agy-cli" || opts.provider.apiKey === "agy-cli") {
    return await streamAgyCli(opts);
  }
  const { provider, modelId, systemPrompt, messages, tools, temperature, signal } = opts;
  const base = provider.baseUrl.replace(/\/+$/, "");
  const endpoint = `${base}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(provider.headers ?? {}),
  };
  if (provider.apiKey) {
    if (provider.apiKey.startsWith("ya29.") || provider.authSource === "gcloud") {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    } else {
      headers["x-goog-api-key"] = provider.apiKey;
    }
  }

  const generationConfig: Record<string, unknown> = {
    temperature: temperature ?? 0.2,
  };
  if (opts.reasoningEffort && /2\.5|3\.|thinking/i.test(modelId)) {
    const gemBudgetMap: Record<ReasoningEffort, number> = {
      none: 0,
      low: 1024,
      medium: 4096,
      high: 12288,
      xhigh: 24576,
    };
    let thinkingBudget = gemBudgetMap[opts.reasoningEffort];
    if (thinkingBudget === 0 && /-pro/i.test(modelId)) {
      thinkingBudget = 1024;
    }
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget,
    };
  }

  const payload: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: buildGeminiContents(messages),
    generationConfig,
  };

  if (tools.length > 0) {
    payload.tools = [
      {
        functionDeclarations: buildGeminiFunctionDeclarations(tools),
      },
    ];
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    throw buildProviderNetworkError(provider, modelId, err);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw buildProviderHttpError(
      provider,
      modelId,
      res.status,
      res.statusText,
      errText,
      res.headers.get("retry-after"),
    );
  }
  if (!res.body) {
    throw buildProviderHttpError(provider, modelId, 502, "Empty response body", "");
  }

  let content = "";
  let reasoning = "";
  const toolCalls: LlmToolCall[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };

  for await (const frame of parseSseStream(res.body)) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(frame.data) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (parsed.error && typeof parsed.error === "object") {
      throw buildProviderHttpError(provider, modelId, 500, "Stream Error", JSON.stringify(parsed));
    }

    const um = parsed.usageMetadata as
      | { promptTokenCount?: number; candidatesTokenCount?: number }
      | undefined;
    if (um) {
      usage.inputTokens = um.promptTokenCount ?? usage.inputTokens;
      usage.outputTokens = um.candidatesTokenCount ?? usage.outputTokens;
    }

    const candidates = parsed.candidates as
      | Array<{ content?: { parts?: Array<Record<string, unknown>> } }>
      | undefined;
    const parts = candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      if (part.thought && typeof part.text === "string") {
        reasoning += part.text;
        opts.onReasoningDelta?.(part.text);
      } else if (typeof part.text === "string") {
        content += part.text;
        opts.onTextDelta?.(part.text);
      } else if (part.functionCall && typeof part.functionCall === "object") {
        const fc = part.functionCall as { name: string; args?: Record<string, unknown> };
        toolCalls.push({
          id: `gem_${crypto.randomBytes(4).toString("hex")}`,
          name: fc.name,
          arguments: fc.args ?? {},
        });
      }
    }
  }

  return { content, reasoning, toolCalls, usage };
}

export async function streamCompletion(opts: StreamOptions): Promise<LlmStreamResult> {
  if (!opts.provider.apiKey && !opts.provider.local) {
    throw new ProviderApiError({
      kind: "auth_failed",
      providerId: opts.provider.id,
      providerName: opts.provider.name,
      modelId: opts.modelId,
      apiMessage: `Provider "${opts.provider.name}" (${opts.provider.id}) is not authenticated.`,
      hint: `Connect with /connect ${opts.provider.id} <API_KEY>, set ${opts.provider.envKeys.join(" / ")}, or switch with /model.`,
      suggestedModels: [],
    });
  }

  try {
    switch (opts.provider.protocol) {
      case "anthropic":
        return await streamAnthropic(opts);
      case "gemini":
        return await streamGemini(opts);
      case "openai":
      default:
        return await streamOpenAiCompatible(opts);
    }
  } catch (err) {
    if (err instanceof ProviderApiError) throw err;
    throw buildProviderNetworkError(opts.provider, opts.modelId, err);
  }
}
