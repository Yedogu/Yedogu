import { execFile } from "node:child_process";
import type { GlobalConfig } from "../config/store.js";
import { discoverExternalCredentials } from "../config/store.js";
import type { ProviderConfig, ProviderModelInfo, ProviderProtocol, ReasoningEffort } from "../types.js";

/**
 * Returns true when a provider is actively connected/configured.
 * Local providers (Ollama / LM Studio) are only considered connected once
 * explicitly configured via `/connect` or env, so disconnected local stubs
 * don't clutter the `/model` switcher.
 */
export function isProviderConnected(provider: ProviderConfig): boolean {
  if (!provider.apiKey) return false;
  if (provider.local) {
    return provider.authSource === "config" || provider.authSource === "env";
  }
  return true;
}

export function formatModelDisplayName(id: string, rawName?: string): string {
  const cleanId = id.trim();
  const trimmedRaw = rawName?.trim() ?? "";

  // Preserve agy effort/variant names verbatim (e.g. "Gemini 4 Neon (High)", "Orchestrator (Neon)")
  if (trimmedRaw && /\((?:low|medium|high|xhigh|max|neon|argon|hydrogen)\)$/i.test(trimmedRaw)) {
    return trimmedRaw;
  }

  let base = cleanId
    .replace(/^(?:openai|anthropic|google|deepseek|qwen|meta-llama|mistralai|x-ai)\//i, "")
    .replace(/:(?:free|beta|extended)$/i, "");

  // Strip trailing 8-digit or YYYY-MM-DD date stamps
  base = base.replace(/-(?:20\d{6}|20\d{2}-\d{2}-\d{2})$/, "");
  const lower = base.toLowerCase();

  if (lower === "gpt-5") return "GPT-5";
  if (lower === "gpt-5-mini") return "GPT-5 Mini";
  if (lower === "gpt-5-nano") return "GPT-5 Nano";
  if (lower === "gpt-4.1") return "GPT-4.1";
  if (lower === "gpt-4.1-mini") return "GPT-4.1 Mini";
  if (lower === "gpt-4.1-nano") return "GPT-4.1 Nano";
  if (lower === "gpt-4o") return "GPT-4o";
  if (lower === "gpt-4o-mini") return "GPT-4o Mini";
  if (lower === "o3") return "o3";
  if (lower === "o3-mini") return "o3-mini";
  if (lower === "o4-mini") return "o4-mini";
  if (lower === "o1") return "o1";

  const claudeNew = lower.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?(?:-|$)/);
  if (claudeNew) {
    const family = claudeNew[1][0].toUpperCase() + claudeNew[1].slice(1);
    const ver = claudeNew[3] ? `${claudeNew[2]}.${claudeNew[3]}` : claudeNew[2];
    return `Claude ${family} ${ver}`;
  }
  const claudeOld = lower.match(/^claude-(\d+)(?:-(\d+))?-(opus|sonnet|haiku)(?:-|$)/);
  if (claudeOld) {
    const family = claudeOld[3][0].toUpperCase() + claudeOld[3].slice(1);
    const ver = claudeOld[2] ? `${claudeOld[1]}.${claudeOld[2]}` : claudeOld[1];
    return `Claude ${ver} ${family}`;
  }

  const gemMatch = lower.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash|flash-lite)(?:-(?:preview|exp|latest))?$/);
  if (gemMatch) {
    const tier = gemMatch[2]
      .split("-")
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(" ");
    return `Gemini ${gemMatch[1]} ${tier}`;
  }

  if (lower === "deepseek-reasoner" || lower === "deepseek-r1") return "DeepSeek R1";
  if (lower === "deepseek-chat" || lower === "deepseek-v3") return "DeepSeek V3";
  if (lower === "grok-3") return "Grok 3";
  if (lower === "grok-3-mini") return "Grok 3 Mini";
  if (lower === "grok-4") return "Grok 4";
  if (lower === "codestral-latest") return "Codestral";
  if (lower === "mistral-large-latest") return "Mistral Large";

  if (trimmedRaw && trimmedRaw.toLowerCase() !== cleanId.toLowerCase()) {
    return trimmedRaw
      .replace(/\s*\((?:OR|Ollama Live|Local)\)\s*$/i, "")
      .replace(/^(?:OpenAI|Anthropic|Google|DeepSeek|Qwen|Meta):\s*/i, "")
      .trim();
  }

  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^(gpt|o\d|r1|v3|vl|it)$/i.test(part)) return part.toUpperCase();
      if (/^\d/.test(part)) return part;
      return part[0].toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function inferReasoningLevels(
  providerId: string,
  modelId: string,
  supportsReasoning?: boolean,
): ReasoningEffort[] | undefined {
  const pid = providerId.toLowerCase();
  const id = modelId.toLowerCase().replace(/^.*\//, "");

  if (pid === "openai" || pid === "codex" || (pid === "openrouter" && /^(o1|o3|o4|gpt-5)/.test(id))) {
    if (/^(o1|o3|o4|gpt-5)/.test(id)) return ["low", "medium", "high"];
  }
  if (pid === "anthropic" || (pid === "openrouter" && /^claude-/.test(id))) {
    if (/^claude-(?:opus-[45]|sonnet-[45]|3-7-sonnet)/.test(id)) return ["none", "low", "medium", "high"];
  }
  if (pid === "gemini" || (pid === "openrouter" && /^gemini-/.test(id))) {
    if (/^gemini-(?:2\.5-pro|3|4)/.test(id)) return ["low", "medium", "high"];
    if (/^gemini-2\.5-flash/.test(id)) return ["none", "low", "medium", "high"];
  }
  if (pid === "xai" && /^grok-(?:3-mini|4)/.test(id)) {
    return ["low", "medium", "high"];
  }
  if ((pid === "deepseek" || pid === "openrouter") && /^(?:deepseek-reasoner|deepseek-r1)/.test(id)) {
    return ["low", "medium", "high"];
  }
  if (supportsReasoning) {
    return ["low", "medium", "high"];
  }
  return undefined;
}

export function getBuiltinProviders(): ProviderConfig[] {
  const list: ProviderConfig[] = [
    {
      id: "openai",
      name: "OpenAI",
      protocol: "openai",
      baseUrl: "https://api.openai.com/v1",
      envKeys: ["OPENAI_API_KEY"],
      defaultModel: "gpt-5",
      models: [
        {
          id: "gpt-5",
          name: "GPT-5",
          contextWindow: 400000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["flagship", "reasoning"],
        },
        {
          id: "gpt-5-mini",
          name: "GPT-5 Mini",
          contextWindow: 400000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["fast", "reasoning"],
        },
        {
          id: "o3",
          name: "o3 Reasoner",
          contextWindow: 200000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["deep-reasoning", "re"],
        },
        {
          id: "o4-mini",
          name: "o4-mini",
          contextWindow: 200000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["fast", "reasoning"],
        },
        {
          id: "gpt-4.1",
          name: "GPT-4.1",
          contextWindow: 1000000,
          supportsTools: true,
          tags: ["1m-context", "recon"],
        },
        {
          id: "gpt-4o",
          name: "GPT-4o",
          contextWindow: 128000,
          supportsTools: true,
          tags: ["balanced"],
        },
      ],
    },
    {
      id: "codex",
      name: "OpenAI Codex",
      protocol: "openai",
      baseUrl: "https://api.openai.com/v1",
      envKeys: ["CODEX_API_KEY", "OPENAI_API_KEY"],
      defaultModel: "gpt-5",
      models: [
        {
          id: "gpt-5",
          name: "GPT-5",
          contextWindow: 400000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["flagship", "exploit-dev", "sast"],
        },
        {
          id: "gpt-5-mini",
          name: "GPT-5 Mini",
          contextWindow: 400000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["fast", "codex"],
        },
        {
          id: "gpt-4.1",
          name: "GPT-4.1",
          contextWindow: 1000000,
          supportsTools: true,
          tags: ["1m-context", "code-audit"],
        },
        {
          id: "o4-mini",
          name: "o4-mini",
          contextWindow: 200000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["fast", "reasoning"],
        },
        {
          id: "gpt-4o",
          name: "GPT-4o",
          contextWindow: 128000,
          supportsTools: true,
          tags: ["balanced"],
        },
      ],
    },
    {
      id: "anthropic",
      name: "Anthropic (Claude)",
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      envKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
      defaultModel: "claude-sonnet-4-6",
      models: [
        {
          id: "claude-opus-4-6",
          name: "Claude Opus 4.6",
          contextWindow: 200000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["flagship", "re", "zero-day"],
        },
        {
          id: "claude-sonnet-4-6",
          name: "Claude Sonnet 4.6",
          contextWindow: 200000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["balanced", "wapt", "agentic"],
        },
        {
          id: "claude-3-7-sonnet-20250219",
          name: "Claude 3.7 Sonnet",
          contextWindow: 200000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["reasoning"],
        },
        {
          id: "claude-3-5-haiku-20241022",
          name: "Claude 3.5 Haiku",
          contextWindow: 200000,
          supportsTools: true,
          tags: ["fast", "triage"],
        },
      ],
    },
    {
      id: "gemini",
      name: "Google Gemini",
      protocol: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      envKeys: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
      defaultModel: "gemini-2.5-pro",
      models: [
        {
          id: "gemini-3.1-pro-preview",
          name: "Gemini 3.1 Pro",
          contextWindow: 1048576,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["flagship", "1m-context", "re"],
        },
        {
          id: "gemini-2.5-pro",
          name: "Gemini 2.5 Pro",
          contextWindow: 1048576,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["1m-context", "code-audit"],
        },
        {
          id: "gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
          contextWindow: 1048576,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["fast", "recon"],
        },
      ],
    },
    {
      id: "openrouter",
      name: "OpenRouter (200+ Models)",
      protocol: "openai",
      baseUrl: "https://openrouter.ai/api/v1",
      envKeys: ["OPENROUTER_API_KEY"],
      headers: {
        "HTTP-Referer": "https://yedogu.local",
        "X-Title": "YEDOGU Security Harness",
      },
      defaultModel: "anthropic/claude-sonnet-4-6",
      models: [
        {
          id: "anthropic/claude-opus-4-6",
          name: "Claude Opus 4.6 (OR)",
          contextWindow: 200000,
          supportsTools: true,
          tags: ["flagship"],
        },
        {
          id: "anthropic/claude-sonnet-4-6",
          name: "Claude Sonnet 4.6 (OR)",
          contextWindow: 200000,
          supportsTools: true,
          tags: ["balanced"],
        },
        {
          id: "openai/gpt-5-codex",
          name: "GPT-5 Codex (OR)",
          contextWindow: 400000,
          supportsTools: true,
          tags: ["codex"],
        },
        {
          id: "google/gemini-2.5-pro",
          name: "Gemini 2.5 Pro (OR)",
          contextWindow: 1048576,
          supportsTools: true,
          tags: ["1m-context"],
        },
        {
          id: "deepseek/deepseek-r1",
          name: "DeepSeek R1 (OR)",
          contextWindow: 128000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["reasoning"],
        },
        {
          id: "qwen/qwen3-coder",
          name: "Qwen3 Coder (OR)",
          contextWindow: 262144,
          supportsTools: true,
          tags: ["open-weights", "code"],
        },
      ],
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      protocol: "openai",
      baseUrl: "https://api.deepseek.com/v1",
      envKeys: ["DEEPSEEK_API_KEY"],
      defaultModel: "deepseek-reasoner",
      models: [
        {
          id: "deepseek-reasoner",
          name: "DeepSeek R1 Reasoner",
          contextWindow: 128000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["reasoning"],
        },
        {
          id: "deepseek-chat",
          name: "DeepSeek V3 Chat",
          contextWindow: 128000,
          supportsTools: true,
          tags: ["fast", "low-cost"],
        },
      ],
    },
    {
      id: "xai",
      name: "xAI (Grok)",
      protocol: "openai",
      baseUrl: "https://api.x.ai/v1",
      envKeys: ["XAI_API_KEY"],
      defaultModel: "grok-3",
      models: [
        {
          id: "grok-3",
          name: "Grok 3",
          contextWindow: 131072,
          supportsTools: true,
          tags: ["flagship"],
        },
        {
          id: "grok-3-mini",
          name: "Grok 3 Mini",
          contextWindow: 131072,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["fast", "reasoning"],
        },
      ],
    },
    {
      id: "groq",
      name: "Groq",
      protocol: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      envKeys: ["GROQ_API_KEY"],
      defaultModel: "llama-3.3-70b-versatile",
      models: [
        {
          id: "llama-3.3-70b-versatile",
          name: "Llama 3.3 70B",
          contextWindow: 128000,
          supportsTools: true,
          tags: ["ultra-fast"],
        },
        {
          id: "deepseek-r1-distill-llama-70b",
          name: "DeepSeek R1 Distill 70B",
          contextWindow: 128000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["fast", "reasoning"],
        },
      ],
    },
    {
      id: "mistral",
      name: "Mistral AI",
      protocol: "openai",
      baseUrl: "https://api.mistral.ai/v1",
      envKeys: ["MISTRAL_API_KEY"],
      defaultModel: "codestral-latest",
      models: [
        {
          id: "codestral-latest",
          name: "Codestral Latest",
          contextWindow: 256000,
          supportsTools: true,
          tags: ["code"],
        },
        {
          id: "mistral-large-latest",
          name: "Mistral Large",
          contextWindow: 128000,
          supportsTools: true,
          tags: ["flagship"],
        },
      ],
    },
    {
      id: "ollama",
      name: "Ollama (Local / Air-Gapped)",
      protocol: "openai",
      baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
      envKeys: [],
      local: true,
      defaultModel: "qwen2.5-coder:32b",
      models: [
        {
          id: "qwen2.5-coder:32b",
          name: "Qwen 2.5 Coder 32B (Local)",
          contextWindow: 128000,
          supportsTools: true,
          tags: ["local", "air-gapped"],
        },
        {
          id: "deepseek-r1:32b",
          name: "DeepSeek R1 32B (Local)",
          contextWindow: 64000,
          supportsTools: true,
          supportsReasoning: true,
          tags: ["local", "reasoning"],
        },
        {
          id: "llama3.3:latest",
          name: "Llama 3.3 (Local)",
          contextWindow: 128000,
          supportsTools: true,
          tags: ["local"],
        },
      ],
    },
    {
      id: "lmstudio",
      name: "LM Studio (Local)",
      protocol: "openai",
      baseUrl: process.env.LMSTUDIO_BASE_URL || "http://127.0.0.1:1234/v1",
      envKeys: [],
      local: true,
      defaultModel: "local-model",
      models: [
        {
          id: "local-model",
          name: "Active LM Studio Model",
          contextWindow: 65536,
          supportsTools: true,
          tags: ["local", "air-gapped"],
        },
      ],
    },
  ];
  for (const p of list) {
    for (const m of p.models) {
      m.name = formatModelDisplayName(m.id, m.name);
      if (!m.reasoningLevels) {
        m.reasoningLevels = inferReasoningLevels(p.id, m.id, m.supportsReasoning);
      }
    }
  }
  return list;
}

export function resolveProviders(cfg: GlobalConfig): ProviderConfig[] {
  const builtins = getBuiltinProviders();
  const external = discoverExternalCredentials();
  const merged: ProviderConfig[] = [
    ...builtins.map((p) => ({ ...p, models: [...p.models] })),
    ...(cfg.customProviders ?? []).map((p) => ({ ...p, custom: true, models: [...p.models] })),
  ];

  for (const p of merged) {
    const stored = cfg.credentials[p.id];
    if (stored?.baseUrl) {
      p.baseUrl = stored.baseUrl;
    }
    if (stored?.headers) {
      p.headers = { ...(p.headers ?? {}), ...stored.headers };
    }
    if (stored?.apiKey) {
      p.apiKey = stored.apiKey;
      p.authSource = stored.apiKey === "agy-cli" ? "agy-cli" : "config";
      continue;
    }

    // Check env variables
    let envHit: string | undefined;
    for (const envName of p.envKeys) {
      if (process.env[envName]?.trim()) {
        envHit = process.env[envName]!.trim();
        break;
      }
    }
    if (envHit) {
      p.apiKey = envHit;
      p.authSource = "env";
      continue;
    }

    // Check external CLI credentials (Codex CLI / Claude Code / OpenCode)
    if (external[p.id]) {
      p.apiKey = external[p.id].apiKey;
      p.authSource = external[p.id].source;
      continue;
    }

    if (p.local) {
      p.apiKey = "local-no-key-required";
      p.authSource = "local";
    }
  }

  return merged;
}

export function parseModelSpec(
  spec: string,
  providers: ProviderConfig[],
): { provider: ProviderConfig; modelId: string } {
  const slashIdx = spec.indexOf("/");
  if (slashIdx === -1) {
    // Try matching provider id directly or searching model across providers
    const byId = providers.find((p) => p.id === spec);
    if (byId) return { provider: byId, modelId: byId.defaultModel };
    for (const p of providers) {
      if (p.models.some((m) => m.id === spec)) {
        return { provider: p, modelId: spec };
      }
    }
    const fallback = providers.find((p) => Boolean(p.apiKey) && !p.local) ?? providers[0];
    return { provider: fallback, modelId: spec };
  }

  const providerId = spec.slice(0, slashIdx).toLowerCase();
  const modelId = spec.slice(slashIdx + 1);
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(
      `Unknown provider "${providerId}". Run "/provider" to see available providers or add a custom one.`,
    );
  }
  return { provider, modelId: modelId || provider.defaultModel };
}

export function pickBestDefaultModel(providers: ProviderConfig[]): string {
  const priority = ["anthropic", "openai", "codex", "gemini", "openrouter", "deepseek", "xai", "groq", "ollama"];
  for (const id of priority) {
    const p = providers.find((item) => item.id === id && isProviderConnected(item));
    if (p) return `${p.id}/${p.defaultModel}`;
  }
  return "openai/gpt-5";
}

export function parseAgyModelsOutput(stdout: string): ProviderModelInfo[] {
  const models: ProviderModelInfo[] = [];
  const seen = new Set<string>();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.toLowerCase().startsWith("fetching ")) continue;
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const id = parts[0].trim();
    const name = parts.slice(1).join(" ").trim() || id;
    if (!id || seen.has(id) || /\s/.test(id)) continue;
    seen.add(id);
    models.push({
      id,
      name,
      contextWindow: /gemini/i.test(id) ? 1048576 : 200000,
      supportsTools: true,
      supportsReasoning: /high|xhigh|medium|neon|argon|opus|sonnet|pro/i.test(id),
      tags: ["agy", "live"],
    });
  }
  return models;
}

export async function probeAgyModels(
  timeoutMs = 15000,
): Promise<{ models: ProviderModelInfo[]; ok: boolean; error?: string }> {
  return await new Promise((resolve) => {
    execFile(
      "agy",
      ["models"],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            models: [],
            ok: false,
            error: (stderr || err.message || "agy models failed").trim(),
          });
          return;
        }
        const parsed = parseAgyModelsOutput(String(stdout || ""));
        resolve({
          models: parsed,
          ok: parsed.length > 0,
          error: parsed.length === 0 ? "No models returned by agy models" : undefined,
        });
      },
    );
  });
}

export interface ModelEffortVariant {
  label: string;
  model: ProviderModelInfo;
  spec: string;
}

export interface GroupedModelEntry {
  key: string;
  displayName: string;
  provider: ProviderConfig;
  variants: ModelEffortVariant[];
  isEffortGroup: boolean;
}

const EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max"] as const;

function extractVariantInfo(model: ProviderModelInfo): { baseName: string; variant?: string } {
  const parenMatch = model.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const baseName = parenMatch[1].trim();
    const variant = parenMatch[2].trim().toLowerCase();
    if (baseName && variant) {
      return { baseName, variant };
    }
  }
  const idMatch = model.id.match(/^(.+?)-(low|medium|high|xhigh|max)$/i);
  if (idMatch) {
    return { baseName: model.name, variant: idMatch[2].toLowerCase() };
  }
  return { baseName: model.name };
}

/**
 * Groups provider models that differ only by effort/variant (e.g. Low/Medium/High/XHigh)
 * into a single clean model row with an interactive effort selector.
 */
export function groupModelsForPicker(providers: ProviderConfig[]): GroupedModelEntry[] {
  const groups = new Map<string, GroupedModelEntry>();
  const order: string[] = [];

  for (const p of providers) {
    for (const m of p.models) {
      const { baseName, variant } = extractVariantInfo(m);
      const key = `${p.id}::${baseName.toLowerCase()}`;
      const spec = `${p.id}/${m.id}`;

      let entry = groups.get(key);
      if (!entry) {
        entry = {
          key,
          displayName: baseName,
          provider: p,
          variants: [],
          isEffortGroup: false,
        };
        groups.set(key, entry);
        order.push(key);
      }

      entry.variants.push({
        label: variant || "default",
        model: m,
        spec,
      });
    }
  }

  return order.map((key) => {
    const entry = groups.get(key)!;
    if (entry.variants.length === 1) {
      // Single variant: preserve the model's full display name (e.g. "GPT-OSS 120B (Medium)")
      entry.displayName = entry.variants[0].model.name;
      entry.isEffortGroup = false;
      return entry;
    }

    const effortSet = new Set<string>(EFFORT_ORDER);
    const allEfforts = entry.variants.every((v) => effortSet.has(v.label));
    entry.isEffortGroup = allEfforts;
    if (allEfforts) {
      entry.variants.sort(
        (a, b) =>
          EFFORT_ORDER.indexOf(a.label as (typeof EFFORT_ORDER)[number]) -
          EFFORT_ORDER.indexOf(b.label as (typeof EFFORT_ORDER)[number]),
      );
    }
    return entry;
  });
}

export async function probeLocalOllamaModels(baseUrl = "http://127.0.0.1:11434"): Promise<string[]> {
  try {
    const cleanBase = baseUrl.replace(/\/v1\/?$/, "");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${cleanBase}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

const NON_CHAT_OPENAI_RE =
  /(?:^|[-_/])(whisper|tts|dall-e|embedding|text-embedding|moderation|omni-moderation|babbage|davinci|audio|realtime|transcribe|sora|gpt-image|chatgpt-image|instruct|search-preview|search-api|deep-research|computer-use|codex-mini|gpt-5-codex|o1-pro|o3-pro|gpt-5-pro)(?:$|[-_/.])|^codex-/i;

const NON_CHAT_GEMINI_RE =
  /(?:embedding|aqa|imagen|veo|tts|native-audio|robotics|bisociate|lyria|nano-banana|image-generation|learnlm|computer-use|deep-research)/i;

const NON_CHAT_GROQ_RE =
  /(?:whisper|playai-tts|llama-guard|prompt-guard|safeguard|orpheus)/i;

const NON_CHAT_MISTRAL_RE =
  /(?:mistral-embed|mistral-moderation|voxtral|mistral-ocr)/i;

function geminiModelRank(id: string): number {
  const lower = id.toLowerCase();
  if (lower.startsWith("gemini-3")) return 100;
  if (lower.startsWith("gemini-2.5-pro")) return 95;
  if (lower.startsWith("gemini-2.5-flash")) return 90;
  if (lower.startsWith("gemini-2.5")) return 85;
  if (lower.startsWith("gemini-2.0")) return 70;
  if (lower.startsWith("gemini-")) return 60;
  if (lower.startsWith("gemma-")) return 30;
  return 10;
}

function mergeLiveModels(
  live: ProviderModelInfo[],
  fallback: ProviderModelInfo[],
): ProviderModelInfo[] {
  if (live.length === 0) return fallback;
  const knownById = new Map(fallback.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const merged: ProviderModelInfo[] = [];

  for (const item of live) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    const known = knownById.get(item.id);
    if (known) {
      merged.push({
        ...known,
        contextWindow: item.contextWindow || known.contextWindow,
        tags: Array.from(new Set([...(known.tags ?? []), "live"])),
      });
    } else {
      merged.push(item);
    }
  }

  return merged.length > 0 ? merged : fallback;
}

/**
 * Fetch the live list of models available to a connected provider's credentials.
 * Falls back to the provider's curated static list if the endpoint is unreachable or unsupported.
 */
export async function fetchProviderModels(
  provider: ProviderConfig,
  timeoutMs = 5000,
): Promise<{ models: ProviderModelInfo[]; live: boolean; error?: string }> {
  if (!isProviderConnected(provider)) {
    return { models: provider.models, live: false, error: "Provider not connected" };
  }

  const base = provider.baseUrl.replace(/\/+$/, "");

  // Google Antigravity CLI (agy models)
  if (provider.authSource === "agy-cli" || provider.apiKey === "agy-cli") {
    const probed = await probeAgyModels(15000);
    if (!probed.ok) {
      return { models: provider.models, live: false, error: probed.error };
    }
    return { models: mergeLiveModels(probed.models, provider.models), live: true };
  }

  // Ollama uses /api/tags
  if (provider.id === "ollama") {
    const names = await probeLocalOllamaModels(base);
    if (names.length === 0) {
      return { models: [], live: false, error: "Ollama not running or no local models pulled" };
    }
    const live: ProviderModelInfo[] = names.map((id) => ({
      id,
      name: formatModelDisplayName(id),
      contextWindow: 65536,
      supportsTools: true,
      supportsReasoning: /r1|qwq|thinking|reasoning/i.test(id),
      tags: ["local", "live"],
    }));
    return { models: live, live: true };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    if (provider.protocol === "gemini") {
      const headers: Record<string, string> = { ...(provider.headers ?? {}) };
      if (
        provider.apiKey &&
        (provider.apiKey.startsWith("ya29.") || provider.authSource === "gcloud")
      ) {
        headers["Authorization"] = `Bearer ${provider.apiKey}`;
      } else if (provider.apiKey) {
        headers["x-goog-api-key"] = provider.apiKey;
      }

      const res = await fetch(`${base}/models?pageSize=100`, { headers, signal: ctrl.signal });
      if (!res.ok) {
        return { models: provider.models, live: false, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        models?: Array<{
          name?: string;
          displayName?: string;
          inputTokenLimit?: number;
          supportedGenerationMethods?: string[];
        }>;
      };
      const live: ProviderModelInfo[] = (data.models ?? [])
        .filter((m) => {
          const methods = m.supportedGenerationMethods ?? [];
          if (!methods.includes("generateContent")) return false;
          const id = (m.name || "").replace(/^models\//, "");
          return Boolean(id) && !NON_CHAT_GEMINI_RE.test(id);
        })
        .map((m) => {
          const id = (m.name || "").replace(/^models\//, "");
          const supportsReasoning = /2\.5|3\.|thinking|pro/i.test(id);
          return {
            id,
            name: formatModelDisplayName(id, m.displayName),
            contextWindow: m.inputTokenLimit || 1048576,
            supportsTools: true,
            supportsReasoning,
            reasoningLevels: inferReasoningLevels(provider.id, id, supportsReasoning),
            tags: ["live"],
          };
        })
        .sort((a, b) => {
          const rankDiff = geminiModelRank(b.id) - geminiModelRank(a.id);
          if (rankDiff !== 0) return rankDiff;
          return b.id.localeCompare(a.id);
        });

      return { models: mergeLiveModels(live, provider.models), live: live.length > 0 };
    }

    if (provider.protocol === "anthropic") {
      const headers: Record<string, string> = {
        "anthropic-version": "2023-06-01",
        ...(provider.headers ?? {}),
      };
      if (provider.apiKey) {
        if (provider.apiKey.startsWith("sk-ant-oat") || provider.authSource === "claude-cli") {
          headers["Authorization"] = `Bearer ${provider.apiKey}`;
          headers["anthropic-beta"] = "oauth-2025-04-20";
        } else {
          headers["x-api-key"] = provider.apiKey;
        }
      }

      const res = await fetch(`${base}/models?limit=100`, { headers, signal: ctrl.signal });
      if (!res.ok) {
        return { models: provider.models, live: false, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        data?: Array<{ id?: string; display_name?: string }>;
      };
      const live: ProviderModelInfo[] = (data.data ?? [])
        .filter((m) => Boolean(m.id))
        .map((m) => {
          const id = m.id!;
          const supportsReasoning = /claude-(?:opus-4|sonnet-4|3-7)/i.test(id);
          return {
            id,
            name: formatModelDisplayName(id, m.display_name),
            contextWindow: 200000,
            supportsTools: true,
            supportsReasoning,
            reasoningLevels: inferReasoningLevels(provider.id, id, supportsReasoning),
            tags: ["live"],
          };
        });

      return { models: mergeLiveModels(live, provider.models), live: live.length > 0 };
    }

    // OpenAI / Codex / OpenRouter / DeepSeek / xAI / Groq / LM Studio / Custom
    const headers: Record<string, string> = { ...(provider.headers ?? {}) };
    if (provider.apiKey && provider.apiKey !== "local-no-key-required") {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }
    const res = await fetch(`${base}/models`, { headers, signal: ctrl.signal });
    if (!res.ok) {
      if (provider.id === "lmstudio") {
        return { models: [], live: false, error: `HTTP ${res.status}` };
      }
      return { models: provider.models, live: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        context_length?: number;
        architecture?: { output_modalities?: string[] };
      }>;
    };
    const raw = (data.data ?? []).filter((m) => {
      if (!m.id) return false;
      if (provider.id === "openai" || provider.id === "codex") {
        if (NON_CHAT_OPENAI_RE.test(m.id)) return false;
        return /^(gpt-|o1|o3|o4|chatgpt)/i.test(m.id);
      }
      if (provider.id === "groq" && NON_CHAT_GROQ_RE.test(m.id)) return false;
      if (provider.id === "mistral" && NON_CHAT_MISTRAL_RE.test(m.id)) return false;
      if (provider.id === "openrouter" && Array.isArray(m.architecture?.output_modalities)) {
        if (!m.architecture!.output_modalities!.includes("text")) return false;
      }
      return !NON_CHAT_OPENAI_RE.test(m.id);
    });

    // Deduplicate dated OpenAI/Codex snapshots when the base alias exists in the live list
    let filtered = raw;
    if (provider.id === "openai" || provider.id === "codex") {
      const liveIds = new Set(raw.map((m) => m.id!));
      filtered = raw.filter((m) => {
        const baseAlias = m.id!.replace(/-(?:20\d{6}|20\d{2}-\d{2}-\d{2})$/, "");
        return baseAlias === m.id! || !liveIds.has(baseAlias);
      });
    }

    if (provider.id === "lmstudio" && filtered.length === 0) {
      return { models: [], live: false, error: "No active model loaded in LM Studio" };
    }

    // Cap OpenRouter's huge catalog to a practical top slice while keeping curated ones
    const capped = provider.id === "openrouter" ? filtered.slice(0, 80) : filtered;
    const live: ProviderModelInfo[] = capped
      .map((m) => {
        const id = m.id!;
        const supportsReasoning = /^(o1|o3|o4|gpt-5|deepseek-r1|deepseek-reasoner)/i.test(id);
        return {
          id,
          name: formatModelDisplayName(id, m.name),
          contextWindow: m.context_length || 128000,
          supportsTools: true,
          supportsReasoning,
          reasoningLevels: inferReasoningLevels(provider.id, id, supportsReasoning),
          tags: ["live"],
        };
      })
      .sort((a, b) => b.id.localeCompare(a.id));

    if (provider.id === "lmstudio") {
      return { models: live, live: live.length > 0 };
    }
    return { models: mergeLiveModels(live, provider.models), live: live.length > 0 };
  } catch (err) {
    return {
      models: provider.id === "lmstudio" ? [] : provider.models,
      live: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeCustomEndpointModels(
  input: { protocol: ProviderProtocol; baseUrl: string; apiKey?: string },
  timeoutMs = 6000,
): Promise<{ models: ProviderModelInfo[]; live: boolean; error?: string }> {
  const probeProvider: ProviderConfig = {
    id: "custom-probe",
    name: "Custom Probe",
    protocol: input.protocol,
    baseUrl: input.baseUrl.trim(),
    envKeys: [],
    apiKey: input.apiKey?.trim() || "local-no-key-required",
    authSource: input.apiKey?.trim() ? "config" : "local",
    models: [],
    defaultModel: "default",
    custom: true,
  };
  return await fetchProviderModels(probeProvider, timeoutMs);
}
