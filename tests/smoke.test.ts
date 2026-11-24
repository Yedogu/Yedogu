import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import type { AddressInfo } from "node:net";
import { deriveChatTitle, YedoguEngine } from "../src/agents/orchestrator.js";
import { YedoguDaemon } from "../src/server/daemon.js";
import { loadGlobalConfig, saveGlobalConfig } from "../src/config/store.js";
import { renderWarRoomHtml } from "../src/web/ui.js";
import { checkScope, redactEvidence } from "../src/scope/guard.js";
import { calculateCvss31 } from "../src/tools/findings.js";
import { splitMessageChunks } from "../src/channels/types.js";
import {
  buildProviderHttpError,
  buildProviderNetworkError,
  formatFriendlyError,
} from "../src/providers/errors.js";
import { buildGeminiFunctionDeclarations } from "../src/providers/client.js";
import { BUILTIN_TOOL_SCHEMAS } from "../src/tools/index.js";
import {
  fetchProviderModels,
  formatModelDisplayName,
  getBuiltinProviders,
  groupModelsForPicker,
  isProviderConnected,
  parseAgyModelsOutput,
} from "../src/providers/registry.js";
import {
  SLASH_COMMAND_SPECS,
  SlashMenuController,
  filterAgentMentions,
  filterSlashCommands,
  formatSlashCompletion,
} from "../src/tui/slashMenu.js";
import {
  ConfirmModal,
  FormModal,
  InputModal,
  SelectModal,
  filterSelectOptions,
  type ConfirmOutcome,
  type FormOutcome,
  type InputOutcome,
  type ModalOutcome,
} from "../src/tui/popup.js";
import {
  PALETTE,
  getActiveTheme,
  listThemes,
  renderCard,
  renderThemeSwatch,
  setActiveTheme,
  stripAnsi,
  visibleLength,
} from "../src/tui/theme.js";
import { StreamMarkdownWriter } from "../src/tui/markdown.js";
import {
  renderCheckGrid,
  renderGraphFrame,
  renderRankList,
  renderScoreDots,
  renderSeverityStack,
  renderSpecRows,
  renderTree,
  renderUptimeStrip,
} from "../src/tui/components.js";
import {
  renderBanner,
  renderBinaryTriageTerminal,
  renderFindingsTerminal,
  renderHttpCaptureTerminal,
  renderScopeTerminal,
  renderStatusTerminal,
} from "../src/tui/renderer.js";

test("Scope guard enforces allow/deny wildcards and CIDRs", () => {
  const scope = {
    mode: "enforced" as const,
    allow: ["*.example.com", "10.10.0.0/16"],
    deny: ["admin.example.com"],
    engagementName: "test",
  };
  assert.equal(checkScope("https://api.example.com/v1/users", scope).allowed, true);
  assert.equal(checkScope("https://admin.example.com/delete", scope).allowed, false);
  assert.equal(checkScope("http://10.10.42.5:8080/health", scope).allowed, true);
  assert.equal(checkScope("https://evil.org/", scope).allowed, false);
});

test("Evidence hygiene redacts cookies, Authorization headers, JWTs, and API keys", () => {
  const fakeSlackToken = ["xoxb", "1234567890", "abcdef1234567890"].join("-");
  const raw =
    "Authorization: Bearer sk-proj-abcdef1234567890abcdef123456\n" +
    "Cookie: session=supersecret12345; theme=dark\n" +
    "Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signaturepart12345\n" +
    "AWS: AKIAIOSFODNN7EXAMPLE\n" +
    "Telegram: 123456789:AAHfakeTelegramBotTokenSecretValue12345\n" +
    `Slack: ${fakeSlackToken}`;
  const redacted = redactEvidence(raw);
  assert.ok(!redacted.includes("supersecret12345"));
  assert.ok(!redacted.includes("sk-proj-abcdef"));
  assert.ok(!redacted.includes("signaturepart12345"));
  assert.ok(!redacted.includes("AKIAIOSFODNN7EXAMPLE"));
  assert.ok(!redacted.includes("AAHfakeTelegramBotTokenSecretValue12345"));
  assert.ok(!redacted.includes(fakeSlackToken.slice(0, 15)));
});

test("CVSS 3.1 base score calculation matches standard vectors", () => {
  const crit = calculateCvss31("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
  assert.ok(crit);
  assert.equal(crit.score, 9.8);
  assert.equal(crit.severity, "critical");

  const high = calculateCvss31("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N");
  assert.ok(high);
  assert.equal(high.score, 8.1);
  assert.equal(high.severity, "high");
});

test("Engine registers 8 specialist security agents and 11+ universal providers", () => {
  const engine = new YedoguEngine(process.cwd());
  const agents = engine.getAgents();
  assert.ok(agents.length >= 8);
  for (const id of [
    "commander",
    "recon",
    "web-hunter",
    "reverser",
    "exploit-dev",
    "cloud-iam",
    "web3-auditor",
    "triage-report",
  ]) {
    assert.ok(agents.some((a) => a.id === id), `Missing agent ${id}`);
  }

  const providers = engine.getProviders();
  for (const pid of ["openai", "codex", "anthropic", "gemini", "openrouter", "deepseek", "xai", "groq", "ollama"]) {
    assert.ok(providers.some((p) => p.id === pid), `Missing provider ${pid}`);
  }

  // Test per-agent model pinning (and restore afterward)
  const prevPin = engine.config.agentModels["reverser"];
  const pinned = engine.setModel("anthropic/claude-opus-4-6", "reverser");
  assert.equal(pinned, "anthropic/claude-opus-4-6");
  assert.equal(engine.getEffectiveModelForAgent("reverser"), "anthropic/claude-opus-4-6");
  if (prevPin) {
    engine.setModel(prevPin, "reverser");
  } else {
    delete engine.config.agentModels["reverser"];
    delete engine.session.agentModels["reverser"];
  }
});

test("Daemon serves Browser War-Room UI, State API, Findings, JS Recon, and Scope-blocked HTTP Forge", async () => {
  const engine = new YedoguEngine(process.cwd());
  const daemon = new YedoguDaemon(engine);
  const url = await daemon.start(0, "127.0.0.1");

  try {
    // 1. Browser UI
    const uiRes = await fetch(`${url}/`);
    assert.equal(uiRes.status, 200);
    const html = await uiRes.text();
    assert.ok(html.includes("Yedogu — Security Research Harness"));
    assert.ok(html.includes("HTTP Forge"));

    // 1b. Binary triage against current Node executable
    const reRes = await fetch(`${url}/api/re/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: process.execPath }),
    });
    assert.equal(reRes.status, 200);
    const reData = (await reRes.json()) as any;
    assert.ok(reData.artifact.sha256.length === 64);
    assert.ok(reData.artifact.sections.length > 0);

    // 2. State API
    const stateRes = await fetch(`${url}/api/state`);
    assert.equal(stateRes.status, 200);
    const state = (await stateRes.json()) as any;
    assert.equal(state.agents.length, 8);

    // 3. Enforce Scope & test HTTP block
    await fetch(`${url}/api/scope`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "enforced" }),
    });
    const httpRes = await fetch(`${url}/api/http/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GET", url: "https://out-of-scope.invalid/" }),
    });
    const httpData = (await httpRes.json()) as any;
    assert.equal(httpData.capture.scopeAllowed, false);
    assert.ok(httpData.blockedReason.includes("ENFORCED"));

    // 4. Findings Ledger & Sanitized Report Export
    const fRes = await fetch(`${url}/api/findings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Cross-Tenant Account Takeover via Unscoped GraphQL Mutation",
        severity: "critical",
        cvssVector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N",
        target: "https://api.example.com/graphql",
        summary: "Authorization: Bearer secret_token_12345678901234567890 leaks other tenant data.",
        impact: "Full cross-tenant read/write.",
        reproduction: "Replay mutation with victim node ID.",
      }),
    });
    assert.equal(fRes.status, 201);

    const rptRes = await fetch(`${url}/api/report?format=hackerone`);
    const rpt = (await rptRes.json()) as any;
    assert.ok(rpt.markdown.includes("Cross-Tenant Account Takeover"));
    assert.ok(!rpt.markdown.includes("secret_token_12345678901234567890"));

    // 5. JS Recon on workspace src
    const jsRes = await fetch(`${url}/api/re/js-recon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: path.resolve(process.cwd(), "src") }),
    });
    assert.equal(jsRes.status, 200);
    const jsData = (await jsRes.json()) as any;
    assert.ok(jsData.recon.filesScanned >= 10);
  } finally {
    await daemon.stop();
  }
});

test("Slash command menu shows all commands on '/', filters as user types, and Tab autocompletes first match", () => {
  // Typing '/' returns every registered slash command
  const all = filterSlashCommands("/");
  assert.ok(all);
  assert.equal(all.length, SLASH_COMMAND_SPECS.length);
  assert.equal(all[0].name, "/browser");

  // Typing '/co' filters to prefix matches first
  const co = filterSlashCommands("/co");
  assert.ok(co);
  assert.deepEqual(
    co.map((c) => c.name),
    ["/connect", "/compact", "/disconnect", "/scope"],
  );
  assert.equal(formatSlashCompletion(co[0]), "/connect ");

  // Typing '/br' filters to '/browser' (no trailing space for no-arg command)
  const br = filterSlashCommands("/br");
  assert.ok(br);
  assert.deepEqual(
    br.map((c) => c.name),
    ["/browser"],
  );
  assert.equal(formatSlashCompletion(br[0]), "/browser");

  // Typing a space closes the menu
  assert.equal(filterSlashCommands("/model "), null);
  assert.equal(filterSlashCommands("hello"), null);

  // Interactive controller renders to a mock TTY stream, navigates, and clears cleanly
  const chunks: string[] = [];
  const fakeOut = {
    isTTY: true,
    columns: 100,
    rows: 40,
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  const menu = new SlashMenuController(fakeOut);
  menu.sync("/", 6);
  assert.equal(menu.isOpen, true);
  assert.equal(menu.currentMatches.length, SLASH_COMMAND_SPECS.length);
  assert.equal(menu.getSelectedCompletion(), "/browser");

  // Filtering resets highlight to first match
  menu.move(2, 6);
  assert.equal(menu.currentSelectedIndex, 2);
  menu.sync("/mo", 8);
  assert.equal(menu.currentSelectedIndex, 0);
  assert.equal(menu.getSelectedCompletion(), "/model ");

  // Clearing emits erase sequence and marks menu closed
  menu.clear(8);
  assert.equal(menu.isOpen, false);
  assert.ok(chunks.some((chunk) => chunk.includes("/browser")));
  assert.ok(chunks.some((chunk) => chunk.includes("/model")));
});

test("Inline '@' agent mention popover filters agents and autocompletes '@agent '", () => {
  const agents = [
    { id: "commander", title: "Red-Team Lead", model: "openai/gpt-5-codex", active: true },
    { id: "reverser", title: "Binary Reverse Engineer", model: "anthropic/claude-opus-4-6" },
    { id: "recon", title: "Attack Surface Mapper", model: "gemini/gemini-2.5-pro" },
  ];

  const all = filterAgentMentions("@", agents);
  assert.ok(all);
  assert.equal(all.length, 3);

  const rev = filterAgentMentions("@rev", agents);
  assert.ok(rev);
  assert.equal(rev.length, 1);
  assert.equal(rev[0].id, "reverser");
  assert.equal(filterAgentMentions("@reverser ", agents), null);

  const chunks: string[] = [];
  const fakeOut = {
    isTTY: true,
    columns: 96,
    rows: 36,
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  const menu = new SlashMenuController(fakeOut, () => agents);
  menu.sync("@re", 7);
  assert.equal(menu.isOpen, true);
  assert.equal(menu.currentMode, "mention");
  assert.equal(menu.currentMentionMatches.length, 2);
  assert.equal(menu.getSelectedCompletion(), "@reverser ");
  menu.move(1, 7);
  assert.equal(menu.getSelectedCompletion(), "@recon ");
  menu.clear(7);
  assert.equal(menu.isOpen, false);
  assert.ok(chunks.some((c) => c.includes("Route to Agent")));
});

test("Interactive SelectModal, InputModal (secret masking), and ConfirmModal handle keyboard navigation cleanly", () => {
  const chunks: string[] = [];
  const fakeOut = {
    isTTY: true,
    columns: 92,
    rows: 32,
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  // 1. Fuzzy filter + Tab mode toggle + Enter selection in SelectModal
  let outcome: ModalOutcome<string> | null = null;
  let pinned = false;
  const select = new SelectModal<string>(
    {
      title: "Select Model",
      subtitle: "Target: Default",
      options: [
        { value: "openai/gpt-5-codex", label: "openai/gpt-5-codex", description: "GPT-5 Codex" },
        { value: "anthropic/claude-opus-4-6", label: "anthropic/claude-opus-4-6", description: "Claude Opus 4.6" },
        { value: "gemini/gemini-2.5-pro", label: "gemini/gemini-2.5-pro", description: "Gemini 2.5 Pro" },
      ],
      onTab: () => {
        pinned = !pinned;
        return { subtitle: pinned ? "Pin → @reverser" : "Target: Default" };
      },
    },
    (res) => {
      outcome = res;
    },
    fakeOut,
  );

  select.open();
  select.handleKey("", { name: "tab" });
  assert.equal(pinned, true);
  assert.ok(chunks.some((c) => c.includes("Pin → @reverser")));

  // Fuzzy filter "opus"
  select.handleKey("opus", {});
  assert.equal(select.currentFiltered.length, 1);
  assert.equal(select.currentFiltered[0].value, "anthropic/claude-opus-4-6");
  select.handleKey("\r", { name: "return" });
  assert.ok(outcome);
  assert.equal((outcome as ModalOutcome<string>).action, "select");
  if ((outcome as ModalOutcome<string>).action === "select") {
    assert.equal((outcome as { action: "select"; value: string }).value, "anthropic/claude-opus-4-6");
  }

  // Fuzzy subsequence scoring
  const fuzzy = filterSelectOptions(
    [
      { value: "a", label: "anthropic/claude-opus-4-6" },
      { value: "b", label: "openai/gpt-5" },
    ],
    "cop4",
  );
  assert.equal(fuzzy[0]?.value, "a");

  // 2. Secret InputModal masks API keys and enforces validation
  const secretChunks: string[] = [];
  const secretOut = {
    isTTY: true,
    columns: 90,
    rows: 30,
    write: (s: string) => {
      secretChunks.push(s);
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  let inputRes: InputOutcome | null = null;
  const inputModal = new InputModal(
    {
      title: "Connect Anthropic",
      secret: true,
      validate: (v) => (v.length < 6 ? "Too short" : null),
    },
    (res) => {
      inputRes = res;
    },
    secretOut,
  );
  inputModal.open();
  inputModal.handleKey("sk", {});
  inputModal.handleKey("\r", { name: "return" });
  assert.equal(inputRes, null);
  assert.ok(secretChunks.some((c) => c.includes("Too short")));

  inputModal.handleKey("-ant-secret-9999", {});
  assert.ok(!secretChunks.some((c) => c.includes("sk-ant-secret-9999")), "Secret key must never be echoed raw");
  assert.ok(secretChunks.some((c) => c.includes("••••")));
  inputModal.handleKey("\r", { name: "return" });
  assert.deepEqual(inputRes, { action: "submit", value: "sk-ant-secret-9999" });

  // 3. ConfirmModal responds to arrow toggle & y/n
  let confirmRes: ConfirmOutcome | null = null;
  const confirm = new ConfirmModal(
    { title: "Remove Rule", message: "Remove *.example.com?", danger: true },
    (res) => {
      confirmRes = res;
    },
    fakeOut,
  );
  confirm.open();
  confirm.handleKey("", { name: "right" });
  confirm.handleKey("\r", { name: "return" });
  assert.deepEqual(confirmRes, { confirmed: true });

  // 4. mdxcn-styled FormModal renders ①②③ steps + callout, masks secrets, advances multi-fields on Enter
  const formChunks: string[] = [];
  const formOut = {
    isTTY: true,
    columns: 92,
    rows: 34,
    write: (s: string) => {
      formChunks.push(s);
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  let formRes: FormOutcome | null = null;
  const form = new FormModal(
    {
      title: "Connect Slack",
      subtitle: "Socket Mode",
      steps: [
        "Enable `Socket Mode` and create `xapp-...`",
        "Install bot for `xoxb-...`",
        "Paste both tokens below",
      ],
      callout: "No public URL needed.",
      fields: [
        {
          id: "token",
          label: "Bot Token",
          secret: true,
          validate: (v) => (!v.startsWith("xoxb-") ? "Must start with xoxb-" : null),
        },
        {
          id: "appToken",
          label: "App Token",
          secret: true,
          validate: (v) => (!v.startsWith("xapp-") ? "Must start with xapp-" : null),
        },
      ],
    },
    (res) => {
      formRes = res;
    },
    formOut,
  );

  form.open();
  const initialRender = stripAnsi(formChunks.join(""));
  assert.ok(initialRender.includes("①"));
  assert.ok(initialRender.includes("②"));
  assert.ok(initialRender.includes("③"));
  assert.ok(initialRender.includes("No public URL needed."));

  // Invalid first field stays on field 0 with error
  form.handleKey("bad-token", {});
  form.handleKey("\r", { name: "return" });
  assert.equal(formRes, null);
  assert.equal(form.currentFieldIndex, 0);
  assert.ok(stripAnsi(formChunks.join("")).includes("Must start with xoxb-"));

  // Clear with Ctrl+U, enter valid xoxb token, Enter moves to field 1
  form.handleKey("", { ctrl: true, name: "u" });
  form.handleKey("xoxb-valid-bot-token", {});
  form.handleKey("\r", { name: "return" });
  assert.equal(form.currentFieldIndex, 1);
  assert.equal(formRes, null);

  // Enter valid xapp token and Enter submits both values (masked while typing)
  form.handleKey("xapp-valid-app-token", {});
  assert.ok(!formChunks.some((c) => c.includes("xoxb-valid-bot-token")), "Secret token must stay masked by default");
  form.handleKey("\r", { name: "return" });
  assert.deepEqual(formRes, {
    action: "submit",
    values: { token: "xoxb-valid-bot-token", appToken: "xapp-valid-app-token" },
  });
});

test("Dynamic termcn/WebTUI themes, box styles, and mdxcn callouts/tables render cleanly", () => {
  const prev = getActiveTheme().id;
  try {
    assert.ok(listThemes().length >= 8);
    setActiveTheme("catppuccin");
    const catAccent = PALETTE.accent;
    setActiveTheme("gruvbox");
    const gruvAccent = PALETTE.accent;
    assert.notEqual(catAccent, gruvAccent);
    assert.ok(renderThemeSwatch(getActiveTheme()).includes("█"));

    // All border styles align every row to exact card width
    for (const style of ["round", "square", "double", "dashed"] as const) {
      const card = renderCard(["Hello World", "Line 2"], {
        title: "✦ Test",
        rightTitle: "v1",
        footer: "^K palette",
        width: 50,
        borderStyle: style,
      });
      const rows = card.split("\n");
      for (const row of rows) {
        assert.equal(visibleLength(row), 52, `Misaligned border for style=${style}: ${stripAnsi(row)}`);
      }
    }

    // mdxcn streaming markdown callouts, tables, and task items
    let mdOut = "";
    const md = new StreamMarkdownWriter((chunk) => {
      mdOut += chunk;
    });
    md.push(
      "> [!WARNING] Scope enforcement active\n" +
        "> Check rules before sending.\n\n" +
        "| Endpoint | Status |\n" +
        "| --- | --- |\n" +
        "| `/api/v1` | 200 |\n\n" +
        "- [x] Verified auth\n" +
        "- [ ] Check IDOR\n",
    );
    md.flush();
    const plain = stripAnsi(mdOut);
    assert.ok(plain.includes("▲ WARNING"));
    assert.ok(plain.includes("├─"));
    assert.ok(plain.includes("✓ Verified auth"));
    assert.ok(plain.includes("○ Check IDOR"));
  } finally {
    setActiveTheme(prev);
  }
});

test("Web UI serves minimal workspace, Command Palette dialog, theme sync, and channels view", async () => {
  const engine = new YedoguEngine(process.cwd());
  const prevTheme = engine.config.theme;
  const daemon = new YedoguDaemon(engine);
  const url = await daemon.start(0, "127.0.0.1");
  try {
    const html = await (await fetch(`${url}/`)).text();
    assert.ok(html.includes('data-theme="obsidian"'));
    assert.ok(html.includes('id="cmdPaletteDlg"'));
    assert.ok(html.includes('id="swarmDrawer"'));
    assert.ok(html.includes('id="tab-console"'));
    assert.ok(html.includes('id="tab-http"'));
    assert.ok(html.includes('id="tab-re"'));
    assert.ok(html.includes('id="tab-findings"'));
    assert.ok(html.includes('id="tab-providers"'));
    assert.ok(html.includes('id="tab-channels"'));
    assert.ok(html.includes("Connect Messaging Channel"));

    // Legacy /assets/webtui.css endpoint remains available
    const cssRes = await fetch(`${url}/assets/webtui.css`);
    assert.equal(cssRes.status, 200);

    const res = await fetch(`${url}/api/theme`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "slate" }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.theme, "slate");
  } finally {
    engine.setTheme(prevTheme || "claude");
    await daemon.stop();
  }
});

test("Custom provider edits persist models and endpoints, preserve credentials, and invalidate live models", async () => {
  const modelServer = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "discovered-old-model" }] }));
  });
  await new Promise<void>((resolve) => modelServer.listen(0, "127.0.0.1", resolve));
  const modelPort = (modelServer.address() as AddressInfo).port;
  const engine = new YedoguEngine(process.cwd());
  const previousConfig = structuredClone(engine.config);
  const daemon = new YedoguDaemon(engine);
  const url = await daemon.start(0);
  const id = `custom-edit-test-${Date.now()}`;
  const request = (method: string, body: unknown) => fetch(`${url}/api/providers/custom`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    const added = await request("POST", {
      id, name: "Original endpoint", protocol: "openai",
      baseUrl: `http://127.0.0.1:${modelPort}/old/v1`,
      apiKey: "sk-custom-edit-test-secret", defaultModel: "old-model", models: ["kept-model"],
    });
    assert.equal(added.status, 200);
    assert.equal((await added.json() as any).provider.apiKey, "••••");
    engine.config.credentials[id].headers = { "X-Custom-Header": "keep-me" };
    engine.setModel(`${id}/old-model`);
    engine.setModel(`${id}/old-model`, "reverser");
    engine.setModel(`${id}/kept-model`, "recon");
    await engine.refreshProviderModels(id);
    assert.equal(engine.hasLiveModelsCached(id), true);
    assert.ok(engine.getProviders().find(p => p.id === id)!.models.some(m => m.id === "kept-model"));

    const newUrl = `http://127.0.0.1:${modelPort}/new/v1`;
    const edited = await request("PATCH", {
      id, name: "Edited endpoint", protocol: "anthropic", baseUrl: newUrl,
      apiKey: "  ", defaultModel: "new-model", models: ["kept-model", "kept-model", "new-model"],
    });
    assert.equal(edited.status, 200);
    const provider = (await edited.json() as any).provider;
    assert.equal(provider.name, "Edited endpoint");
    assert.equal(provider.baseUrl, newUrl);
    assert.equal(provider.protocol, "anthropic");
    assert.equal(provider.apiKey, "••••");
    assert.deepEqual(provider.models.map((m: any) => m.id), ["new-model", "kept-model"]);
    assert.equal(engine.hasLiveModelsCached(id), false);
    assert.equal(engine.session.activeModel, `${id}/new-model`);
    assert.equal(engine.session.agentModels.reverser, `${id}/new-model`);
    assert.equal(engine.session.agentModels.recon, `${id}/kept-model`);
    const saved = loadGlobalConfig();
    assert.equal(saved.defaultModel, `${id}/new-model`);
    assert.equal(saved.agentModels.reverser, `${id}/new-model`);
    assert.equal(saved.credentials[id].apiKey, "sk-custom-edit-test-secret");
    assert.equal(saved.credentials[id].baseUrl, newUrl);
    assert.deepEqual(saved.credentials[id].headers, { "X-Custom-Header": "keep-me" });
    assert.equal(saved.customProviders.filter(p => p.id === id).length, 1);

    // A partial default-model edit replaces the old default and retains additional models.
    const partial = await request("PATCH", { id, defaultModel: "newer-model", apiKey: "sk-replacement-test-secret" });
    assert.equal(partial.status, 200);
    assert.deepEqual((await partial.json() as any).provider.models.map((m: any) => m.id), ["newer-model", "kept-model"]);
    assert.equal(loadGlobalConfig().credentials[id].apiKey, "sk-replacement-test-secret");
    assert.equal(engine.session.activeModel, `${id}/newer-model`);

    for (const body of [
      { id, baseUrl: "invalid-url" },
      { id, protocol: "unsupported" },
      { id, defaultModel: "model-one,model-two" },
      { id, models: [123] },
      { id: "openai", name: "Cannot edit builtins" },
      { id: "missing-custom-provider", name: "Missing" },
    ]) {
      const before = JSON.stringify(engine.config);
      const invalid = await request("PATCH", body);
      assert.equal(invalid.status, 400);
      assert.ok((await invalid.json() as any).error);
      assert.equal(JSON.stringify(engine.config), before);
    }
    const duplicate = await request("POST", { id, name: "Duplicate" });
    assert.equal(duplicate.status, 400);
    const state = await engine.getSnapshot();
    const publicProvider = state.providers.find(p => p.id === id)!;
    assert.deepEqual(publicProvider.configuredModels?.map(m => m.id), ["newer-model", "kept-model"]);
    assert.ok(!JSON.stringify(publicProvider).includes("sk-replacement-test-secret"));
  } finally {
    engine.config = previousConfig;
    saveGlobalConfig(previousConfig);
    await daemon.stop();
    await new Promise<void>((resolve) => modelServer.close(() => resolve()));
  }
});

test("Custom provider editor loads saved settings, cancels without saving, and submits edits", async () => {
  const html = renderWarRoomHtml("editor-test");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  new vm.Script(script); // Validate the JavaScript after template-string escaping.
  const fields = ["cpId", "cpName", "cpProto", "cpUrl", "cpKey", "cpModel", "cpModels", "cpSaveBtn", "cpCancelBtn"];
  const elements: Record<string, any> = {};
  for (const id of [...fields, "customProviderFormTitle", "customProviderDisclosure"]) {
    elements[id] = { value: "", disabled: false, hidden: true, focus() {}, scrollIntoView() {} };
  }
  elements.customProviderForm = {
    reset() { fields.forEach(id => elements[id].value = ""); elements.cpProto.value = "openai"; },
    reportValidity: () => true,
    querySelectorAll: () => fields.map(id => elements[id]),
  };
  const calls: any[] = [];
  const context = vm.createContext({
    STATE: { providers: [{
      id: "custom", name: "Saved name", custom: true, protocol: "anthropic",
      baseUrl: "https://example.com/v1", apiKey: "masked-key", defaultModel: "old-model",
      models: [{ id: "discovered-model" }], configuredModels: [{ id: "old-model" }, { id: "kept-model" }],
    }] },
    document: { getElementById: (id: string) => elements[id], querySelectorAll: () => [] },
    api: async (path: string, options: unknown) => { calls.push({ path, options }); },
    toast() {}, refreshState: async () => {},
  });
  vm.runInContext(script.slice(script.indexOf("let EDITING_CUSTOM_PROVIDER_ID"), script.indexOf("async function pinAgentModel")), context);
  vm.runInContext("editCustomProviderUi('custom')", context);
  assert.equal(elements.cpId.readOnly, true);
  assert.equal(elements.cpName.value, "Saved name");
  assert.equal(elements.cpUrl.value, "https://example.com/v1");
  assert.equal(elements.cpProto.value, "anthropic");
  assert.equal(elements.cpModel.value, "old-model");
  assert.equal(elements.cpModels.value, "kept-model");
  assert.equal(elements.cpKey.value, "");
  assert.equal(elements.cpSaveBtn.textContent, "Save changes");
  assert.equal(elements.cpCancelBtn.hidden, false);
  vm.runInContext("cancelCustomProviderEditUi()", context);
  assert.equal(calls.length, 0);
  assert.equal(elements.cpId.readOnly, false);
  assert.equal(elements.customProviderDisclosure.open, false);

  vm.runInContext("editCustomProviderUi('custom')", context);
  elements.cpModel.value = "new-model";
  elements.cpName.value = "Changed name";
  await vm.runInContext("saveCustomProviderUi()", context);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.body.id, "custom");
  assert.equal(calls[0].options.body.defaultModel, "new-model");
  assert.equal(calls[0].options.body.name, "Changed name");
  assert.equal(calls[0].options.body.apiKey, "");
  assert.equal(elements.cpKey.value, "");
  assert.equal(elements.cpId.readOnly, false);
  assert.equal(elements.cpSaveBtn.disabled, false);

  vm.runInContext("editCustomProviderUi('custom')", context);
  elements.cpName.value = "Unsaved name";
  context.api = async () => { throw new Error("Save failed"); };
  await vm.runInContext("saveCustomProviderUi()", context);
  assert.equal(elements.cpName.value, "Unsaved name");
  assert.equal(elements.cpSaveBtn.textContent, "Save changes");
  assert.equal(elements.cpSaveBtn.disabled, false);
});

test("Messaging channel message chunking preserves code fences and respects platform limits", () => {
  const longCode = "```ts\n" + "const line = 'yedogu-security-test';\n".repeat(80) + "```";
  const chunks = splitMessageChunks(longCode, 600);
  assert.ok(chunks.length >= 4);
  for (const ch of chunks) {
    assert.ok(ch.length <= 600, `Chunk exceeded limit: ${ch.length}`);
    // Every chunk should have balanced triple backticks
    const fenceCount = (ch.match(/```/g) || []).length;
    assert.equal(fenceCount % 2, 0, `Unbalanced code fence in chunk:\n${ch}`);
  }
});

test("Telegram Bot Adapter connects, enforces pairing access control, runs remote commands, and forwards prompts to AI", async () => {
  const sentMessages: Array<{ chat_id: number; text: string }> = [];
  const queuedUpdates: Array<Record<string, unknown>> = [];
  let updateId = 100;

  // Local mock Telegram Bot API server
  const mockTg = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c.toString("utf8")));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const pathname = req.url || "";
      res.writeHead(200, { "Content-Type": "application/json" });

      if (pathname.endsWith("/getMe")) {
        res.end(JSON.stringify({ ok: true, result: { id: 9999, is_bot: true, username: "yedogu_test_bot" } }));
        return;
      }
      if (pathname.endsWith("/deleteWebhook") || pathname.endsWith("/sendChatAction")) {
        res.end(JSON.stringify({ ok: true, result: true }));
        return;
      }
      if (pathname.endsWith("/getUpdates")) {
        const offset = Number(body.offset || 0);
        const ready = queuedUpdates.filter((u) => Number(u.update_id) >= offset);
        if (ready.length > 0) {
          res.end(JSON.stringify({ ok: true, result: ready }));
        } else {
          // Return quickly in test mode
          setTimeout(() => {
            res.end(JSON.stringify({ ok: true, result: [] }));
          }, 40);
        }
        return;
      }
      if (pathname.endsWith("/sendMessage")) {
        sentMessages.push({ chat_id: body.chat_id, text: body.text });
        res.end(JSON.stringify({ ok: true, result: { message_id: sentMessages.length } }));
        return;
      }
      res.end(JSON.stringify({ ok: false, description: "Unknown mock method" }));
    });
  });

  await new Promise<void>((resolve) => mockTg.listen(0, "127.0.0.1", () => resolve()));
  const tgPort = (mockTg.address() as AddressInfo).port;

  const engine = new YedoguEngine(process.cwd());
  engine.channels.setTestOverrides({
    telegramApiBaseUrl: `http://127.0.0.1:${tgPort}`,
    telegramPollTimeoutSec: 1,
  });

  // Stub engine.sendPrompt so we verify AI prompt forwarding without live LLM network calls
  let forwardedPrompt = "";
  let forwardedPlatform = "";
  const origSendPrompt = engine.sendPrompt.bind(engine);
  engine.sendPrompt = async (rawInput, _overrideAgentId, source) => {
    forwardedPrompt = rawInput;
    forwardedPlatform = source?.platform || "";
    return {
      id: "msg_mock_ai",
      role: "assistant",
      agentId: "commander",
      model: "mock/model",
      content: `AI Reply to: ${rawInput}`,
      timestamp: new Date().toISOString(),
    };
  };

  let createdId = "";
  const waitForReplyCount = async (target: number) => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      if (sentMessages.length >= target) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`Timed out waiting for ${target} Telegram replies (got ${sentMessages.length})`);
  };

  try {
    const ch = engine.channels.upsertChannel({
      name: "Test TG Bot",
      platform: "telegram",
      token: "123456789:AAHmockTestTelegramTokenValue123456789",
      autoStart: false,
    });
    createdId = ch.id;
    assert.ok(ch.pairingCode && ch.pairingCode.startsWith("YDG-"));

    const started = await engine.channels.startChannel(ch.id);
    assert.equal(started.status.state, "connected");
    assert.equal(started.status.botUsername, "@yedogu_test_bot");

    // 1. Unauthorized message is blocked before pairing
    queuedUpdates.push({
      update_id: ++updateId,
      message: {
        message_id: 1,
        from: { id: 4242, username: "alice" },
        chat: { id: 4242, type: "private" },
        text: "hello ai",
      },
    });
    await waitForReplyCount(1);
    assert.ok(sentMessages[0].text.includes("Unauthorized"));

    // 2. Pair using one-time code
    queuedUpdates.push({
      update_id: ++updateId,
      message: {
        message_id: 2,
        from: { id: 4242, username: "alice" },
        chat: { id: 4242, type: "private" },
        text: `/pair ${ch.pairingCode}`,
      },
    });
    await waitForReplyCount(2);
    assert.ok(sentMessages[1].text.includes("Paired with YEDOGU"));

    // 3. Remote /status command works immediately
    queuedUpdates.push({
      update_id: ++updateId,
      message: {
        message_id: 3,
        from: { id: 4242, username: "alice" },
        chat: { id: 4242, type: "private" },
        text: "/status",
      },
    });
    await waitForReplyCount(3);
    assert.ok(sentMessages[2].text.includes("Session:"));

    // 4. Normal text message is forwarded straight to the AI and replied back!
    queuedUpdates.push({
      update_id: ++updateId,
      message: {
        message_id: 4,
        from: { id: 4242, username: "alice" },
        chat: { id: 4242, type: "private" },
        text: "audit https://target.local/api",
      },
    });
    await waitForReplyCount(4);
    assert.equal(forwardedPrompt, "audit https://target.local/api");
    assert.equal(forwardedPlatform, "telegram");
    assert.equal(sentMessages[3].text, "AI Reply to: audit https://target.local/api");
  } finally {
    engine.sendPrompt = origSendPrompt;
    if (createdId) await engine.channels.deleteChannel(createdId);
    await new Promise<void>((resolve) => mockTg.close(() => resolve()));
  }
});

test("Generic Webhook Bridge works end-to-end through Daemon API with Bearer auth and pairing", async () => {
  const engine = new YedoguEngine(process.cwd());
  const daemon = new YedoguDaemon(engine);
  const url = await daemon.start(0, "127.0.0.1");

  const origSendPrompt = engine.sendPrompt.bind(engine);
  engine.sendPrompt = async (rawInput) => ({
    id: "msg_mock_wh",
    role: "assistant",
    agentId: engine.session.activeAgent,
    model: "mock/model",
    content: `Webhook AI: ${rawInput}`,
    timestamp: new Date().toISOString(),
  });

  let createdId = "";
  try {
    const createRes = await fetch(`${url}/api/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "webhook", name: "Test Bridge", autoStart: false }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as any;
    createdId = created.channel.id;
    assert.ok(created.webhookSecret);
    assert.ok(created.channel.pairingCode);

    // Wrong secret is rejected with 401
    const badRes = await fetch(`${url}/api/channels/webhook/${createdId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-secret" },
      body: JSON.stringify({ text: "hi", senderId: "user-1" }),
    });
    assert.equal(badRes.status, 401);

    // Pair sender over webhook
    const pairRes = await fetch(`${url}/api/channels/webhook/${createdId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${created.webhookSecret}` },
      body: JSON.stringify({ text: `/pair ${created.channel.pairingCode}`, senderId: "user-1", senderName: "Bob" }),
    });
    assert.equal(pairRes.status, 200);
    const pairData = (await pairRes.json()) as any;
    assert.ok(pairData.reply.includes("Paired with YEDOGU"));

    // Text the AI directly over webhook
    const msgRes = await fetch(`${url}/api/channels/webhook/${createdId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${created.webhookSecret}` },
      body: JSON.stringify({ text: "check CORS headers", senderId: "user-1", senderName: "Bob" }),
    });
    assert.equal(msgRes.status, 200);
    const msgData = (await msgRes.json()) as any;
    assert.equal(msgData.reply, "Webhook AI: check CORS headers");

    // Listing channels masks the secret token
    const listRes = await fetch(`${url}/api/channels`);
    const listData = (await listRes.json()) as any;
    const found = listData.channels.find((c: any) => c.id === createdId);
    assert.ok(found);
    assert.ok(!found.tokenPreview.includes(created.webhookSecret));
    assert.equal(found.status.messagesIn, 2);
    assert.equal(found.status.messagesOut, 2);
  } finally {
    engine.sendPrompt = origSendPrompt;
    if (createdId) {
      await fetch(`${url}/api/channels/${createdId}`, { method: "DELETE" });
    }
    await daemon.stop();
  }
});

test("Provider error handler formats deprecated models, auth, rate limits, context overflow, and local connection errors cleanly", () => {
  const providers = getBuiltinProviders();
  const codex = providers.find((p) => p.id === "codex")!;
  const ollama = providers.find((p) => p.id === "ollama")!;

  // 1. Deprecated / missing model 404 JSON (no raw JSON leaked, suggests /model fix)
  const raw404 = JSON.stringify({
    error: {
      message: "The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",
      type: "invalid_request_error",
      param: null,
      code: "model_not_found",
    },
  });
  const e404 = buildProviderHttpError(codex, "gpt-5-codex", 404, "Not Found", raw404);
  assert.equal(e404.kind, "model_not_found");
  assert.ok(!e404.message.includes('"invalid_request_error"'), "Must not dump raw JSON");
  assert.ok(e404.message.includes("Model unavailable: codex/gpt-5-codex"));
  assert.ok(e404.message.includes("/model codex/gpt-5"));

  // 2. Auth failure 401
  const e401 = buildProviderHttpError(
    codex,
    "gpt-5",
    401,
    "Unauthorized",
    JSON.stringify({ error: { message: "Incorrect API key provided: sk-proj-secret12345678901234567890", code: "invalid_api_key" } }),
  );
  assert.equal(e401.kind, "auth_failed");
  assert.ok(!e401.message.includes("sk-proj-secret12345678901234567890"), "API keys in error bodies must be redacted");
  assert.ok(e401.message.includes("/connect codex"));

  // 3. Rate limit 429 with Retry-After vs Quota exhausted
  const e429Rate = buildProviderHttpError(codex, "gpt-5", 429, "Too Many Requests", '{"error":{"message":"Rate limit reached","code":"rate_limit_exceeded"}}', "15");
  assert.equal(e429Rate.kind, "rate_limit");
  assert.equal(e429Rate.retryAfterSec, 15);
  assert.ok(e429Rate.message.includes("15s"));

  const e429Quota = buildProviderHttpError(codex, "gpt-5", 429, "Too Many Requests", '{"error":{"message":"You exceeded your current quota","code":"insufficient_quota"}}');
  assert.equal(e429Quota.kind, "quota_exceeded");
  assert.ok(e429Quota.message.includes("Quota exceeded"));

  // 4. Context overflow 400
  const eCtx = buildProviderHttpError(codex, "gpt-4o", 400, "Bad Request", '{"error":{"message":"maximum context length exceeded","code":"context_length_exceeded"}}');
  assert.equal(eCtx.kind, "context_length");
  assert.ok(eCtx.message.includes("/compact"));

  // 5. Local Ollama connection refused
  const netErr = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:11434" } });
  const eLocal = buildProviderNetworkError(ollama, "qwen2.5-coder:32b", netErr);
  assert.equal(eLocal.kind, "network_error");
  assert.ok(eLocal.message.includes("not reachable"));
  assert.ok(eLocal.message.includes("Start Ollama"));

  // 6. Generic raw JSON error fallback formatter
  const cleaned = formatFriendlyError(new Error('HTTP 404: {"error":{"message":"Model gone"}}'));
  assert.ok(!cleaned.includes('{"error"'));
  assert.ok(cleaned.includes("Model gone"));
});

test("Terminal mdxcn components (GraphFrame, GraphSpec, GraphCheck, GraphScore, GraphTree, GraphRank) render aligned and uncluttered", () => {
  // 1. GraphFrame box mode aligns every row cleanly to exact width
  const framed = renderGraphFrame(["Hello Terminal", "Line Two"], {
    title: "TEST FRAME",
    rightMeta: "v1.0",
    footer: "^K palette",
    frame: "box",
    width: 60,
    indent: "  ",
  });
  const rows = framed.split("\n");
  assert.ok(stripAnsi(rows[0]).trim().startsWith("+"));
  assert.ok(stripAnsi(rows[0]).trim().endsWith("+"));
  assert.ok(stripAnsi(rows[0]).includes("[ TEST FRAME ]"));
  for (const r of rows) {
    assert.equal(visibleLength(r), 62, `GraphFrame width mismatch: ${stripAnsi(r)}`);
  }

  // 2. GraphSpec dotted leaders
  const specs = renderSpecRows([{ label: "Agent", value: "@commander" }], 40);
  assert.ok(stripAnsi(specs[0]).includes("···"));
  assert.equal(visibleLength(specs[0]), 40);

  // 3. GraphCheck, GraphScore, GraphStack, GraphTree, GraphRank, GraphUptime
  const check = stripAnsi(renderCheckGrid([{ label: "ASLR", state: "pass" }, { label: "CFG", state: "fail" }], 60).join("\n"));
  assert.ok(check.includes("✓ ASLR"));
  assert.ok(check.includes("× CFG"));

  const score = stripAnsi(renderScoreDots(8.1, 10, "high"));
  assert.ok(score.includes("●●●●●●●●○○ 8.1"));

  const stack = stripAnsi(renderSeverityStack({ critical: 1, high: 2, medium: 0, low: 0, info: 0 }, 20));
  assert.ok(stack.includes("1C") && stack.includes("2H"));

  const tree = stripAnsi(renderTree("scope://roe", [{ label: "allow/", children: ["*.example.com"] }]).join("\n"));
  assert.ok(tree.includes("└─ allow/") && tree.includes("*.example.com"));

  const rank = stripAnsi(renderRankList([{ label: "innerHTML", count: 7 }], 60).join("\n"));
  assert.ok(rank.includes("#1") && rank.includes("x7"));

  const up = stripAnsi(renderUptimeStrip(["ok", "empty", "down"]));
  assert.ok(up.includes("1/3 live"));

  // 4. High-level terminal views compose cleanly
  const engine = new YedoguEngine(process.cwd());
  const banner = stripAnsi(renderBanner(engine.session, engine.getAgent(), engine.getProviders(), "http://127.0.0.1:9999"));
  assert.ok(banner.includes("[ YEDOGU v1.0.0 ]"));

  const statusOut = stripAnsi(renderStatusTerminal(engine.session, "codex/gpt-5", "http://127.0.0.1:9999"));
  assert.ok(statusOut.includes("[ SESSION STATUS ]"));

  const scopeOut = stripAnsi(renderScopeTerminal({ mode: "enforced", allow: ["*.target.com"], deny: ["admin.target.com"], engagementName: "demo" }));
  assert.ok(scopeOut.includes("scope://roe") && scopeOut.includes("*.target.com"));

  const httpOut = stripAnsi(
    renderHttpCaptureTerminal({
      id: "http_1",
      method: "POST",
      url: "https://api.target.com/v1",
      requestHeaders: {},
      status: 200,
      statusText: "OK",
      responseHeaders: {},
      responseBody: '{"ok":true}',
      durationMs: 42,
      bodySha256: "abcdef1234567890abcdef1234567890",
      scopeAllowed: true,
      securityHeaders: { present: ["hsts"], missing: ["csp"] },
      agentId: "web-hunter",
      timestamp: new Date().toISOString(),
    }),
  );
  assert.ok(httpOut.includes("POST") && httpOut.includes("✓ hsts") && httpOut.includes("× csp"));

  const findingsOut = stripAnsi(
    renderFindingsTerminal([
      {
        id: "FND-1",
        title: "Cross-Tenant IDOR",
        severity: "high",
        cvssScore: 8.1,
        target: "https://api.target.com/v1",
        category: "IDOR",
        summary: "Missing tenant check.",
        impact: "Cross-tenant read.",
        reproduction: "Swap ID.",
        remediation: "Enforce tenant scoping.",
        evidenceIds: [],
        triageGate: { inScope: true, reproducible: true, realSecurityImpact: true, notAlwaysRejected: true, twoAccountOrOobProven: true, evidenceRedacted: true, cvssJustified: true },
        status: "validated",
        agentId: "web-hunter",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]),
  );
  assert.ok(findingsOut.includes("●●●●●●●●○○ 8.1"));

  const binOut = stripAnsi(renderBinaryTriageTerminal(engine.runDirectBinaryTriage(process.execPath)));
  assert.ok(binOut.includes("Exploit Mitigations") && binOut.includes("Sections (Entropy 0–8)"));
});

test("Gemini function declarations use parametersJsonSchema so standard JSON Schema keywords like additionalProperties are accepted", () => {
  const decls = buildGeminiFunctionDeclarations(BUILTIN_TOOL_SCHEMAS);
  assert.equal(decls.length, BUILTIN_TOOL_SCHEMAS.length);
  for (const decl of decls) {
    assert.equal("parameters" in decl, false, `Tool ${String(decl.name)} should not use legacy parameters field`);
    assert.ok(decl.parametersJsonSchema && typeof decl.parametersJsonSchema === "object");
  }
  const httpForge = decls.find((d) => d.name === "http_forge") as any;
  assert.deepEqual(httpForge.parametersJsonSchema.properties.headers.additionalProperties, { type: "string" });
});

test("isProviderConnected filters out disconnected & unconfigured local providers, and fetchProviderModels discovers live Gemini/OpenAI/Anthropic models", async () => {
  const builtins = getBuiltinProviders();
  const ollama = { ...builtins.find((p) => p.id === "ollama")!, apiKey: "local-no-key-required", authSource: "local" as const };
  assert.equal(isProviderConnected(ollama), false);
  assert.equal(isProviderConnected({ ...ollama, authSource: "config" }), true);

  const geminiDisconnected = builtins.find((p) => p.id === "gemini")!;
  assert.equal(isProviderConnected(geminiDisconnected), false);

  // Mock Gemini + OpenAI + Anthropic /models endpoints
  let seenGeminiAuth = "";
  const srv = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url?.startsWith("/gemini/models")) {
      seenGeminiAuth = String(req.headers["authorization"] || req.headers["x-goog-api-key"] || "");
      res.end(
        JSON.stringify({
          models: [
            { name: "models/nano-banana-pro-preview", displayName: "Nano Banana", inputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
            { name: "models/lyria-3.5", displayName: "Lyria 3.5", inputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemma-4-31b-it", displayName: "Gemma 4 31B", inputTokenLimit: 131072, supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
            { name: "models/text-embedding-004", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
          ],
        }),
      );
      return;
    }
    if (req.url?.startsWith("/openai/models")) {
      res.end(
        JSON.stringify({
          data: [
            { id: "gpt-5" },
            { id: "gpt-5-mini" },
            { id: "whisper-1" },
            { id: "dall-e-3" },
          ],
        }),
      );
      return;
    }
    if (req.url?.startsWith("/anthropic/models")) {
      res.end(
        JSON.stringify({
          data: [
            { id: "claude-opus-4-1", display_name: "Claude Opus 4.1" },
            { id: "claude-sonnet-4-20250514", display_name: "Claude Sonnet 4" },
          ],
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });

  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const { port } = srv.address() as AddressInfo;
  try {
    const gemLive = await fetchProviderModels({
      ...geminiDisconnected,
      baseUrl: `http://127.0.0.1:${port}/gemini`,
      apiKey: "ya29.fake-oauth-token",
      authSource: "gcloud",
    });
    assert.equal(gemLive.live, true);
    assert.equal(seenGeminiAuth, "Bearer ya29.fake-oauth-token");
    assert.equal(gemLive.models[0].id, "gemini-2.5-pro");
    assert.ok(gemLive.models.some((m) => m.id === "gemini-2.5-flash"));
    assert.equal(gemLive.models.some((m) => m.id.includes("embedding")), false);
    assert.equal(gemLive.models.some((m) => m.id.includes("lyria")), false);
    assert.equal(gemLive.models.some((m) => m.id.includes("nano-banana")), false);

    const agyParsed = parseAgyModelsOutput(
      "Fetching available models...\n" +
        "gemini-4-neon-high\tGemini 4 Neon (High)\n" +
        "gemini-4-neon-xhigh\tGemini 4 Neon (XHigh)\n" +
        "gemini-4-neon-medium\tGemini 4 Neon (Medium)\n" +
        "gemini-4-neon-low\tGemini 4 Neon (Low)\n" +
        "gemini-pro-orchestrator-neon\tOrchestrator (Neon)\n" +
        "gemini-pro-orchestrator-g1-pro\tOrchestrator (Argon)\n" +
        "gpt-oss-120b-medium\tGPT-OSS 120B (Medium)\n",
    );
    assert.equal(agyParsed.length, 7);
    const grouped = groupModelsForPicker([
      { ...geminiDisconnected, apiKey: "agy-cli", authSource: "agy-cli", models: agyParsed },
    ]);
    assert.equal(grouped.length, 3);
    assert.equal(grouped[0].displayName, "Gemini 4 Neon");
    assert.equal(grouped[0].isEffortGroup, true);
    assert.deepEqual(
      grouped[0].variants.map((v) => v.label),
      ["low", "medium", "high", "xhigh"],
    );
    assert.equal(grouped[1].displayName, "Orchestrator");
    assert.deepEqual(
      grouped[1].variants.map((v) => v.label),
      ["neon", "argon"],
    );
    assert.equal(grouped[2].displayName, "GPT-OSS 120B (Medium)");
    assert.equal(grouped[2].variants.length, 1);

    const codexLive = await fetchProviderModels({
      ...builtins.find((p) => p.id === "codex")!,
      baseUrl: `http://127.0.0.1:${port}/openai`,
      apiKey: "sk-test-token",
      authSource: "codex-cli",
    });
    assert.equal(codexLive.live, true);
    assert.deepEqual(codexLive.models.map((m) => m.id).sort(), ["gpt-5", "gpt-5-mini"]);

    const claudeLive = await fetchProviderModels({
      ...builtins.find((p) => p.id === "anthropic")!,
      baseUrl: `http://127.0.0.1:${port}/anthropic`,
      apiKey: "sk-ant-oat-test",
      authSource: "claude-cli",
    });
    assert.equal(claudeLive.live, true);
    assert.ok(claudeLive.models.some((m) => m.id === "claude-opus-4-1"));
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
});

test("Projects, folder browsing, nested multi-chats, pin/rename/clear, auto-titling, and Settings modal work end-to-end", async () => {
  assert.equal(deriveChatTitle("  Audit `src/auth.ts` for IDOR vulnerabilities\nand report findings  "), "Audit src/auth.ts for IDOR vulnerabilities and…");
  assert.equal(deriveChatTitle("   "), "New chat");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yedogu-proj-"));
  const subDir = path.join(tempDir, "subapp");
  fs.mkdirSync(subDir, { recursive: true });

  const engine = new YedoguEngine(process.cwd());
  const prevConfig = structuredClone(engine.config);
  const daemon = new YedoguDaemon(engine);
  const url = await daemon.start(0, "127.0.0.1");

  let createdProjectId: string | null = null;
  try {
    const html = await (await fetch(`${url}/`)).text();
    assert.ok(html.includes('id="settingsDlg"'));
    assert.ok(html.includes('id="projectModalDlg"'));
    assert.ok(html.includes('id="ctxMenu"'));

    // Browse filesystem
    const browseRes = await fetch(`${url}/api/fs/browse?path=${encodeURIComponent(tempDir)}`);
    assert.equal(browseRes.status, 200);
    const browseData = (await browseRes.json()) as any;
    assert.equal(browseData.current, tempDir);
    assert.ok(browseData.entries.some((e: any) => e.name === "subapp"));

    // Create folder-backed project
    const projRes = await fetch(`${url}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "TargetApp", folder: subDir }),
    });
    assert.equal(projRes.status, 201);
    const projData = (await projRes.json()) as any;
    createdProjectId = projData.project.id;
    assert.equal(projData.project.name, "TargetApp");
    assert.equal(projData.project.folder, subDir);
    assert.equal(projData.session.workspace, subDir);
    assert.equal(projData.session.projectId, createdProjectId);
    assert.equal(projData.session.name, "New chat");

    // Create a second chat in the same project
    const chat2Res = await fetch(`${url}/api/session/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: createdProjectId }),
    });
    assert.equal(chat2Res.status, 200);
    const chat2Data = (await chat2Res.json()) as any;
    assert.equal(chat2Data.session.projectId, createdProjectId);
    assert.equal(chat2Data.session.workspace, subDir);

    // Rename & pin chat
    const patchRes = await fetch(`${url}/api/session/${encodeURIComponent(chat2Data.session.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Auth Audit", pinned: true }),
    });
    assert.equal(patchRes.status, 200);
    const patched = (await patchRes.json()) as any;
    assert.equal(patched.session.name, "Auth Audit");
    assert.equal(patched.session.pinned, true);

    // Clear all chats in project
    const clearRes = await fetch(`${url}/api/projects/${encodeURIComponent(createdProjectId!)}/clear-chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(clearRes.status, 200);
    const clearData = (await clearRes.json()) as any;
    assert.ok(clearData.deletedCount >= 2);
    assert.equal(clearData.session.projectId, createdProjectId);
    assert.equal(clearData.session.name, "New chat");

    // Delete project cleanly
    const delProjRes = await fetch(`${url}/api/projects/${encodeURIComponent(createdProjectId!)}`, {
      method: "DELETE",
    });
    assert.equal(delProjRes.status, 200);
    createdProjectId = null;
  } finally {
    if (createdProjectId && engine.config.projects.some((p) => p.id === createdProjectId)) {
      engine.deleteProject(createdProjectId);
    }
    engine.config = prevConfig;
    saveGlobalConfig(prevConfig);
    await daemon.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Model display names, available-only filtering, reasoning effort API, probe, delete, and Web UI picker render cleanly", async () => {
  assert.equal(formatModelDisplayName("gpt-5-mini"), "GPT-5 Mini");
  assert.equal(formatModelDisplayName("claude-sonnet-4-6"), "Claude Sonnet 4.6");
  assert.equal(formatModelDisplayName("claude-3-7-sonnet-20250219"), "Claude 3.7 Sonnet");
  assert.equal(formatModelDisplayName("gemini-2.5-pro"), "Gemini 2.5 Pro");
  assert.equal(formatModelDisplayName("anthropic/claude-opus-4-6"), "Claude Opus 4.6");
  assert.equal(formatModelDisplayName("gemini-4-neon-high", "Gemini 4 Neon (High)"), "Gemini 4 Neon (High)");

  const srv = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url?.startsWith("/openai/models")) {
      res.end(
        JSON.stringify({
          data: [
            { id: "gpt-5" },
            { id: "gpt-4o" },
            { id: "gpt-4o-2024-08-06" },
            { id: "gpt-5-codex" },
            { id: "o3-pro" },
            { id: "gpt-4o-search-preview" },
            { id: "whisper-1" },
          ],
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const { port } = srv.address() as AddressInfo;

  const engine = new YedoguEngine(process.cwd());
  const prevConfig = structuredClone(engine.config);
  const daemon = new YedoguDaemon(engine);
  const url = await daemon.start(0, "127.0.0.1");

  try {
    const openai = getBuiltinProviders().find((p) => p.id === "openai")!;
    const filtered = await fetchProviderModels({
      ...openai,
      baseUrl: `http://127.0.0.1:${port}/openai`,
      apiKey: "sk-test",
      authSource: "config",
    });
    assert.equal(filtered.live, true);
    const ids = filtered.models.map((m) => m.id);
    assert.ok(ids.includes("gpt-5"));
    assert.ok(ids.includes("gpt-4o"));
    assert.equal(ids.includes("gpt-4o-2024-08-06"), false);
    assert.equal(ids.includes("gpt-5-codex"), false);
    assert.equal(ids.includes("o3-pro"), false);
    assert.equal(ids.includes("gpt-4o-search-preview"), false);

    // Probe custom endpoint
    const probeRes = await fetch(`${url}/api/providers/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocol: "openai", baseUrl: `http://127.0.0.1:${port}/openai`, apiKey: "sk-test" }),
    });
    assert.equal(probeRes.status, 200);
    const probeData = (await probeRes.json()) as any;
    assert.equal(probeData.ok, true);
    assert.ok(probeData.models.some((m: any) => m.id === "gpt-5"));

    // Reasoning effort update
    const effortRes = await fetch(`${url}/api/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasoningEffort: "high" }),
    });
    assert.equal(effortRes.status, 200);
    const effortData = (await effortRes.json()) as any;
    assert.equal(effortData.reasoningEffort, "high");

    // Create and delete custom provider
    const cid = `probe-del-${Date.now()}`;
    const createRes = await fetch(`${url}/api/providers/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: cid,
        name: "Temp Endpoint",
        protocol: "openai",
        baseUrl: `http://127.0.0.1:${port}/openai`,
        defaultModel: "gpt-5",
      }),
    });
    assert.equal(createRes.status, 200);

    const delRes = await fetch(`${url}/api/providers/custom/${encodeURIComponent(cid)}`, { method: "DELETE" });
    assert.equal(delRes.status, 200);
    assert.equal((await delRes.json() as any).deleted, true);

    // Web UI picker & reasoning slider & script syntax
    const html = await (await fetch(`${url}/`)).text();
    assert.ok(html.includes('id="modelPickerTrigger"'));
    assert.ok(html.includes('id="modelPickerPopover"'));
    assert.ok(html.includes('id="composerReasoningWrap"'));
    assert.ok(html.includes('id="composerReasoningPills"'));
    assert.ok(html.includes('id="composerReasoningSlider"'));
    assert.ok(html.includes('id="providerConnectDlg"'));
    assert.ok(html.includes('id="providerConnectedGrid"'));
    assert.ok(html.includes('id="prvDirSearch"'));
    assert.ok(html.includes('id="logo-gemini-grad"'));
    assert.ok(html.includes('id="projNativePickBtn"'));
    assert.ok(html.includes('id="attachFileBtn"'));
    assert.ok(html.includes('id="chatFileInput"'));
    assert.ok(html.includes('id="composerAttachments"'));
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    new vm.Script(script);

    // Execute cleanModelName, extractUiVariant, groupConnectedModels, formatModelBadge inside VM
    // to catch any template-literal regex escaping bugs (e.g. ReferenceError: i is not defined)
    const modelSlice = script.slice(
      script.indexOf("function cleanModelName("),
      script.indexOf("function getActiveReasoningConfig("),
    );
    const modelCtx = vm.createContext({
      STATE: {
        providers: [
          {
            id: "anthropic",
            name: "Anthropic",
            connected: true,
            models: [{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }],
          },
          {
            id: "openai",
            name: "OpenAI",
            connected: true,
            models: [{ id: "gpt-5-mini", name: "gpt-5-mini" }],
          },
          {
            id: "gemini",
            name: "Google Gemini",
            connected: true,
            models: [
              { id: "gemini-4-neon-high", name: "Gemini 4 Neon (High)" },
              { id: "gemini-4-neon-low", name: "Gemini 4 Neon (Low)" },
            ],
          },
        ],
      },
      EFFORT_ORDER_UI: ["none", "low", "medium", "high", "xhigh"],
    });
    vm.runInContext(modelSlice, modelCtx);
    assert.equal(vm.runInContext("cleanModelName('anthropic/claude-opus-4-6')", modelCtx), "Claude Opus 4.6");
    assert.equal(vm.runInContext("cleanModelName('gpt-5-mini')", modelCtx), "GPT-5 Mini");
    assert.equal(vm.runInContext("formatModelBadge('anthropic/claude-sonnet-4-6')", modelCtx), "Claude Sonnet 4.6");
    assert.equal(vm.runInContext("groupConnectedModels().length", modelCtx), 3);

    const reasonSlice = script.slice(
      script.indexOf("function cleanModelName("),
      script.indexOf("async function selectModelSpec("),
    );
    const reasonCtx = vm.createContext({
      STATE: {
        reasoningEffort: "high",
        session: { activeModel: "custom/my-model", reasoningEffort: "high" },
        providers: [
          {
            id: "custom",
            name: "Custom",
            connected: true,
            models: [{ id: "my-model", name: "My Custom Model" }],
          },
        ],
      },
      EFFORT_ORDER_UI: ["none", "low", "medium", "high", "xhigh"],
      EFFORT_LABELS: { none: "Off", low: "Low", medium: "Med", high: "High", xhigh: "Extra" },
      EFFORT_FULL_LABELS: { none: "Off", low: "Low", medium: "Medium", high: "High", xhigh: "Extra" },
    });
    vm.runInContext(reasonSlice, reasonCtx);
    assert.equal(vm.runInContext("getActiveReasoningConfig()?.currentKey", reasonCtx), "high");
    assert.equal(vm.runInContext("getActiveReasoningConfig()?.levels?.length", reasonCtx), 4);

    // File attachment upload via /api/chat (even with empty message)
    const attRes = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "",
        attachments: [
          {
            name: "notes.txt",
            mimeType: "text/plain",
            size: 11,
            content: "hello world",
            encoding: "utf8",
          },
        ],
      }),
    });
    assert.equal(attRes.status, 202);
    await new Promise((r) => setTimeout(r, 80));
    const lastUserMsg = [...engine.session.messages].reverse().find((m) => m.role === "user");
    assert.ok(lastUserMsg);
    assert.equal(lastUserMsg.attachments?.[0]?.name, "notes.txt");
    assert.ok(lastUserMsg.attachments?.[0]?.savedPath && fs.existsSync(lastUserMsg.attachments[0].savedPath));
  } finally {
    engine.config = prevConfig;
    saveGlobalConfig(prevConfig);
    await daemon.stop();
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
});
