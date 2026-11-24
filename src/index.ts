import path from "node:path";
import { YedoguEngine } from "./agents/orchestrator.js";
import { YedoguDaemon } from "./server/daemon.js";
import { openInBrowser } from "./server/openBrowser.js";
import { YedoguTui } from "./tui/app.js";
import {
  ANSI,
  PALETTE,
  c,
  renderAgentsTable,
  renderBinaryTriageTerminal,
  renderChannelsTable,
  renderProvidersTable,
} from "./tui/renderer.js";
import { StreamMarkdownWriter } from "./tui/markdown.js";
import { padVisible, rule } from "./tui/theme.js";

function parseCliArgs(argv: string[]) {
  const args = argv.slice(2);
  let port = 0;
  let hostname = "127.0.0.1";
  let workspace = process.cwd();
  let agent: string | undefined;
  let model: string | undefined;
  let sessionId: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--port" || a === "-p") {
      port = Number(args[++i] || 0);
    } else if (a === "--host" || a === "--hostname") {
      hostname = args[++i] || "127.0.0.1";
    } else if (a === "--agent" || a === "-a") {
      agent = args[++i];
    } else if (a === "--model" || a === "-m") {
      model = args[++i];
    } else if (a === "--session" || a === "-s") {
      sessionId = args[++i];
    } else if (a === "--cwd" || a === "-C") {
      workspace = path.resolve(args[++i] || process.cwd());
    } else if (a === "-h" || a === "--help") {
      positional.push("help");
    } else if (a === "-v" || a === "--version") {
      positional.push("version");
    } else {
      positional.push(a);
    }
  }

  return { command: positional[0] || "tui", rest: positional.slice(1), port, hostname, workspace, agent, model, sessionId };
}

function printCliHelp(): void {
  const row = (cmd: string, desc: string) =>
    `  ${padVisible(c(PALETTE.text, cmd), 32)} ${c(PALETTE.secondary, desc)}`;

  console.log([
    "",
    `  ${c(PALETTE.accent + PALETTE.bold, "✦ YEDOGU")} ${c(PALETTE.muted, "v1.0.0")} ${c(PALETTE.secondary, "— Offensive Security & Reverse Engineering AI Harness")}`,
    `  ${rule(76)}`,
    `  ${c(PALETTE.accent, "Usage")}`,
    row("yedogu", "Launch terminal TUI (default)"),
    row("yedogu browser | web", "Start daemon and open Browser War-Room UI"),
    row("yedogu serve [--port 4747]", "Start headless daemon server"),
    row('yedogu run "<prompt>"', "Run a single headless agentic task"),
    row("yedogu re <binary-path>", "Static binary / APK / IPA / ASAR triage"),
    row("yedogu js [dir-or-file]", "Scan JS bundles for endpoints, sinks & secrets"),
    row("yedogu providers | agents", "List providers or specialist agents"),
    row("yedogu channels", "List configured Telegram / Discord / Slack / Webhook bots"),
    "",
    `  ${c(PALETTE.accent, "Options")}`,
    row("-a, --agent <id>", "Start with specialist agent (commander, recon, reverser...)"),
    row("-m, --model <provider/model>", "Override model (e.g. anthropic/claude-opus-4-6)"),
    row("-p, --port <number>", "Local daemon port (default: ephemeral)"),
    row("-s, --session <id>", "Resume an existing session"),
    row("-C, --cwd <path>", "Workspace directory"),
    row("-v, --version  |  -h, --help", "Show version or help"),
    `  ${rule(76)}`,
    `  ${c(PALETTE.muted, "Inside the terminal, type")} ${c(PALETTE.text, "/browser")} ${c(PALETTE.muted, "anytime to open the live-synced War-Room.")}`,
    "",
  ].join("\n"));
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv);

  if (cli.command === "version") {
    console.log("yedogu 1.0.0");
    return;
  }
  if (cli.command === "help") {
    printCliHelp();
    return;
  }

  const engine = new YedoguEngine(cli.workspace, cli.sessionId);
  if (cli.agent) engine.setActiveAgent(cli.agent);
  if (cli.model) engine.setModel(cli.model);

  if (cli.command === "providers") {
    console.log(renderProvidersTable(engine.getProviders()));
    return;
  }

  if (cli.command === "agents") {
    console.log(renderAgentsTable(engine.getAgents(), engine.session));
    return;
  }

  if (cli.command === "channels" || cli.command === "bots") {
    console.log(renderChannelsTable(engine.channels.getPublicViews(), "http://127.0.0.1:<port>"));
    return;
  }

  if (cli.command === "re") {
    const target = cli.rest.join(" ").trim();
    if (!target) {
      console.error("Usage: yedogu re <path-to-binary-or-apk>");
      process.exit(1);
    }
    const summary = engine.runDirectBinaryTriage(target);
    console.log(renderBinaryTriageTerminal(summary));
    return;
  }

  if (cli.command === "js") {
    const target = cli.rest.join(" ").trim() || cli.workspace;
    const res = engine.runDirectJsRecon(target);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (cli.command === "run") {
    const prompt = cli.rest.join(" ").trim();
    if (!prompt) {
      console.error('Usage: yedogu run "<prompt>"');
      process.exit(1);
    }
    const md = new StreamMarkdownWriter();
    engine.on("event", (evt) => {
      if (evt.type === "message.delta") md.push(evt.payload.delta);
    });
    await engine.sendPrompt(prompt);
    md.flush();
    return;
  }

  // Start embedded real-time daemon for TUI, browser, or serve mode
  const daemon = new YedoguDaemon(engine);
  const url = await daemon.start(cli.port, cli.hostname);
  await engine.channels.startAutoChannels();

  if (cli.command === "serve") {
    const cleanExit = async () => {
      await daemon.stop();
      process.exit(0);
    };
    process.on("SIGINT", () => void cleanExit());
    process.on("SIGTERM", () => void cleanExit());
    console.log(`\n  ${c(PALETTE.accent, "✦")} ${c(PALETTE.text + PALETTE.bold, "YEDOGU Daemon")} ${c(PALETTE.info, url)}\n`);
    const liveBots = engine.channels.getPublicViews().filter((ch) => ch.status.state === "connected");
    if (liveBots.length) {
      console.log(
        `    ${c(PALETTE.success, "●")} ${c(PALETTE.secondary, `Active bots: ${liveBots.map((b) => `${b.platform}(${b.status.botUsername || b.id})`).join(", ")}`)}\n`,
      );
    }
    return;
  }

  if (cli.command === "browser" || cli.command === "web") {
    const cleanExit = async () => {
      await daemon.stop();
      process.exit(0);
    };
    process.on("SIGINT", () => void cleanExit());
    process.on("SIGTERM", () => void cleanExit());
    const targetUrl = `${url}/?session=${encodeURIComponent(engine.session.id)}`;
    openInBrowser(targetUrl);
    console.log(
      `\n  ${c(PALETTE.accent, "✦")} ${c(PALETTE.text + PALETTE.bold, "YEDOGU Browser War-Room")} ${c(PALETTE.info, targetUrl)}\n` +
        `    ${c(PALETTE.muted, "Press Ctrl+C to stop the server.")}\n`,
    );
    return;
  }

  // Default: Terminal-First Interactive Tactical TUI
  const tui = new YedoguTui(engine, daemon);
  await tui.start();
}

main().catch((err) => {
  console.error(c(ANSI.rose + ANSI.bold, "YEDOGU FATAL:"), err instanceof Error ? err.message : String(err));
  process.exit(1);
});
