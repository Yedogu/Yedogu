import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { YedoguEngine } from "../agents/orchestrator.js";
import type { YedoguDaemon } from "../server/daemon.js";
import { openInBrowser } from "../server/openBrowser.js";
import { listSessions } from "../config/store.js";
import { formatFriendlyError } from "../providers/errors.js";
import {
  groupModelsForPicker,
  isProviderConnected,
  probeAgyModels,
  type GroupedModelEntry,
} from "../providers/registry.js";
import type { ChannelPublicView, ChatMessage, HarnessEvent, ProviderConfig } from "../types.js";
import {
  PALETTE,
  SYNC_END,
  SYNC_START,
  c,
  formatTokens,
  getActiveTheme,
  listThemes,
  padVisible,
  renderThemeSwatch,
  rule,
  setActiveTheme,
  shortenPath,
  termWidth,
  truncatePlain,
  visibleLength,
} from "./theme.js";
import { StreamMarkdownWriter } from "./markdown.js";
import { TerminalSpinner } from "./spinner.js";
import {
  SLASH_COMMANDS,
  SlashMenuController,
  filterSlashCommands,
  formatSlashCompletion,
} from "./slashMenu.js";
import {
  ConfirmModal,
  FormModal,
  InputModal,
  SelectModal,
  type ActiveModal,
  type ConfirmModalConfig,
  type ConfirmOutcome,
  type FormModalConfig,
  type FormOutcome,
  type InputModalConfig,
  type InputOutcome,
  type ModalOutcome,
  type SelectModalConfig,
  type SelectOption,
} from "./popup.js";
import {
  formatToolArgsCompact,
  renderAgentsTable,
  renderBanner,
  renderBinaryTriageTerminal,
  renderChannelConnectedCard,
  renderChannelsTable,
  renderComposerFooter,
  renderContextBar,
  renderFindingDetailCard,
  renderFindingsTerminal,
  renderHelpText,
  renderHttpCaptureTerminal,
  renderJsReconTerminal,
  renderPromptString,
  renderProvidersTable,
  renderScopeTerminal,
  renderStatusTerminal,
  renderToolDone,
  renderToolStart,
} from "./renderer.js";

function suggestCommand(input: string): string | null {
  const clean = input.toLowerCase();
  let best: string | null = null;
  let bestScore = Infinity;
  for (const cmd of SLASH_COMMANDS) {
    const a = clean;
    const b = cmd;
    const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
      new Array(b.length + 1).fill(0),
    );
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    const dist = dp[a.length][b.length];
    if (dist < bestScore && dist <= 3) {
      bestScore = dist;
      best = cmd;
    }
  }
  return best;
}

const PLACEHOLDER_TEXT = "Ask anything, / commands, @ agent, ^K palette…";

export class YedoguTui {
  private rl: readline.Interface | null = null;
  private isStreamingText = false;
  private isStreamingReasoning = false;
  private activeAgentLabel = "";
  private activeModelLabel = "";
  private toolStepCount = 0;
  private lastSigint = 0;
  private promptActive = false;
  private promptVisibleWidth = 4;
  private footerVisible = false;
  private placeholderVisible = false;
  private remoteTurnActive = false;
  private activeModal: ActiveModal | null = null;
  private readonly spinner = new TerminalSpinner();
  private readonly markdown = new StreamMarkdownWriter();
  private readonly slashMenu = new SlashMenuController();

  constructor(
    private readonly engine: YedoguEngine,
    private readonly daemon: YedoguDaemon,
  ) {
    setActiveTheme(this.engine.config.theme || "claude");
    this.slashMenu.setAgentsProvider(() =>
      this.engine.getAgents().map((a) => ({
        id: a.id,
        title: a.title,
        model: this.engine.getEffectiveModelForAgent(a.id),
        active: this.engine.session.activeAgent === a.id,
      })),
    );
    this.bindEngineEvents();
  }

  private bindEngineEvents(): void {
    this.engine.on("event", (evt: HarnessEvent) => {
      switch (evt.type) {
        case "message.start": {
          const p = evt.payload as { agentId: string; model: string };
          this.isStreamingText = false;
          this.isStreamingReasoning = false;
          this.toolStepCount = 0;
          this.activeAgentLabel = `@${p.agentId}`;
          this.activeModelLabel = p.model;
          this.markdown.reset();
          process.stdout.write("\n");
          this.spinner.start("Thinking…", `${this.activeAgentLabel} · ${truncatePlain(p.model, 28)}`);
          break;
        }
        case "reasoning.delta": {
          const p = evt.payload as { delta: string };
          this.spinner.stop(true);
          if (!this.isStreamingReasoning) {
            this.isStreamingReasoning = true;
            process.stdout.write(
              `  ${c(PALETTE.reasoning, "◇")} ${c(PALETTE.muted + PALETTE.italic, "Thinking")}\n  ${c(PALETTE.border, "│")} `,
            );
          }
          process.stdout.write(
            c(PALETTE.muted + PALETTE.italic, p.delta.replace(/\n/g, `\n  ${c(PALETTE.border, "│")} `)),
          );
          break;
        }
        case "message.delta": {
          const p = evt.payload as { delta: string };
          this.spinner.stop(true);
          if (this.isStreamingReasoning && !this.isStreamingText) {
            process.stdout.write("\n\n");
          }
          if (!this.isStreamingText) {
            this.isStreamingText = true;
            process.stdout.write(
              `  ${c(PALETTE.accent, "✦")} ${c(PALETTE.text + PALETTE.bold, this.activeAgentLabel)} ${c(PALETTE.muted, this.activeModelLabel)}\n\n`,
            );
          }
          this.markdown.push(p.delta);
          break;
        }
        case "message.done": {
          const p = evt.payload as ChatMessage;
          this.spinner.stop(true);
          if (p.role === "user" && p.source) {
            if (this.promptActive && !this.activeModal) {
              this.promptActive = false;
              this.clearDecorations();
              this.slashMenu.reset();
              process.stdout.write("\r\x1b[2K");
            }
            this.remoteTurnActive = true;
            process.stdout.write(
              `\n  ${c(PALETTE.info + PALETTE.bold, "◉")} ${c(PALETTE.accentSoft, `[${p.source.platform} · ${p.source.senderName}]`)} ${c(PALETTE.text, p.content)}\n`,
            );
          } else if (p.role === "assistant") {
            if (this.isStreamingText) {
              this.markdown.flush();
            } else if (this.isStreamingReasoning) {
              process.stdout.write("\n");
            }
            this.isStreamingText = false;
            this.isStreamingReasoning = false;
            if (this.remoteTurnActive && (!p.toolCalls || p.toolCalls.length === 0)) {
              this.remoteTurnActive = false;
              if (!this.activeModal && !this.promptActive) {
                this.prompt(true);
              }
            }
          }
          break;
        }
        case "tool.start": {
          const p = evt.payload as { toolCall: { name: string; arguments: Record<string, unknown> } };
          this.spinner.stop(true);
          if (this.isStreamingText) {
            this.markdown.flush();
            this.isStreamingText = false;
          }
          this.toolStepCount++;
          process.stdout.write(renderToolStart(p.toolCall.name, p.toolCall.arguments, this.toolStepCount));
          const compactArgs = formatToolArgsCompact(p.toolCall.arguments, 40);
          this.spinner.start(`Running ${p.toolCall.name}…`, compactArgs);
          break;
        }
        case "tool.done": {
          const p = evt.payload as {
            toolCall: { name: string; status: string; durationMs?: number; output?: string };
          };
          this.spinner.stop(true);
          const ok = p.toolCall.status !== "error";
          process.stdout.write(
            renderToolDone(p.toolCall.name, ok, p.toolCall.durationMs ?? 0, p.toolCall.output),
          );
          break;
        }
        case "finding.updated": {
          const f = evt.payload as { id: string; severity: string; title: string };
          this.spinner.stop(true);
          process.stdout.write(
            `\n  ${c(PALETTE.danger + PALETTE.bold, "⚑ Finding logged")} ${c(PALETTE.info, f.id)} ${c(PALETTE.warning, `[${f.severity.toUpperCase()}]`)} ${c(PALETTE.text, f.title)}\n`,
          );
          break;
        }
        case "system.notice": {
          const n = evt.payload as { level?: string; message: string };
          this.spinner.stop(true);
          const col =
            n.level === "error"
              ? PALETTE.danger
              : n.level === "warn"
                ? PALETTE.warning
                : PALETTE.info;
          const formattedLines = String(n.message || "")
            .split(/\r?\n/)
            .map((line, i) => (i === 0 ? `\n  ${c(col, "▸")} ${c(PALETTE.secondary, line)}` : `    ${c(PALETTE.muted, line)}`))
            .join("\n");
          process.stdout.write(`${formattedLines}\n`);
          if (this.remoteTurnActive && n.level === "error") {
            this.remoteTurnActive = false;
            if (!this.activeModal && !this.promptActive) {
              this.prompt(true);
            }
          }
          break;
        }
      }
    });
  }

  public async start(): Promise<void> {
    process.stdout.write(
      renderBanner(
        this.engine.session,
        this.engine.getAgent(),
        this.engine.getProviders(),
        this.daemon.url,
        this.engine.channels.getPublicViews(),
      ),
    );

    const completer = (line: string): [string[], string] => {
      if (line.startsWith("/") && !/\s/.test(line)) {
        const matches = filterSlashCommands(line);
        if (matches && matches.length > 0) {
          return [[formatSlashCompletion(matches[0])], line];
        }
        return [[], line];
      }
      if (line.startsWith("@") && !/\s/.test(line)) {
        const agents = this.engine.getAgents().map((a) => `@${a.id} `);
        const hits = agents.filter((a) => a.startsWith(line));
        return [hits.length ? [hits[0]] : [], line];
      }
      return [[], line];
    };

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer,
      historySize: 300,
    });

    this.attachInteractiveHook();

    this.rl.on("SIGINT", () => {
      if (this.activeModal) {
        this.activeModal.handleKey("", { ctrl: true, name: "c" });
        return;
      }
      this.clearDecorations();
      this.slashMenu.reset();
      if (this.engine.busy) {
        this.spinner.stop(true);
        this.markdown.flush();
        this.engine.abortActive();
        this.prompt();
        return;
      }
      const now = Date.now();
      if (now - this.lastSigint < 1500) {
        this.shutdown();
        return;
      }
      this.lastSigint = now;
      process.stdout.write(c(PALETTE.muted, "\n  Press Ctrl+C again or type /exit to quit.\n"));
      this.prompt(false);
    });

    this.rl.on("line", async (raw) => {
      if (this.activeModal) return;
      this.promptActive = false;
      this.clearDecorations();
      this.slashMenu.reset();

      const line = raw.trim();
      if (!line) {
        this.prompt(false);
        return;
      }

      await this.executeSubmittedLine(line);
    });

    this.prompt(true);
  }

  private async executeSubmittedLine(line: string): Promise<void> {
    try {
      if (line.startsWith("/")) {
        const shouldContinue = await this.handleSlashCommand(line);
        if (!shouldContinue) {
          this.shutdown();
          return;
        }
      } else {
        await this.engine.sendPrompt(line);
      }
    } catch (err) {
      this.spinner.stop(true);
      this.markdown.flush();
      const friendly = formatFriendlyError(err).split(/\r?\n/);
      process.stdout.write(
        `\n  ${c(PALETTE.danger + PALETTE.bold, "✗")} ${c(PALETTE.text, friendly[0])}\n` +
          friendly
            .slice(1)
            .map((l) => `    ${c(PALETTE.muted, l)}\n`)
            .join(""),
      );
    }

    this.prompt(true);
  }

  private getCursorCol(): number {
    return this.promptVisibleWidth + (this.rl?.cursor ?? 0) + 1;
  }

  /**
   * Renders subtle placeholder text & quiet shortcut footer below an idle empty prompt.
   */
  private drawIdleDecorations(): void {
    if (!process.stdout.isTTY || !this.promptActive || this.activeModal || this.slashMenu.isOpen) {
      return;
    }
    const line = this.rl?.line ?? "";
    const cursorCol = this.getCursorCol();
    let buf = SYNC_START;

    if (line.length === 0) {
      const maxPh = Math.max(12, (process.stdout.columns || 88) - this.promptVisibleWidth - 4);
      const ph = truncatePlain(PLACEHOLDER_TEXT, maxPh);
      buf += `${c(PALETTE.muted, ph)}\x1b[K`;
      this.placeholderVisible = true;
    } else {
      this.placeholderVisible = false;
    }

    const footer = renderComposerFooter();
    buf += `\r\n${footer}\x1b[K\x1b[1A\x1b[${Math.max(1, cursorCol)}G`;
    buf += SYNC_END;
    process.stdout.write(buf);
    this.footerVisible = true;
  }

  /**
   * Cleanly erases placeholder ghost text, footer strip, and/or inline popover.
   */
  private clearDecorations(restoreCursor = false): void {
    if (!process.stdout.isTTY) return;
    const cursorCol = this.getCursorCol();
    if (this.slashMenu.isOpen) {
      this.slashMenu.clear(restoreCursor ? cursorCol : undefined);
    }
    if (this.footerVisible || this.placeholderVisible) {
      let buf = SYNC_START;
      if (this.placeholderVisible && (this.rl?.line.length ?? 0) === 0) {
        buf += `\x1b[${Math.max(1, this.promptVisibleWidth + 1)}G\x1b[K`;
      }
      if (this.footerVisible) {
        buf += "\x1b[1B\r\x1b[J\x1b[1A";
      }
      if (restoreCursor) {
        buf += `\x1b[${Math.max(1, cursorCol)}G`;
      }
      buf += SYNC_END;
      process.stdout.write(buf);
      this.footerVisible = false;
      this.placeholderVisible = false;
    }
  }

  private clearReadlineBuffer(origTtyWrite: (s: string, key?: readline.Key) => void): void {
    origTtyWrite("", { ctrl: true, name: "e" });
    origTtyWrite("", { ctrl: true, name: "u" });
  }

  private replaceReadlineBuffer(
    origTtyWrite: (s: string, key?: readline.Key) => void,
    text: string,
  ): void {
    this.clearReadlineBuffer(origTtyWrite);
    for (const ch of text) {
      origTtyWrite(ch, {});
    }
  }

  /**
   * Launches an interactive floating SelectModal and suspends readline until resolved.
   */
  private runSelectModal<T>(config: SelectModalConfig<T>): Promise<ModalOutcome<T>> {
    return new Promise((resolve) => {
      if (!process.stdout.isTTY) {
        resolve({ action: "cancel" });
        return;
      }
      this.clearDecorations(true);
      this.slashMenu.reset();
      const modal = new SelectModal<T>(config, (outcome) => {
        this.activeModal = null;
        resolve(outcome);
      });
      this.activeModal = modal;
      modal.open();
    });
  }

  private runInputModal(config: InputModalConfig): Promise<InputOutcome> {
    return new Promise((resolve) => {
      if (!process.stdout.isTTY) {
        resolve({ action: "cancel" });
        return;
      }
      this.clearDecorations(true);
      this.slashMenu.reset();
      const modal = new InputModal(config, (outcome) => {
        this.activeModal = null;
        resolve(outcome);
      });
      this.activeModal = modal;
      modal.open();
    });
  }

  private runFormModal(config: FormModalConfig): Promise<FormOutcome> {
    return new Promise((resolve) => {
      if (!process.stdout.isTTY) {
        resolve({ action: "cancel" });
        return;
      }
      this.clearDecorations(true);
      this.slashMenu.reset();
      const modal = new FormModal(config, (outcome) => {
        this.activeModal = null;
        resolve(outcome);
      });
      this.activeModal = modal;
      modal.open();
    });
  }

  private runConfirmModal(config: ConfirmModalConfig): Promise<ConfirmOutcome> {
    return new Promise((resolve) => {
      if (!process.stdout.isTTY) {
        resolve({ confirmed: false });
        return;
      }
      this.clearDecorations(true);
      this.slashMenu.reset();
      const modal = new ConfirmModal(config, (outcome) => {
        this.activeModal = null;
        resolve(outcome);
      });
      this.activeModal = modal;
      modal.open();
    });
  }

  /**
   * Runs a hotkey-triggered interactive flow cleanly outside of readline's `line` event.
   */
  private triggerHotkeyFlow(
    origTtyWrite: (s: string, key?: readline.Key) => void,
    fn: () => Promise<void>,
  ): void {
    this.promptActive = false;
    this.clearDecorations(true);
    this.clearReadlineBuffer(origTtyWrite);
    this.slashMenu.reset();
    void fn()
      .catch((err) => {
        process.stdout.write(
          `\n  ${c(PALETTE.danger + PALETTE.bold, "✗ Error:")} ${c(PALETTE.text, err instanceof Error ? err.message : String(err))}\n`,
        );
      })
      .finally(() => {
        this.prompt(true);
      });
  }

  private attachInteractiveHook(): void {
    const rl = this.rl as (readline.Interface & {
      _ttyWrite?: (s: string, key?: readline.Key) => void;
    }) | null;
    if (!rl || !process.stdout.isTTY || typeof rl._ttyWrite !== "function") return;

    const origTtyWrite = rl._ttyWrite.bind(rl);

    rl._ttyWrite = (s: string, key: readline.Key = {}) => {
      // 1. Floating modal owns all keyboard input while open
      if (this.activeModal) {
        this.activeModal.handleKey(s, key);
        return;
      }

      if (!this.promptActive || this.engine.busy) {
        origTtyWrite(s, key);
        return;
      }

      // 2. Global keyboard shortcuts (tooey.design / termcn.dev / OpenCode)
      if (key.ctrl && key.name === "k") {
        this.triggerHotkeyFlow(origTtyWrite, () => this.openCommandPalette());
        return;
      }
      if (key.ctrl && key.name === "p") {
        this.triggerHotkeyFlow(origTtyWrite, () => this.openModelPicker());
        return;
      }
      if (key.ctrl && key.name === "g") {
        this.triggerHotkeyFlow(origTtyWrite, () => this.openAgentPicker());
        return;
      }
      if (key.ctrl && key.name === "t") {
        this.triggerHotkeyFlow(origTtyWrite, () => this.openThemePicker());
        return;
      }
      if (key.ctrl && key.name === "o") {
        this.triggerHotkeyFlow(origTtyWrite, () => this.openSessionPicker());
        return;
      }
      if (key.ctrl && key.name === "b") {
        this.triggerHotkeyFlow(origTtyWrite, async () => {
          await this.handleSlashCommand("/browser");
        });
        return;
      }
      if (key.ctrl && key.name === "l") {
        this.triggerHotkeyFlow(origTtyWrite, async () => {
          console.clear();
          process.stdout.write(
            renderBanner(
              this.engine.session,
              this.engine.getAgent(),
              this.engine.getProviders(),
              this.daemon.url,
              this.engine.channels.getPublicViews(),
            ),
          );
        });
        return;
      }

      // Press `?` on empty line for instant Shortcuts & Help card
      if (s === "?" && !key.ctrl && !key.meta && rl.line.length === 0) {
        this.triggerHotkeyFlow(origTtyWrite, async () => {
          process.stdout.write(renderHelpText());
        });
        return;
      }

      // Clear ghost placeholder before readline processes any character
      if (this.placeholderVisible && rl.line.length === 0) {
        process.stdout.write(`\x1b[${Math.max(1, this.promptVisibleWidth + 1)}G\x1b[K`);
        this.placeholderVisible = false;
      }

      // 3. Inline `/` or `@` popover key handling
      if (this.slashMenu.isOpen) {
        if (key.name === "up") {
          this.slashMenu.move(-1, this.getCursorCol());
          return;
        }
        if (key.name === "down") {
          this.slashMenu.move(1, this.getCursorCol());
          return;
        }
        if (key.name === "escape") {
          this.slashMenu.clear(this.getCursorCol());
          this.slashMenu.dismiss(rl.line);
          this.drawIdleDecorations();
          return;
        }
        if (key.name === "tab") {
          const completed = this.slashMenu.getSelectedCompletion();
          if (completed) {
            this.slashMenu.clear(this.getCursorCol());
            this.replaceReadlineBuffer(origTtyWrite, completed);
            this.slashMenu.dismiss(rl.line);
            this.drawIdleDecorations();
          }
          return;
        }
        if (key.name === "return" || key.name === "enter") {
          if (this.slashMenu.currentMode === "mention") {
            const completed = this.slashMenu.getSelectedCompletion();
            if (completed) {
              this.slashMenu.clear(this.getCursorCol());
              this.replaceReadlineBuffer(origTtyWrite, completed);
              this.slashMenu.dismiss(rl.line);
              this.drawIdleDecorations();
              return;
            }
          } else if (this.slashMenu.currentMode === "slash") {
            const spec = this.slashMenu.getSelectedSlashSpec();
            if (spec) {
              this.slashMenu.clear(this.getCursorCol());
              this.slashMenu.reset();
              // If command requires typed args (and doesn't have an interactive pop-up), fill & let user type args
              if (spec.takesArgs && !spec.interactivePopup && rl.line !== spec.name) {
                this.replaceReadlineBuffer(origTtyWrite, `${spec.name} `);
                this.drawIdleDecorations();
                return;
              }
              // Otherwise autocomplete to the highlighted command and execute immediately!
              if (rl.line !== spec.name) {
                this.replaceReadlineBuffer(origTtyWrite, spec.name);
              }
              origTtyWrite(s, key);
              return;
            }
          }
          this.slashMenu.clear(this.getCursorCol());
          this.slashMenu.reset();
          origTtyWrite(s, key);
          return;
        }
        if (key.ctrl && (key.name === "c" || key.name === "d")) {
          this.slashMenu.clear(this.getCursorCol());
          this.slashMenu.reset();
          origTtyWrite(s, key);
          return;
        }
      } else if (key.name === "escape" && rl.line.length > 0) {
        // Esc on non-empty idle prompt clears the input cleanly
        this.clearReadlineBuffer(origTtyWrite);
        this.drawIdleDecorations();
        return;
      } else if (key.name === "tab" && rl.line.startsWith("/") && !/\s/.test(rl.line)) {
        const matches = filterSlashCommands(rl.line);
        if (matches && matches.length > 0) {
          this.replaceReadlineBuffer(origTtyWrite, formatSlashCompletion(matches[0]));
          this.slashMenu.dismiss(rl.line);
          this.drawIdleDecorations();
          return;
        }
        return;
      }

      // Erase quiet footer right before Enter submits
      if (key.name === "return" || key.name === "enter") {
        this.clearDecorations(true);
      }

      origTtyWrite(s, key);

      if (this.promptActive && !this.engine.busy && !this.activeModal) {
        // Check if `/` or `@` popover wants to open
        const willOpenSlash = rl.line.startsWith("/") && !/\s/.test(rl.line);
        const willOpenMention = rl.line.startsWith("@") && !/\s/.test(rl.line);
        if (willOpenSlash || willOpenMention) {
          if (this.footerVisible) {
            process.stdout.write(`\x1b[1B\r\x1b[J\x1b[1A\x1b[${Math.max(1, this.getCursorCol())}G`);
            this.footerVisible = false;
          }
          this.slashMenu.sync(rl.line, this.getCursorCol());
        } else {
          if (this.slashMenu.isOpen) {
            this.slashMenu.clear(this.getCursorCol());
            this.slashMenu.reset();
          }
          this.drawIdleDecorations();
        }
      }
    };
  }

  private prompt(showContextBar = true): void {
    if (!this.rl) return;
    if (showContextBar) {
      process.stdout.write(renderContextBar(this.engine.session));
    }
    const promptStr = renderPromptString(this.engine.session);
    this.promptVisibleWidth = visibleLength(promptStr);
    this.promptActive = true;
    this.footerVisible = false;
    this.placeholderVisible = false;
    this.slashMenu.reset();
    this.rl.setPrompt(promptStr);
    this.rl.prompt();
    this.drawIdleDecorations();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACTIVE FLOATING POP-UPS (termcn.dev + tooey.design + Claude Code)
  // ═══════════════════════════════════════════════════════════════════════════

  private async openCommandPalette(): Promise<void> {
    const activeAgent = this.engine.session.activeAgent;
    const activeTheme = getActiveTheme();

    const options: SelectOption<string>[] = [
      { value: "popup:model", label: "Switch Model / Pin to Agent", description: this.engine.getEffectiveModelForAgent(activeAgent), badge: "^P", badgeColor: PALETTE.accentSoft, keywords: "model llm gpt claude gemini" },
      { value: "popup:agent", label: "Switch Specialist @Agent", description: `Current: @${activeAgent}`, badge: "^G", badgeColor: PALETTE.accentSoft, keywords: "agent recon reverser web-hunter" },
      { value: "popup:theme", label: "Switch Color Theme", description: `Current: ${activeTheme.name}`, badge: "^T", badgeColor: PALETTE.accentSoft, keywords: "theme color catppuccin tokyonight gruvbox nord" },
      { value: "cmd:/browser", label: "Open WebTUI Browser War-Room", description: this.daemon.url, badge: "^B", badgeColor: PALETTE.info, keywords: "browser web ui war-room" },
      { value: "popup:channels", label: "Connect Messaging Bots (Telegram / Discord / Slack)", description: `${this.engine.channels.getPublicViews().filter((ch) => ch.status.state === "connected").length} connected · text YEDOGU remotely`, badge: "⊞", badgeColor: PALETTE.info, keywords: "channels bot telegram discord slack webhook chat remote" },
      { value: "popup:providers", label: "Connect / Manage LLM Providers", description: "Enter API keys with masked input", badge: "⊞", badgeColor: PALETTE.success, keywords: "providers connect api key token" },
      { value: "popup:scope", label: "Scope & Rules of Engagement", description: `Mode: ${this.engine.session.scope.mode} (${this.engine.session.scope.allow.length} allow)`, badge: "⊞", badgeColor: PALETTE.warning, keywords: "scope roe allow deny enforced" },
      { value: "popup:sessions", label: "Switch or Create Session", description: `Current: ${this.engine.session.id}`, badge: "^O", badgeColor: PALETTE.accentSoft, keywords: "session resume new history" },
      { value: "popup:findings", label: "Inspect Findings Ledger", description: `${this.engine.session.findings.length} recorded findings`, badge: "⊞", badgeColor: PALETTE.danger, keywords: "findings vulns ledger bugs" },
      { value: "popup:report", label: "Export Sanitized Report", description: "Red-Team, HackerOne, or Bugcrowd Markdown", badge: "⊞", badgeColor: PALETTE.info, keywords: "report export markdown hackerone bugcrowd" },
      { value: "cmd:/mcp", label: "MCP Servers (REA & External)", description: "Inspect configured Model Context Protocol servers", badge: "/mcp", keywords: "mcp rea reverse" },
      { value: "cmd:/compact", label: "Compact Conversation Context", description: "Summarize earlier messages to free tokens", badge: "/compact", keywords: "compact context tokens" },
      { value: "cmd:/status", label: "Session Telemetry & Status", description: "Show tokens, artifacts, model & workspace", badge: "/status", keywords: "status info telemetry" },
      { value: "cmd:/clear", label: "Clear Screen & Messages", description: "Reset conversation history and redraw header", badge: "/clear", keywords: "clear reset" },
      { value: "cmd:/help", label: "Keyboard Shortcuts & Commands", description: "View full command reference", badge: "?", keywords: "help shortcuts keys" },
    ];

    const res = await this.runSelectModal({
      title: "Command Palette",
      subtitle: `@${activeAgent}`,
      placeholder: "Search actions, pop-ups, commands…",
      options,
    });
    if (res.action !== "select") return;

    const v = res.value;
    if (v === "popup:model") await this.openModelPicker();
    else if (v === "popup:agent") await this.openAgentPicker();
    else if (v === "popup:theme") await this.openThemePicker();
    else if (v === "popup:channels") await this.openChannelsManager();
    else if (v === "popup:providers") await this.openProviderManager();
    else if (v === "popup:scope") await this.openScopeManager();
    else if (v === "popup:sessions") await this.openSessionPicker();
    else if (v === "popup:findings") await this.openFindingsPicker();
    else if (v === "popup:report") await this.openReportPicker();
    else if (v.startsWith("cmd:")) await this.handleSlashCommand(v.slice(4));
  }

  private async openModelPicker(): Promise<void> {
    const activeAgent = this.engine.session.activeAgent;
    let pinToAgent = false;

    const initialConnected = this.engine.getConnectedProviders();
    if (initialConnected.length === 0) {
      process.stdout.write(
        `\n  ${c(PALETTE.warning, "!")} ${c(PALETTE.text, "No providers connected yet.")} ${c(PALETTE.muted, "Connect a provider first with /connect or /login.")}\n`,
      );
      await this.openProviderManager();
      return;
    }

    // Lazily fetch live models for any connected provider not yet synced
    const needsSync = initialConnected.some((p) => !this.engine.hasLiveModelsCached(p.id));
    if (needsSync) {
      const spin = new TerminalSpinner();
      spin.start("Syncing models from connected providers");
      try {
        await this.engine.refreshProviderModels();
      } finally {
        spin.stop();
      }
    }

    const EFFORT_DESCRIPTIONS: Record<string, string> = {
      low: "Fastest responses with minimal reasoning overhead",
      medium: "Balanced speed and reasoning quality for most tasks",
      high: "Deeper reasoning for complex analysis and debugging",
      xhigh: "Maximum reasoning depth for the hardest problems",
      max: "Maximum reasoning budget and thoroughness",
    };

    // Track chosen effort/variant index per model group
    const variantState = new Map<string, number>();

    const initVariantState = (groups: GroupedModelEntry[], currentTarget: string): void => {
      for (const g of groups) {
        if (variantState.has(g.key)) continue;
        const activeIdx = g.variants.findIndex((v) => v.spec === currentTarget);
        if (activeIdx !== -1) {
          variantState.set(g.key, activeIdx);
        } else {
          const medIdx = g.variants.findIndex((v) => v.label === "medium");
          variantState.set(g.key, medIdx !== -1 ? medIdx : 0);
        }
      }
    };

    const connectedProviders = this.engine.getConnectedProviders();
    const multiProvider = connectedProviders.length > 1;
    const grouped = groupModelsForPicker(connectedProviders);
    const initialTarget = this.engine.session.activeModel;
    initVariantState(grouped, initialTarget);

    const buildModelOptions = (): SelectOption<GroupedModelEntry>[] => {
      const currentTarget = pinToAgent
        ? this.engine.getEffectiveModelForAgent(activeAgent)
        : this.engine.session.activeModel;
      const curProviders = this.engine.getConnectedProviders();
      const groups = groupModelsForPicker(curProviders);
      initVariantState(groups, currentTarget);

      return groups.map((g) => {
        const isCurrent = g.variants.some((v) => v.spec === currentTarget);
        const badgeText = isCurrent
          ? "(current)"
          : multiProvider
            ? g.provider.id
            : undefined;
        const badgeColor = isCurrent ? PALETTE.accent : PALETTE.muted;
        const allIds = g.variants.map((v) => `${v.spec} ${v.label} ${v.model.name}`).join(" ");
        return {
          value: g,
          label: g.displayName,
          badge: badgeText,
          badgeColor,
          active: isCurrent,
          keywords: `${g.provider.id} ${g.provider.name} ${g.displayName} ${allIds}`,
        };
      });
    };

    const renderEffortPanel = (
      selected: SelectOption<GroupedModelEntry> | undefined,
      innerWidth: number,
    ): string[] => {
      if (!selected) return [];
      const g = selected.value;
      const idx = Math.max(0, Math.min(variantState.get(g.key) ?? 0, g.variants.length - 1));
      const activeVar = g.variants[idx];

      if (g.variants.length <= 1) {
        const ctx = activeVar.model.contextWindow >= 1_000_000
          ? `${(activeVar.model.contextWindow / 1_000_000).toFixed(0)}M`
          : `${Math.round(activeVar.model.contextWindow / 1000)}k`;
        return [
          `  ${c(PALETTE.muted, "Model")}   ${c(PALETTE.secondary, activeVar.spec)}  ${c(PALETTE.muted, `· ${ctx} context · ${g.provider.name}`)}`,
        ];
      }

      const panelTitle = g.isEffortGroup ? "Effort" : "Variant";
      const n = g.variants.length;
      const segLen = Math.max(5, Math.min(10, Math.floor((innerWidth - 26) / Math.max(1, n - 1))));
      const step = segLen + 1;

      const leftArrow = idx > 0 ? c(PALETTE.accent, "◂") : c(PALETTE.muted, "◂");
      const rightArrow = idx < n - 1 ? c(PALETTE.accent, "▸") : c(PALETTE.muted, "▸");

      const prefixPlain = `  ${panelTitle.padEnd(7)} ◂     `;
      const prefixStyled = `  ${c(PALETTE.secondary + PALETTE.bold, panelTitle.padEnd(7))} ${leftArrow}     `;

      let track = "";
      for (let i = 0; i < n; i++) {
        if (i < idx) track += c(PALETTE.accent, "●");
        else if (i === idx) track += c(PALETTE.accent + PALETTE.bold, "◉");
        else track += c(PALETTE.muted, "○");

        if (i < n - 1) {
          track += i < idx ? c(PALETTE.accent, "━".repeat(segLen)) : c(PALETTE.border, "─".repeat(segLen));
        }
      }
      const trackLine = `${prefixStyled}${track}     ${rightArrow}`;

      // Build aligned labels row directly beneath each node center
      const baseCol = prefixPlain.length;
      let cursor = 0;
      let labelsLine = "";
      for (let i = 0; i < n; i++) {
        const lbl = g.variants[i].label;
        const centerCol = baseCol + i * step;
        const startCol = Math.max(cursor + (i > 0 ? 1 : 0), centerCol - Math.floor(lbl.length / 2));
        if (startCol > cursor) {
          labelsLine += " ".repeat(startCol - cursor);
        }
        labelsLine += i === idx ? c(PALETTE.text + PALETTE.bold, lbl) : c(PALETTE.muted, lbl);
        cursor = startCol + lbl.length;
      }

      const descText =
        EFFORT_DESCRIPTIONS[activeVar.label] ||
        `${activeVar.model.name} · ${activeVar.spec}`;
      const descPad = " ".repeat(Math.max(2, Math.min(10, baseCol - 4)));
      const descLine = `${descPad}${c(PALETTE.muted, descText)}`;

      return [trackLine, labelsLine, descLine];
    };

    const initialOptions = buildModelOptions();
    const initialIdx = Math.max(
      0,
      initialOptions.findIndex((o) => o.active),
    );
    const connectedCount = connectedProviders.length;

    const res = await this.runSelectModal({
      title: "Switch Model",
      subtitle: `${connectedCount} connected · Target: Default`,
      placeholder: "Search models…",
      options: initialOptions,
      initialIndex: initialIdx,
      footerHints: "↑/↓ navigate · ←/→ effort · tab pin/@agent · enter select · esc close",
      onLeftRight: (delta, selected) => {
        if (!selected || selected.value.variants.length <= 1) return;
        const g = selected.value;
        const cur = variantState.get(g.key) ?? 0;
        const next = Math.max(0, Math.min(g.variants.length - 1, cur + delta));
        variantState.set(g.key, next);
      },
      renderFooterPanel: renderEffortPanel,
      onTab: () => {
        pinToAgent = !pinToAgent;
        return {
          subtitle: pinToAgent
            ? `${connectedCount} connected · Pin → @${activeAgent}`
            : `${connectedCount} connected · Target: Default`,
          options: buildModelOptions(),
        };
      },
    });

    if (res.action !== "select") return;
    const chosenGroup = res.value;
    const chosenIdx = Math.max(
      0,
      Math.min(variantState.get(chosenGroup.key) ?? 0, chosenGroup.variants.length - 1),
    );
    const chosenVariant = chosenGroup.variants[chosenIdx];
    const normalized = this.engine.setModel(chosenVariant.spec, pinToAgent ? activeAgent : undefined);
    const effortNote =
      chosenGroup.variants.length > 1
        ? ` ${c(PALETTE.muted, `(${chosenVariant.label})`)}`
        : "";
    process.stdout.write(
      `\n  ${c(PALETTE.success, "✓")} ${pinToAgent ? `Pinned ${c(PALETTE.accent + PALETTE.bold, `@${activeAgent}`)}` : "Default model"} → ${c(PALETTE.text + PALETTE.bold, chosenGroup.displayName)}${effortNote} ${c(PALETTE.muted, `[${normalized}]`)}\n`,
    );
  }

  private async openAgentPicker(): Promise<void> {
    const agents = this.engine.getAgents();
    const activeId = this.engine.session.activeAgent;

    const options: SelectOption<string>[] = agents.map((a) => ({
      value: a.id,
      label: `@${a.id}`,
      description: a.title,
      badge: truncatePlain(this.engine.getEffectiveModelForAgent(a.id), 24),
      badgeColor: a.id === activeId ? PALETTE.accent : PALETTE.muted,
      active: a.id === activeId,
      keywords: `${a.id} ${a.title} ${a.description}`,
    }));

    const res = await this.runSelectModal({
      title: "Switch Specialist Agent",
      subtitle: `${agents.length} agents`,
      placeholder: "Filter agents (recon, reverser, web, cloud, web3)…",
      options,
    });
    if (res.action !== "select") return;

    const switched = this.engine.setActiveAgent(res.value);
    process.stdout.write(
      `\n  ${c(PALETTE.success, "✓")} Active agent → ${c(PALETTE.accent + PALETTE.bold, `@${switched.id}`)} ${c(PALETTE.muted, `· ${switched.title}`)}\n`,
    );
  }

  private async openThemePicker(): Promise<void> {
    const current = getActiveTheme();
    const themes = listThemes();

    const options: SelectOption<string>[] = themes.map((t) => ({
      value: t.id,
      label: t.name,
      description: t.vibe,
      badge: `${renderThemeSwatch(t)}${t.id === current.id ? ` ${c(PALETTE.accent, "★")}` : ""}`,
      badgeRaw: true,
      active: t.id === current.id,
      keywords: `${t.id} ${t.name} ${t.vibe}`,
    }));

    const res = await this.runSelectModal({
      title: "Color Theme",
      subtitle: `active: ${current.id}`,
      placeholder: "Filter themes (claude, catppuccin, tokyonight, gruvbox, nord)…",
      options,
    });
    if (res.action !== "select") return;

    this.applyThemeAndRedraw(res.value);
  }

  private applyThemeAndRedraw(themeId: string): void {
    const applied = setActiveTheme(themeId);
    this.engine.setTheme(applied.id);
    console.clear();
    process.stdout.write(
      renderBanner(
        this.engine.session,
        this.engine.getAgent(),
        this.engine.getProviders(),
        this.daemon.url,
        this.engine.channels.getPublicViews(),
      ),
    );
    process.stdout.write(
      `  ${c(PALETTE.success, "✓")} Theme switched to ${c(PALETTE.accent + PALETTE.bold, applied.name)} ${renderThemeSwatch(applied)}\n`,
    );
  }

  private async openProviderManager(): Promise<void> {
    while (true) {
      const providers = this.engine.getProviders();
      const options: SelectOption<ProviderConfig>[] = providers.map((p) => {
        const connected = isProviderConnected(p);
        return {
          value: p,
          label: p.id,
          description: p.name,
          badge: connected
            ? `● ${p.authSource || "connected"}`
            : p.local
              ? "○ local"
              : "○ connect",
          badgeColor: connected ? PALETTE.success : PALETTE.muted,
          active: connected,
          keywords: `${p.id} ${p.name} ${p.defaultModel}`,
        };
      });

      const res = await this.runSelectModal({
        title: "LLM Providers",
        subtitle: "Enter to connect, login, or delete",
        placeholder: "Search providers (gemini, codex, anthropic, openai, deepseek, ollama)…",
        options,
        footerHints: "↑↓ move · ↵ manage · esc close",
      });
      if (res.action !== "select") return;
      const outcome = await this.openConnectKeyModal(res.value, true);
      if (outcome !== "back") return;
    }
  }

  private async syncAndPrintConnectedProvider(provider: ProviderConfig): Promise<void> {
    const spin = new TerminalSpinner();
    spin.start(`Syncing live models for ${provider.name}`);
    let results: Array<{ providerId: string; count: number; live: boolean; error?: string }> = [];
    try {
      results = await this.engine.refreshProviderModels(provider.id);
    } finally {
      spin.stop();
    }

    const updated = this.engine.getProviders().find((p) => p.id === provider.id) ?? provider;
    const syncInfo = results[0];
    const sourceBadge = updated.authSource ? ` via ${updated.authSource}` : "";
    const modelSample = updated.models
      .slice(0, 5)
      .map((m) => `${updated.id}/${m.id}`)
      .join(", ");
    const more = updated.models.length > 5 ? ` +${updated.models.length - 5} more` : "";

    process.stdout.write(
      `\n  ${c(PALETTE.success, "✓")} Connected ${c(PALETTE.text + PALETTE.bold, updated.name)} ${c(PALETTE.muted, `(${updated.id}${sourceBadge})`)} · ${c(PALETTE.info, `${updated.models.length} models${syncInfo?.live ? " (live)" : ""}`)}\n`,
    );
    if (modelSample) {
      process.stdout.write(
        `    ${c(PALETTE.muted, "Models:")} ${c(PALETTE.secondary, modelSample)}${c(PALETTE.muted, more)}\n`,
      );
    }
    process.stdout.write(
      `    ${c(PALETTE.muted, "Next:")} ${c(PALETTE.text, "/model")} ${c(PALETTE.muted, "to pick any connected model.")}\n`,
    );
  }

  private async runInteractiveCliLogin(
    provider: ProviderConfig,
    cliSpec: {
      binary: string;
      command: string;
      displayCmd: string;
      expectedSource: ProviderConfig["authSource"];
      installHint: string;
      credPathHint: string;
      note?: string;
    },
  ): Promise<boolean> {
    // Check if the CLI binary is actually installed before spawning
    const checkCmd = process.platform === "win32" ? `where ${cliSpec.binary}` : `command -v ${cliSpec.binary}`;
    const probe = spawnSync(checkCmd, { stdio: "ignore", shell: true });
    if (probe.status !== 0) {
      process.stdout.write(
        `\n  ${c(PALETTE.warning, "!")} ${c(PALETTE.text + PALETTE.bold, cliSpec.binary)} CLI is not installed on this machine.\n` +
          `    ${c(PALETTE.muted, "Install & sign in:")} ${c(PALETTE.secondary, cliSpec.installHint)}\n` +
          `    ${c(PALETTE.muted, "Or choose")} ${c(PALETTE.text, "Paste API Key")} ${c(PALETTE.muted, `in /connect ${provider.id}.`)}\n`,
      );
      return false;
    }

    // For Google Antigravity (agy), check if already signed in before launching interactive CLI
    if (cliSpec.expectedSource === "agy-cli") {
      const spin = new TerminalSpinner();
      spin.start("Checking Google Antigravity (agy) session");
      let agyProbe: { models: unknown[]; ok: boolean; error?: string };
      try {
        agyProbe = await probeAgyModels(15000);
      } finally {
        spin.stop();
      }
      if (agyProbe.ok) {
        const updated = this.engine.connectProvider(provider.id, "agy-cli");
        await this.syncAndPrintConnectedProvider(updated);
        return true;
      }
    }

    process.stdout.write(
      `\n  ${c(PALETTE.info, "→")} Launching ${c(PALETTE.text + PALETTE.bold, cliSpec.displayCmd)} for ${provider.name} sign-in…\n`,
    );
    if (cliSpec.note) {
      process.stdout.write(`    ${c(PALETTE.muted, cliSpec.note)}\n`);
    }

    // Temporarily hand terminal stdin/stdout to the official CLI login flow
    const wasRaw = Boolean(process.stdin.isTTY && (process.stdin as any).isRaw);
    this.rl?.pause();
    if (wasRaw && typeof process.stdin.setRawMode === "function") {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // ignore
      }
    }

    let exitCode = 1;
    try {
      const child = spawnSync(cliSpec.command, {
        stdio: "inherit",
        shell: true,
      });
      exitCode = child.status ?? 1;
    } finally {
      if (wasRaw && typeof process.stdin.setRawMode === "function") {
        try {
          process.stdin.setRawMode(true);
        } catch {
          // ignore
        }
      }
      this.rl?.resume();
    }

    if (cliSpec.expectedSource === "agy-cli") {
      const agyAfter = await probeAgyModels(15000);
      if (agyAfter.ok) {
        const updated = this.engine.connectProvider(provider.id, "agy-cli");
        await this.syncAndPrintConnectedProvider(updated);
        return true;
      }
      process.stdout.write(
        `\n  ${c(PALETTE.warning, "!")} Google Antigravity (${c(PALETTE.text, "agy")}) is not signed in yet${agyAfter.error ? ` (${agyAfter.error})` : ""}.\n` +
          `    ${c(PALETTE.muted, "Run")} ${c(PALETTE.secondary, "agy")} ${c(PALETTE.muted, "to sign in, or paste a Google AI Studio API key.")}\n`,
      );
      return false;
    }

    const refreshed = this.engine.getProviders().find((p) => p.id === provider.id);
    if (exitCode === 0 && refreshed && refreshed.authSource === cliSpec.expectedSource) {
      await this.syncAndPrintConnectedProvider(refreshed);
      return true;
    }

    if (refreshed && isProviderConnected(refreshed) && refreshed.authSource !== cliSpec.expectedSource) {
      process.stdout.write(
        `\n  ${c(PALETTE.warning, "!")} CLI login did not write ${c(PALETTE.text, cliSpec.credPathHint)}${exitCode !== 0 ? ` (exit ${exitCode})` : ""}.\n` +
          `    ${c(PALETTE.muted, `Note: ${provider.name} is still using your existing ${refreshed.authSource} credential.`)}\n`,
      );
      return false;
    }

    process.stdout.write(
      `\n  ${c(PALETTE.warning, "!")} No ${provider.name} CLI credentials detected at ${c(PALETTE.text, cliSpec.credPathHint)}${exitCode !== 0 ? ` (exit ${exitCode})` : ""}.\n` +
        `    ${c(PALETTE.muted, "Install / login:")} ${c(PALETTE.secondary, cliSpec.installHint)}\n` +
        `    ${c(PALETTE.muted, "Or connect with an API key via:")} ${c(PALETTE.text, `/connect ${provider.id}`)}\n`,
    );
    return false;
  }

  private async openConnectKeyModal(
    provider: ProviderConfig,
    canGoBack = false,
  ): Promise<"done" | "back" | "cancel"> {
    const cliLoginSpecs: Record<
      string,
      {
        label: string;
        description: string;
        binary: string;
        command: string;
        displayCmd: string;
        expectedSource: ProviderConfig["authSource"];
        installHint: string;
        credPathHint: string;
        keyUrl: string;
        note?: string;
      }
    > = {
      gemini: {
        label: "Google Antigravity Login (agy CLI)",
        description: "Use your signed-in Google Antigravity (agy) account & models",
        binary: "agy",
        command: "agy",
        displayCmd: "agy",
        expectedSource: "agy-cli",
        installHint: "Install Google Antigravity CLI (https://antigravity.google/docs/getting-started) and run `agy`",
        credPathHint: "agy models",
        keyUrl: "https://aistudio.google.com/apikey",
        note: "Sign in inside Antigravity CLI (`agy`), then exit (/quit) to return to YEDOGU.",
      },
      codex: {
        label: "ChatGPT / Codex CLI Login",
        description: "Sign in with your OpenAI / ChatGPT subscription (~/.codex/auth.json)",
        binary: "codex",
        command: "codex login",
        displayCmd: "codex login",
        expectedSource: "codex-cli",
        installHint: "npm i -g @openai/codex && codex login",
        credPathHint: "~/.codex/auth.json",
        keyUrl: "https://platform.openai.com/api-keys",
      },
      anthropic: {
        label: "Claude Code Login (Subscription / OAuth)",
        description: "Sign in with your Claude Pro/Max subscription (~/.claude/.credentials.json)",
        binary: "claude",
        command: "claude login",
        displayCmd: "claude login",
        expectedSource: "claude-cli",
        installHint: "npm i -g @anthropic-ai/claude-code && claude login",
        credPathHint: "~/.claude/.credentials.json",
        keyUrl: "https://console.anthropic.com/settings/keys",
      },
    };

    const cliSpec = cliLoginSpecs[provider.id];
    const escHint = canGoBack ? "esc back" : "esc close";

    const promptAndSaveApiKey = async (current: ProviderConfig, backLabel: string): Promise<"saved" | "back"> => {
      const envHint = current.envKeys.length ? `env: ${current.envKeys[0]}` : current.baseUrl;
      const keyRes = await this.runInputModal({
        title: isProviderConnected(current) ? `Update ${current.name} API Key` : `Connect ${current.name}`,
        subtitle: `${current.id} · ${backLabel}`,
        placeholder: current.local ? "Optional token or press Enter" : "Paste API key…",
        secret: !current.local,
        hint: `Default model: ${current.id}/${current.defaultModel} · ${envHint}`,
        validate: (val) => (!current.local && val.length < 4 ? "API key looks too short." : null),
      });
      if (keyRes.action !== "submit") return "back";
      const updated = this.engine.connectProvider(current.id, keyRes.value || "local");
      await this.syncAndPrintConnectedProvider(updated);
      return "saved";
    };

    // If disconnected and no CLI login options, go straight to API key input (Esc goes back to provider list)
    const initialCurrent = this.engine.getProviders().find((p) => p.id === provider.id) ?? provider;
    if (!cliSpec && !isProviderConnected(initialCurrent)) {
      const keyOutcome = await promptAndSaveApiKey(initialCurrent, escHint);
      return keyOutcome === "saved" ? "done" : canGoBack ? "back" : "cancel";
    }

    while (true) {
      const current = this.engine.getProviders().find((p) => p.id === provider.id) ?? provider;
      const connected = isProviderConnected(current);
      const isCliAuth =
        current.authSource === "codex-cli" ||
        current.authSource === "claude-cli";
      const isAgyAuth = current.authSource === "agy-cli";

      const actionOptions: SelectOption<string>[] = [];
      if (cliSpec) {
        actionOptions.push({
          value: "cli",
          label: cliSpec.label,
          description: cliSpec.description,
          badge: "OAuth",
          badgeColor: PALETTE.accent,
          keywords: "oauth login google chatgpt claude subscription cli",
        });
      }
      actionOptions.push({
        value: "apikey",
        label: connected ? "Update Saved API Key" : "Paste API Key",
        description: cliSpec
          ? `Direct API key (${cliSpec.keyUrl})`
          : `Save API key or token for ${current.name}`,
        badge: "Key",
        badgeColor: PALETTE.success,
        keywords: "api key token paste update",
      });
      if (cliSpec) {
        actionOptions.push({
          value: "browser",
          label: "Open API Key Page in Browser",
          description: cliSpec.keyUrl,
          badge: "Web",
          badgeColor: PALETTE.info,
          keywords: "open browser web key",
        });
      }
      if (connected) {
        const deleteLabel = isAgyAuth
          ? "Disconnect Antigravity (agy CLI)"
          : isCliAuth
            ? `Delete CLI Login (${cliSpec?.credPathHint || current.authSource})`
            : current.authSource === "env"
              ? `Disconnect (env var ${current.envKeys[0] || "active"})`
              : "Delete Saved API Key";
        const deleteDesc = isAgyAuth
          ? "Disconnect Google Antigravity (agy) from YEDOGU"
          : isCliAuth
            ? `Remove stored OAuth login file for ${current.name}`
            : current.authSource === "env"
              ? `Clear any saved key (unset ${current.envKeys[0] || "env var"} in shell to fully disconnect)`
              : `Remove saved API key for ${current.name} from YEDOGU config`;
        actionOptions.push({
          value: "delete",
          label: deleteLabel,
          description: deleteDesc,
          badge: isAgyAuth || isCliAuth ? "Logout" : "Delete",
          badgeColor: PALETTE.danger,
          keywords: "delete remove disconnect logout revoke clear api key login agy antigravity",
        });
      }

      const methodRes = await this.runSelectModal({
        title: `${connected ? "Manage" : "Connect"} ${current.name}`,
        subtitle: connected ? `${current.id} · ● ${current.authSource}` : current.id,
        placeholder: "Choose an action…",
        options: actionOptions,
        footerHints: `↑↓ move · ↵ select · ${escHint}`,
      });

      if (methodRes.action !== "select") {
        return canGoBack ? "back" : "cancel";
      }

      if (methodRes.value === "cli" && cliSpec) {
        const ok = await this.runInteractiveCliLogin(current, cliSpec);
        if (ok) return "done";
        continue;
      }

      if (methodRes.value === "browser" && cliSpec) {
        openInBrowser(cliSpec.keyUrl);
        process.stdout.write(
          `\n  ${c(PALETTE.info, "↗")} Opened ${c(PALETTE.text, cliSpec.keyUrl)} in your browser.\n`,
        );
        const keyOutcome = await promptAndSaveApiKey(current, "esc back");
        if (keyOutcome === "saved") return "done";
        continue;
      }

      if (methodRes.value === "apikey") {
        const keyOutcome = await promptAndSaveApiKey(current, "esc back");
        if (keyOutcome === "saved") return "done";
        continue;
      }

      if (methodRes.value === "delete") {
        const confirmRes = await this.runConfirmModal({
          title: `Disconnect ${current.name}?`,
          message: isCliAuth
            ? `Delete saved YEDOGU key and remove CLI OAuth credentials (${cliSpec?.credPathHint || current.authSource})?`
            : `Delete saved API key for ${current.name} (${current.id}) from YEDOGU config?`,
          confirmLabel: isCliAuth ? "Delete Login" : "Delete API Key",
          cancelLabel: "Back",
          danger: true,
        });
        if (!confirmRes.confirmed) {
          continue;
        }
        const res = this.engine.disconnectProvider(current.id, { removeCliAuth: isCliAuth });
        if (res.stillConnectedViaEnv) {
          process.stdout.write(
            `\n  ${c(PALETTE.warning, "!")} Cleared saved credentials for ${c(PALETTE.text + PALETTE.bold, current.name)}, but ${c(PALETTE.info, current.envKeys[0] || "an env var")} is still set in your shell.\n`,
          );
        } else {
          process.stdout.write(
            `\n  ${c(PALETTE.success, "✓")} Disconnected ${c(PALETTE.text + PALETTE.bold, current.name)} ${c(PALETTE.muted, `(${current.id})`)} — credentials deleted.\n`,
          );
        }
        return canGoBack ? "back" : "done";
      }
    }
  }

  private async openSessionPicker(): Promise<void> {
    const recent = listSessions().slice(0, 20);
    const curId = this.engine.session.id;

    const options: SelectOption<string>[] = [
      {
        value: "__new__",
        label: "+ New session…",
        description: "Start a fresh engagement session",
        badge: "create",
        badgeColor: PALETTE.accent,
        keywords: "new create fresh session",
      },
      ...recent.map((s) => ({
        value: s.id,
        label: s.name || s.id,
        description: s.id,
        badge: `${s.messagesCount} msgs · ${s.findingsCount} ⚑`,
        badgeColor: s.id === curId ? PALETTE.accent : PALETTE.muted,
        active: s.id === curId,
        keywords: `${s.id} ${s.name}`,
      })),
    ];

    const res = await this.runSelectModal({
      title: "Sessions",
      subtitle: `${recent.length} saved`,
      placeholder: "Filter sessions or select + New session…",
      options,
    });
    if (res.action !== "select") return;

    if (res.value === "__new__") {
      const nameRes = await this.runInputModal({
        title: "New Session",
        subtitle: "optional name",
        placeholder: "e.g. acme-api-audit (or leave blank)",
      });
      if (nameRes.action !== "submit") return;
      this.engine.newSession(nameRes.value || undefined);
      process.stdout.write(
        `\n  ${c(PALETTE.success, "✓")} Started new session ${c(PALETTE.info, this.engine.session.id)} ${c(PALETTE.muted, `(${this.engine.session.name})`)}\n`,
      );
      return;
    }

    if (res.value === curId) return;
    const loaded = this.engine.switchSession(res.value);
    process.stdout.write(
      `\n  ${c(PALETTE.success, "✓")} Resumed session ${c(PALETTE.info, loaded.id)} ${c(PALETTE.muted, `· ${loaded.messages.length} msgs · ${loaded.findings.length} findings`)}\n`,
    );
  }

  private async openScopeManager(): Promise<void> {
    const sc = this.engine.session.scope;
    const nextMode = sc.mode === "enforced" ? "advisory" : "enforced";

    const options: SelectOption<{ kind: string; rule?: string }>[] = [
      {
        value: { kind: "toggle" },
        label: `Switch mode → ${nextMode.toUpperCase()}`,
        description: sc.mode === "enforced" ? "Currently blocking out-of-scope HTTP" : "Currently warning only",
        badge: sc.mode === "enforced" ? "● enforced" : "○ advisory",
        badgeColor: sc.mode === "enforced" ? PALETTE.success : PALETTE.warning,
        keywords: "mode toggle enforced advisory",
      },
      {
        value: { kind: "add-allow" },
        label: "+ Add allow rule…",
        description: "Domain, wildcard (*.target.com), or CIDR",
        badge: "allow",
        badgeColor: PALETTE.success,
        keywords: "add allow target domain wildcard cidr",
      },
      {
        value: { kind: "add-deny" },
        label: "+ Add deny rule…",
        description: "Explicitly out-of-scope host or path",
        badge: "deny",
        badgeColor: PALETTE.danger,
        keywords: "add deny block exclude",
      },
      ...sc.allow.map((r) => ({
        value: { kind: "rm-allow", rule: r },
        label: r,
        description: "Press Enter to remove allow rule",
        badge: "ALLOW",
        badgeColor: PALETTE.success,
        keywords: `allow ${r}`,
      })),
      ...sc.deny.map((r) => ({
        value: { kind: "rm-deny", rule: r },
        label: r,
        description: "Press Enter to remove deny rule",
        badge: "DENY",
        badgeColor: PALETTE.danger,
        keywords: `deny ${r}`,
      })),
    ];

    const res = await this.runSelectModal({
      title: "Scope & Rules of Engagement",
      subtitle: `${sc.mode} · ${sc.allow.length}↑ ${sc.deny.length}↓`,
      placeholder: "Filter rules or pick an action…",
      options,
    });
    if (res.action !== "select") return;

    const act = res.value;
    if (act.kind === "toggle") {
      this.engine.updateScope({ mode: nextMode });
      process.stdout.write(
        `\n  ${c(PALETTE.success, "✓")} Scope mode set to ${c(nextMode === "enforced" ? PALETTE.success + PALETTE.bold : PALETTE.warning + PALETTE.bold, nextMode)}\n`,
      );
    } else if (act.kind === "add-allow" || act.kind === "add-deny") {
      const ruleKind = act.kind === "add-allow" ? "allow" : "deny";
      const inp = await this.runInputModal({
        title: ruleKind === "allow" ? "Add Scope Allow Rule" : "Add Scope Deny Rule",
        subtitle: ruleKind.toUpperCase(),
        placeholder: ruleKind === "allow" ? "*.target.com or 10.10.0.0/16" : "admin.target.com",
        validate: (v) => (v.length < 2 ? "Enter a valid host, wildcard, URL, or CIDR." : null),
      });
      if (inp.action === "submit") {
        this.engine.addScopeRule(ruleKind, inp.value);
        process.stdout.write(
          `\n  ${c(ruleKind === "allow" ? PALETTE.success : PALETTE.danger, "✓")} Added ${ruleKind} rule: ${c(PALETTE.text, inp.value)}\n`,
        );
      }
    } else if ((act.kind === "rm-allow" || act.kind === "rm-deny") && act.rule) {
      const ruleKind = act.kind === "rm-allow" ? "allow" : "deny";
      const conf = await this.runConfirmModal({
        title: "Remove Scope Rule",
        message: `Remove ${ruleKind.toUpperCase()} rule "${act.rule}"?`,
        confirmLabel: "Remove",
        danger: true,
      });
      if (conf.confirmed) {
        this.engine.removeScopeRule(ruleKind, act.rule);
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Removed ${ruleKind} rule: ${c(PALETTE.text, act.rule)}\n`);
      }
    }
  }

  private async openFindingsPicker(): Promise<void> {
    const findings = this.engine.session.findings;
    if (findings.length === 0) {
      process.stdout.write(renderFindingsTerminal(findings));
      return;
    }

    const sevColors: Record<string, string> = {
      critical: PALETTE.danger + PALETTE.bold,
      high: PALETTE.warning + PALETTE.bold,
      medium: PALETTE.accentSoft,
      low: PALETTE.info,
      info: PALETTE.muted,
    };

    const options = findings.map((f) => ({
      value: f,
      label: f.title,
      description: `${f.target} · @${f.agentId}`,
      badge: `${f.severity.toUpperCase()}${f.cvssScore !== undefined ? ` ${f.cvssScore}` : ""}`,
      badgeColor: sevColors[f.severity] ?? PALETTE.text,
      keywords: `${f.id} ${f.severity} ${f.title} ${f.target} ${f.category}`,
    }));

    const res = await this.runSelectModal({
      title: "Findings Ledger",
      subtitle: `${findings.length} recorded`,
      placeholder: "Filter by title, severity, or target…",
      options,
      footerHints: "↑↓ move · ↵ inspect detail card · esc close",
    });
    if (res.action !== "select") return;
    process.stdout.write(renderFindingDetailCard(res.value));
  }

  private async openReportPicker(): Promise<void> {
    const fmtRes = await this.runSelectModal<"redteam" | "hackerone" | "bugcrowd">({
      title: "Export Sanitized Report",
      subtitle: `${this.engine.session.findings.length} findings`,
      searchable: false,
      options: [
        { value: "redteam", label: "Enterprise Red-Team", description: "Executive + technical narrative with redacted evidence", badge: "redteam", active: true },
        { value: "hackerone", label: "HackerOne", description: "Impact-first triage-ready Markdown template", badge: "h1" },
        { value: "bugcrowd", label: "Bugcrowd", description: "VRT-aligned severity & repro Markdown template", badge: "bc" },
      ],
    });
    if (fmtRes.action !== "select") return;

    const destRes = await this.runSelectModal<"print" | "file">({
      title: `Report Destination (${fmtRes.value})`,
      searchable: false,
      options: [
        { value: "print", label: "Render in Terminal", description: "Stream formatted Markdown directly below", badge: "stdout", active: true },
        { value: "file", label: "Save to Markdown File…", description: "Write redacted .md file in workspace", badge: ".md" },
      ],
    });
    if (destRes.action !== "select") return;

    const md = this.engine.getReport(fmtRes.value);
    if (destRes.value === "file") {
      const fileRes = await this.runInputModal({
        title: "Save Report File",
        subtitle: fmtRes.value,
        initialValue: `yedogu-report-${fmtRes.value}.md`,
        validate: (v) => (v.length < 2 ? "Enter a filename." : null),
      });
      if (fileRes.action !== "submit") return;
      const outPath = path.resolve(this.engine.session.workspace, fileRes.value);
      fs.writeFileSync(outPath, md, "utf8");
      process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Saved sanitized ${fmtRes.value} report to ${c(PALETTE.info, outPath)}\n`);
    } else {
      process.stdout.write("\n");
      this.markdown.reset();
      this.markdown.push(md);
      this.markdown.flush();
    }
  }

  private async openChannelsManager(): Promise<void> {
    while (true) {
      const channels = this.engine.channels.getPublicViews();
      const liveCount = channels.filter((ch) => ch.status.state === "connected").length;
      const countFor = (plat: string) =>
        channels.filter((ch) => ch.platform === plat && ch.status.state === "connected").length;

      const options: SelectOption<{ kind: string; channel?: ChannelPublicView }>[] = [
        {
          value: { kind: "add-telegram" },
          label: "Telegram",
          description: "Long-polling bot via @BotFather (no tunnel needed)",
          badge: countFor("telegram") > 0 ? `● ${countFor("telegram")} live` : "+ setup",
          badgeColor: countFor("telegram") > 0 ? PALETTE.success : PALETTE.info,
          keywords: "add telegram bot botfather tg",
        },
        {
          value: { kind: "add-discord" },
          label: "Discord",
          description: "Gateway v10 bot for DMs & server channels",
          badge: countFor("discord") > 0 ? `● ${countFor("discord")} live` : "+ setup",
          badgeColor: countFor("discord") > 0 ? PALETTE.success : PALETTE.accent,
          keywords: "add discord bot gateway server dm",
        },
        {
          value: { kind: "add-slack" },
          label: "Slack",
          description: "Socket Mode bot for DMs & @mentions (no public URL)",
          badge: countFor("slack") > 0 ? `● ${countFor("slack")} live` : "+ setup",
          badgeColor: countFor("slack") > 0 ? PALETTE.success : PALETTE.success,
          keywords: "add slack bot socket mode workspace",
        },
        {
          value: { kind: "add-webhook" },
          label: "Webhook Bridge",
          description: "HTTP bridge for WhatsApp, Matrix, n8n, iOS Shortcuts",
          badge: countFor("webhook") > 0 ? `● ${countFor("webhook")} live` : "+ setup",
          badgeColor: countFor("webhook") > 0 ? PALETTE.success : PALETTE.warning,
          keywords: "add webhook http api whatsapp matrix n8n shortcut custom",
        },
        ...channels.map((ch) => {
          const stBadge =
            ch.status.state === "connected"
              ? "● live"
              : ch.status.state === "error"
                ? "✗ error"
                : "○ off";
          const stColor =
            ch.status.state === "connected"
              ? PALETTE.success
              : ch.status.state === "error"
                ? PALETTE.danger
                : PALETTE.muted;
          const handle = ch.status.botUsername ? `${ch.status.botUsername} · ` : "";
          return {
            value: { kind: "manage", channel: ch },
            label: `Manage: ${ch.name}`,
            description: `${ch.platform} · ${handle}in:${ch.status.messagesIn} out:${ch.status.messagesOut}${ch.pairingCode ? ` · /pair ${ch.pairingCode}` : ""}`,
            badge: stBadge,
            badgeColor: stColor,
            active: ch.status.state === "connected",
            keywords: `manage ${ch.id} ${ch.name} ${ch.platform} ${ch.status.botUsername || ""}`,
          };
        }),
      ];

      const res = await this.runSelectModal({
        title: "Connect Channel",
        subtitle: channels.length ? `${liveCount}/${channels.length} live` : "4 platforms",
        placeholder: "Pick a platform (Telegram, Discord, Slack, Webhook)…",
        options,
        footerHints: "↑↓ pick platform · ↵ setup guide · esc close",
      });
      if (res.action !== "select") return;

      const act = res.value;
      if (act.kind === "add-telegram") {
        const form = await this.runFormModal({
          title: "Connect Telegram",
          subtitle: "Bot API",
          steps: [
            "Open `@BotFather` in Telegram and send `/newbot`",
            "Copy the HTTP API token (`123456789:AAH...`)",
            "Paste below and press `Enter` — then send `/pair` to unlock",
          ],
          callout: "Runs via local long-polling — no public URL or ngrok needed.",
          fields: [
            {
              id: "token",
              label: "Bot Token",
              placeholder: "123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
              secret: true,
              validate: (v) =>
                !v.includes(":") || v.length < 20
                  ? "Enter a valid Telegram token from @BotFather (e.g. 123456:AAH...)."
                  : null,
            },
          ],
        });
        if (form.action !== "submit") continue; // Esc returns smoothly to platform list
        await this.connectNewChannelFromTui({
          platform: "telegram",
          token: form.values.token,
          name: "Telegram Bot",
        });
        return;
      }

      if (act.kind === "add-discord") {
        const form = await this.runFormModal({
          title: "Connect Discord",
          subtitle: "Gateway v10",
          steps: [
            "Open `discord.com/developers/applications` → New App → `Bot`",
            "Click `Reset Token` & enable `Message Content Intent`",
            "Paste token below and press `Enter` — then DM `/pair` to bot",
          ],
          callout: "Invite bot to your server or DM it directly. DMs work even without Message Content Intent.",
          fields: [
            {
              id: "token",
              label: "Bot Token",
              placeholder: "Paste Discord Bot Token…",
              secret: true,
              validate: (v) => (v.length < 24 ? "Discord Bot token looks too short." : null),
            },
          ],
        });
        if (form.action !== "submit") continue;
        await this.connectNewChannelFromTui({
          platform: "discord",
          token: form.values.token,
          name: "Discord Bot",
        });
        return;
      }

      if (act.kind === "add-slack") {
        const form = await this.runFormModal({
          title: "Connect Slack",
          subtitle: "Socket Mode",
          steps: [
            "In `api.slack.com/apps`, enable `Socket Mode` & create `xapp-...` token",
            "Add `chat:write`, `im:history`, `app_mentions:read` → install for `xoxb-...`",
            "Paste both tokens below (`Tab` / `Enter` between fields)",
          ],
          callout: "Subscribe to `message.im` & `app_mention` under Event Subscriptions.",
          fields: [
            {
              id: "token",
              label: "Bot Token (xoxb-…)",
              placeholder: "xoxb-...",
              secret: true,
              validate: (v) => (!v.startsWith("xoxb-") ? "Bot Token must start with xoxb-." : null),
            },
            {
              id: "appToken",
              label: "App-Level Token (xapp-…)",
              placeholder: "xapp-...",
              secret: true,
              validate: (v) => (!v.startsWith("xapp-") ? "App-Level Token must start with xapp-." : null),
            },
          ],
        });
        if (form.action !== "submit") continue;
        await this.connectNewChannelFromTui({
          platform: "slack",
          token: form.values.token,
          appToken: form.values.appToken,
          name: "Slack Bot",
        });
        return;
      }

      if (act.kind === "add-webhook") {
        const form = await this.runFormModal({
          title: "Connect Webhook Bridge",
          subtitle: "HTTP POST",
          steps: [
            "Press `Enter` to spin up a local `/api/channels/webhook/<id>` bridge",
            "Send `POST` JSON `{\"text\":\"...\"}` with `Authorization: Bearer <secret>`",
            "Works with WhatsApp bridges, Matrix, n8n, iOS Shortcuts, or curl",
          ],
          callout: "Leave fields blank to auto-name and auto-generate a strong Bearer secret.",
          fields: [
            {
              id: "name",
              label: "Bridge Name (optional)",
              placeholder: "Webhook Bridge (press Enter to skip)",
            },
            {
              id: "token",
              label: "Custom Bearer Secret (optional)",
              placeholder: "Leave blank to auto-generate",
              secret: true,
            },
          ],
        });
        if (form.action !== "submit") continue;
        await this.connectNewChannelFromTui({
          platform: "webhook",
          name: form.values.name || "Webhook Bridge",
          token: form.values.token || undefined,
        });
        return;
      }

      if (act.kind === "manage" && act.channel) {
        const didAction = await this.openChannelActionModal(act.channel);
        if (didAction) return;
      }
    }
  }

  private async connectNewChannelFromTui(input: {
    platform: "telegram" | "discord" | "slack" | "webhook";
    token?: string;
    appToken?: string;
    name: string;
  }): Promise<void> {
    const created = this.engine.channels.upsertChannel({
      platform: input.platform,
      token: input.token,
      appToken: input.appToken,
      name: input.name,
      autoStart: true,
    });
    const rawCfg = this.engine.channels.getConfig(created.id);

    this.spinner.start(`Connecting ${input.platform} bot…`);
    try {
      const live = await this.engine.channels.startChannel(created.id);
      this.spinner.stop(true);
      // Auto-label with real bot handle when using default placeholder name
      if (
        rawCfg &&
        live.status.botUsername &&
        live.platform !== "webhook" &&
        rawCfg.name.toLowerCase() === `${live.platform} bot`
      ) {
        rawCfg.name = `${live.platform[0].toUpperCase()}${live.platform.slice(1)} (${live.status.botUsername})`;
        this.engine.channels.upsertChannel({ id: rawCfg.id, platform: rawCfg.platform, name: rawCfg.name });
      }
      process.stdout.write(
        renderChannelConnectedCard(
          this.engine.channels.toPublicView(this.engine.channels.getConfig(live.id)!),
          this.daemon.url,
          live.platform === "webhook" ? rawCfg?.token : undefined,
        ),
      );
    } catch (err) {
      this.spinner.stop(true);
      process.stdout.write(
        `\n  ${c(PALETTE.danger + PALETTE.bold, "✗ Connection failed:")} ${c(PALETTE.text, err instanceof Error ? err.message : String(err))}\n`,
      );
    }
  }

  private async openChannelActionModal(ch: ChannelPublicView): Promise<boolean> {
    const isLive = ch.status.state === "connected";
    const options: SelectOption<string>[] = [
      {
        value: isLive ? "stop" : "start",
        label: isLive ? "Stop / Disconnect Bot" : "Start / Reconnect Bot",
        description: isLive ? "Close live polling/WebSocket connection" : "Connect to platform immediately",
        badge: isLive ? "stop" : "start",
        badgeColor: isLive ? PALETTE.warning : PALETTE.success,
      },
      {
        value: "pair",
        label: "Generate New One-Time Pairing Code",
        description: ch.pairingCode ? `Current: /pair ${ch.pairingCode}` : "Let a user self-authorize via /pair <CODE>",
        badge: "pair",
        badgeColor: PALETTE.accent,
      },
      {
        value: "allow-user",
        label: "+ Allow User ID…",
        description: `Allowed users: ${ch.allowedUsers.length ? ch.allowedUsers.join(", ") : "(none)"}`,
        badge: "allow",
        badgeColor: PALETTE.success,
      },
      {
        value: "allow-chat",
        label: "+ Allow Chat / Channel ID…",
        description: `Allowed chats: ${ch.allowedChats.length ? ch.allowedChats.join(", ") : "(none)"}`,
        badge: "chat",
        badgeColor: PALETTE.info,
      },
      {
        value: "toggle-all",
        label: ch.allowAll ? "Disable Allow-All (Enforce Allowlist)" : "Enable Allow-All (Not Recommended)",
        description: ch.allowAll ? "Currently anyone who finds the bot can prompt YEDOGU" : "Currently deny-by-default (safe)",
        badge: ch.allowAll ? "open" : "locked",
        badgeColor: ch.allowAll ? PALETTE.danger : PALETTE.success,
      },
      {
        value: "delete",
        label: "Delete Channel",
        description: "Disconnect and remove saved bot token from config",
        badge: "rm",
        badgeColor: PALETTE.danger,
      },
    ];

    const res = await this.runSelectModal({
      title: `${ch.name} (${ch.platform})`,
      subtitle: ch.status.botUsername || ch.id,
      searchable: false,
      options,
      footerHints: "↑↓ move · ↵ run · esc back",
    });
    if (res.action !== "select") return false;

    if (res.value === "start") {
      this.spinner.start(`Connecting ${ch.name}…`);
      try {
        const live = await this.engine.channels.startChannel(ch.id);
        this.spinner.stop(true);
        process.stdout.write(
          `\n  ${c(PALETTE.success, "✓")} Connected ${c(PALETTE.text + PALETTE.bold, live.name)} ${c(PALETTE.info, live.status.botUsername || "")}\n`,
        );
      } catch (err) {
        this.spinner.stop(true);
        process.stdout.write(
          `\n  ${c(PALETTE.danger, "✗")} ${c(PALETTE.text, err instanceof Error ? err.message : String(err))}\n`,
        );
      }
    } else if (res.value === "stop") {
      await this.engine.channels.stopChannel(ch.id);
      process.stdout.write(`\n  ${c(PALETTE.warning, "●")} Stopped channel ${c(PALETTE.text, ch.name)}\n`);
    } else if (res.value === "pair") {
      const code = this.engine.channels.rotatePairingCode(ch.id);
      process.stdout.write(
        `\n  ${c(PALETTE.success, "✓")} New pairing code for ${c(PALETTE.text + PALETTE.bold, ch.name)}: text ${c(PALETTE.accent + PALETTE.bold, `/pair ${code}`)} to your bot.\n`,
      );
    } else if (res.value === "allow-user") {
      const inp = await this.runInputModal({
        title: "Allow Sender User ID",
        subtitle: ch.platform,
        placeholder: "Numeric Telegram/Discord user ID or Slack member ID",
        validate: (v) => (v.length < 1 ? "Enter a user ID." : null),
      });
      if (inp.action === "submit") {
        this.engine.channels.updateAccessControl(ch.id, { addUser: inp.value });
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Authorized user ${c(PALETTE.info, inp.value)} on ${ch.name}\n`);
      }
    } else if (res.value === "allow-chat") {
      const inp = await this.runInputModal({
        title: "Allow Chat / Channel ID",
        subtitle: ch.platform,
        placeholder: "Chat or Channel ID",
        validate: (v) => (v.length < 1 ? "Enter a chat/channel ID." : null),
      });
      if (inp.action === "submit") {
        this.engine.channels.updateAccessControl(ch.id, { addChat: inp.value });
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Authorized chat ${c(PALETTE.info, inp.value)} on ${ch.name}\n`);
      }
    } else if (res.value === "toggle-all") {
      const next = !ch.allowAll;
      this.engine.channels.updateAccessControl(ch.id, { allowAll: next });
      process.stdout.write(
        `\n  ${c(next ? PALETTE.warning : PALETTE.success, "✓")} Allow-All ${next ? "ENABLED (anyone can text this bot)" : "DISABLED (allowlist enforced)"} on ${ch.name}\n`,
      );
    } else if (res.value === "delete") {
      const conf = await this.runConfirmModal({
        title: "Delete Channel",
        message: `Disconnect and delete "${ch.name}" (${ch.platform})?`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (conf.confirmed) {
        await this.engine.channels.deleteChannel(ch.id);
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Deleted channel ${c(PALETTE.text, ch.name)}\n`);
      }
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLASH COMMAND DISPATCHER (Interactive Pop-Ups in TTY + Clean CLI Fallbacks)
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleSlashCommand(line: string): Promise<boolean> {
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const rest = line.slice(cmd.length).trim();

    switch (cmd) {
      case "/browser":
      case "/web": {
        const targetUrl = `${this.daemon.url}/?session=${encodeURIComponent(this.engine.session.id)}`;
        const res = openInBrowser(targetUrl);
        process.stdout.write(
          `\n  ${c(PALETTE.success, "✓")} ${c(PALETTE.text + PALETTE.bold, "WebTUI Browser War-Room")} ${c(PALETTE.info, targetUrl)}\n` +
            `    ${c(PALETTE.muted, res.launched ? `Opened via ${res.method} · live SSE synced with this session.` : `Open the URL above manually (${res.error}).`)}\n`,
        );
        return true;
      }

      case "/channels":
      case "/channel":
      case "/bot":
      case "/bots": {
        if (args.length === 0) {
          if (process.stdout.isTTY) {
            await this.openChannelsManager();
          } else {
            process.stdout.write(renderChannelsTable(this.engine.channels.getPublicViews(), this.daemon.url));
          }
          return true;
        }

        const sub = args[0].toLowerCase();
        if (sub === "list") {
          process.stdout.write(renderChannelsTable(this.engine.channels.getPublicViews(), this.daemon.url));
          return true;
        }
        if (sub === "add") {
          const platform = (args[1] || "").toLowerCase() as "telegram" | "discord" | "slack" | "webhook";
          if (!["telegram", "discord", "slack", "webhook"].includes(platform)) {
            process.stdout.write(
              `\n  ${c(PALETTE.secondary, "Usage:")}\n` +
                `    ${c(PALETTE.text, "/channels add telegram <botToken> [name]")}\n` +
                `    ${c(PALETTE.text, "/channels add discord <botToken> [name]")}\n` +
                `    ${c(PALETTE.text, "/channels add slack <xoxb-token> <xapp-token> [name]")}\n` +
                `    ${c(PALETTE.text, "/channels add webhook [name] [secret]")}\n`,
            );
            return true;
          }
          if (platform === "slack") {
            const botToken = args[2];
            const appToken = args[3];
            const name = args.slice(4).join(" ") || "Slack Bot";
            if (!botToken || !appToken) {
              process.stdout.write(`\n  ${c(PALETTE.secondary, "Usage:")} ${c(PALETTE.text, "/channels add slack <xoxb-token> <xapp-token> [name]")}\n`);
              return true;
            }
            await this.connectNewChannelFromTui({ platform: "slack", token: botToken, appToken, name });
            return true;
          }
          if (platform === "webhook") {
            const name = args[2] || "Webhook Bridge";
            const secret = args[3];
            await this.connectNewChannelFromTui({ platform: "webhook", name, token: secret });
            return true;
          }
          const token = args[2];
          const name = args.slice(3).join(" ") || `${platform[0].toUpperCase()}${platform.slice(1)} Bot`;
          if (!token) {
            process.stdout.write(`\n  ${c(PALETTE.secondary, "Usage:")} ${c(PALETTE.text, `/channels add ${platform} <botToken> [name]`)}\n`);
            return true;
          }
          await this.connectNewChannelFromTui({ platform, token, name });
          return true;
        }
        if (sub === "start" && args[1]) {
          this.spinner.start(`Connecting channel ${args[1]}…`);
          const live = await this.engine.channels.startChannel(args[1]);
          this.spinner.stop(true);
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Connected ${c(PALETTE.text + PALETTE.bold, live.name)} ${c(PALETTE.info, live.status.botUsername || "")}\n`);
          return true;
        }
        if (sub === "stop" && args[1]) {
          const stopped = await this.engine.channels.stopChannel(args[1]);
          if (!stopped) throw new Error(`Channel not found: ${args[1]}`);
          process.stdout.write(`\n  ${c(PALETTE.warning, "●")} Stopped channel ${c(PALETTE.text, stopped.name)}\n`);
          return true;
        }
        if ((sub === "rm" || sub === "delete" || sub === "remove") && args[1]) {
          const ok = await this.engine.channels.deleteChannel(args[1]);
          process.stdout.write(
            ok
              ? `\n  ${c(PALETTE.success, "✓")} Deleted channel ${c(PALETTE.text, args[1])}\n`
              : `\n  ${c(PALETTE.warning, "!")} Channel not found: ${args[1]}\n`,
          );
          return true;
        }
        if (sub === "pair" && args[1]) {
          const code = this.engine.channels.rotatePairingCode(args[1]);
          process.stdout.write(
            `\n  ${c(PALETTE.success, "✓")} Pairing code for ${c(PALETTE.info, args[1])}: text ${c(PALETTE.accent + PALETTE.bold, `/pair ${code}`)} to your bot.\n`,
          );
          return true;
        }
        if (sub === "allow" && args[1] && args[2]) {
          this.engine.channels.updateAccessControl(args[1], { addUser: args[2] });
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Authorized user ${c(PALETTE.info, args[2])} on channel ${args[1]}\n`);
          return true;
        }
        if (sub === "allow-chat" && args[1] && args[2]) {
          this.engine.channels.updateAccessControl(args[1], { addChat: args[2] });
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Authorized chat ${c(PALETTE.info, args[2])} on channel ${args[1]}\n`);
          return true;
        }

        process.stdout.write(renderChannelsTable(this.engine.channels.getPublicViews(), this.daemon.url));
        return true;
      }

      case "/help":
        process.stdout.write(renderHelpText());
        return true;

      case "/theme":
      case "/themes": {
        if (args.length === 0 && process.stdout.isTTY) {
          await this.openThemePicker();
          return true;
        }
        if (args.length === 0) {
          const w = termWidth(76, 56);
          process.stdout.write(`\n  ${c(PALETTE.text + PALETTE.bold, "Themes")}\n  ${rule(w)}\n`);
          for (const t of listThemes()) {
            const cur = t.id === getActiveTheme().id ? c(PALETTE.accent, "●") : c(PALETTE.border, "○");
            process.stdout.write(
              `  ${cur} ${padVisible(c(PALETTE.text + PALETTE.bold, t.id), 14)} ${renderThemeSwatch(t)}  ${c(PALETTE.muted, t.vibe)}\n`,
            );
          }
          return true;
        }
        this.applyThemeAndRedraw(args[0]);
        return true;
      }

      case "/agent":
      case "/agents": {
        if (args.length === 0) {
          if (process.stdout.isTTY) {
            await this.openAgentPicker();
          } else {
            process.stdout.write(renderAgentsTable(this.engine.getAgents(), this.engine.session));
          }
          return true;
        }
        const switched = this.engine.setActiveAgent(args[0]);
        process.stdout.write(
          `\n  ${c(PALETTE.success, "✓")} Switched agent to ${c(PALETTE.accent + PALETTE.bold, `@${switched.id}`)} ${c(PALETTE.muted, `· ${switched.title}`)}\n`,
        );
        return true;
      }

      case "/providers":
      case "/provider": {
        if (process.stdout.isTTY) {
          await this.openProviderManager();
        } else {
          process.stdout.write(renderProvidersTable(this.engine.getProviders()));
        }
        return true;
      }

      case "/login":
      case "/connect": {
        const aliasMap: Record<string, string> = {
          google: "gemini",
          agy: "gemini",
          antigravity: "gemini",
          claude: "anthropic",
          chatgpt: "codex",
        };
        const rawTarget = args[0]?.toLowerCase();
        const targetId = rawTarget ? aliasMap[rawTarget] || rawTarget : undefined;

        if (args.length === 0 && process.stdout.isTTY) {
          await this.openProviderManager();
          return true;
        }
        if (args.length === 1 && targetId && process.stdout.isTTY) {
          const prov = this.engine.getProviders().find((p) => p.id === targetId);
          if (prov) {
            await this.openConnectKeyModal(prov);
            return true;
          }
        }
        if (args.length < 2) {
          process.stdout.write(
            `\n  ${c(PALETTE.secondary, "Usage:")} ${c(PALETTE.text, "/login [gemini|codex|claude]")}  ${c(PALETTE.muted, "or")}  ${c(PALETTE.text, "/connect <provider> <apiKey> [baseUrl]")}\n` +
              `  ${c(PALETTE.muted, "Tip: Run /login or /connect with no args for the interactive auth pop-up.")}\n`,
          );
          return true;
        }
        const [, apiKey, baseUrl] = args;
        const p = this.engine.connectProvider(targetId || args[0], apiKey, baseUrl);
        await this.syncAndPrintConnectedProvider(p);
        return true;
      }

      case "/disconnect":
      case "/logout": {
        const aliasMap: Record<string, string> = {
          google: "gemini",
          agy: "gemini",
          antigravity: "gemini",
          claude: "anthropic",
          chatgpt: "codex",
        };
        const rawTarget = args[0]?.toLowerCase();
        const targetId = rawTarget ? aliasMap[rawTarget] || rawTarget : undefined;
        if (!targetId) {
          if (process.stdout.isTTY) {
            await this.openProviderManager();
            return true;
          }
          process.stdout.write(
            `\n  ${c(PALETTE.secondary, "Usage:")} ${c(PALETTE.text, "/disconnect <provider>")}\n`,
          );
          return true;
        }
        const prov = this.engine.getProviders().find((p) => p.id === targetId);
        if (!prov) {
          process.stdout.write(`\n  ${c(PALETTE.danger, "✗")} Unknown provider "${targetId}".\n`);
          return true;
        }
        const isCliAuth =
          prov.authSource === "codex-cli" ||
          prov.authSource === "claude-cli";
        const res = this.engine.disconnectProvider(targetId, { removeCliAuth: isCliAuth });
        if (res.stillConnectedViaEnv) {
          process.stdout.write(
            `\n  ${c(PALETTE.warning, "!")} Cleared saved credentials for ${c(PALETTE.text + PALETTE.bold, prov.name)}, but ${c(PALETTE.info, prov.envKeys[0] || "an env var")} is still set in your shell.\n`,
          );
        } else if (res.removedConfig || res.removedCliAuth) {
          process.stdout.write(
            `\n  ${c(PALETTE.success, "✓")} Disconnected ${c(PALETTE.text + PALETTE.bold, prov.name)} ${c(PALETTE.muted, `(${prov.id})`)} — credentials deleted.\n`,
          );
        } else {
          process.stdout.write(
            `\n  ${c(PALETTE.muted, "·")} ${prov.name} (${prov.id}) has no saved credentials to delete.\n`,
          );
        }
        return true;
      }

      case "/model":
      case "/models": {
        if (args[0]?.toLowerCase() === "refresh") {
          const connected = this.engine.getConnectedProviders();
          if (connected.length === 0) {
            process.stdout.write(
              `\n  ${c(PALETTE.warning, "!")} No connected providers to refresh. Run ${c(PALETTE.text, "/login")} or ${c(PALETTE.text, "/connect")}.\n`,
            );
            return true;
          }
          const spin = new TerminalSpinner();
          spin.start("Refreshing live models from connected providers");
          let results: Array<{ providerId: string; count: number; live: boolean; error?: string }> = [];
          try {
            results = await this.engine.refreshProviderModels();
          } finally {
            spin.stop();
          }
          process.stdout.write("\n");
          for (const r of results) {
            const tag = r.live
              ? c(PALETTE.success, `${r.count} live models`)
              : c(PALETTE.muted, `${r.count} curated${r.error ? ` (${r.error})` : ""}`);
            process.stdout.write(`  ${c(PALETTE.success, "●")} ${padVisible(c(PALETTE.text + PALETTE.bold, r.providerId), 13)}${tag}\n`);
          }
          return true;
        }

        if (args.length === 0) {
          if (process.stdout.isTTY) {
            await this.openModelPicker();
            return true;
          }
          const connected = this.engine.getConnectedProviders();
          const w = termWidth(84, 62);
          process.stdout.write(`\n  ${c(PALETTE.text + PALETTE.bold, "Connected Models")}\n  ${rule(w)}\n`);
          if (connected.length === 0) {
            process.stdout.write(
              `  ${c(PALETTE.warning, "!")} No providers connected yet. Run ${c(PALETTE.text, "/login")} or ${c(PALETTE.text, "/connect <provider> <key>")}.\n`,
            );
          } else {
            for (const p of connected) {
              process.stdout.write(
                `  ${c(PALETTE.success, "●")} ${padVisible(c(PALETTE.text + PALETTE.bold, p.id), 13)}${c(PALETTE.secondary, p.models.map((m) => `${p.id}/${m.id}`).join(", "))}\n`,
              );
            }
          }
          process.stdout.write(
            `  ${rule(w)}\n  ${c(PALETTE.muted, "Active:")} ${c(PALETTE.text, this.engine.session.activeModel)}   ${c(PALETTE.muted, "Usage:")} ${c(PALETTE.secondary, "/model <provider/model> [--agent <id>] | /model refresh")}\n`,
          );
          return true;
        }

        const agentFlagIdx = args.indexOf("--agent");
        let forAgent: string | undefined;
        const modelSpec = args[0];
        if (agentFlagIdx !== -1 && args[agentFlagIdx + 1]) {
          forAgent = args[agentFlagIdx + 1];
        }
        const normalized = this.engine.setModel(modelSpec, forAgent);
        process.stdout.write(
          `\n  ${c(PALETTE.success, "✓")} ${forAgent ? `Pinned ${c(PALETTE.accent, `@${forAgent.replace(/^@/, "")}`)}` : "Default model"} → ${c(PALETTE.text + PALETTE.bold, normalized)}\n`,
        );
        return true;
      }

      case "/scope": {
        if (args.length === 0 && process.stdout.isTTY) {
          await this.openScopeManager();
          return true;
        }
        const sub = (args[0] || "list").toLowerCase();
        if (sub === "enforced" || sub === "advisory") {
          this.engine.updateScope({ mode: sub });
          process.stdout.write(
            `\n  ${c(PALETTE.success, "✓")} Scope mode set to ${c(sub === "enforced" ? PALETTE.success + PALETTE.bold : PALETTE.warning + PALETTE.bold, sub)}\n`,
          );
          return true;
        }
        if (sub === "add" && args[1]) {
          this.engine.addScopeRule("allow", args[1]);
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Added allow rule: ${c(PALETTE.text, args[1])}\n`);
          return true;
        }
        if (sub === "deny" && args[1]) {
          this.engine.addScopeRule("deny", args[1]);
          process.stdout.write(`\n  ${c(PALETTE.danger, "✓")} Added deny rule: ${c(PALETTE.text, args[1])}\n`);
          return true;
        }
        if ((sub === "rm" || sub === "remove") && args[1]) {
          this.engine.removeScopeRule("allow", args[1]);
          this.engine.removeScopeRule("deny", args[1]);
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Removed scope rule: ${c(PALETTE.text, args[1])}\n`);
          return true;
        }
        process.stdout.write(renderScopeTerminal(this.engine.session.scope));
        return true;
      }

      case "/re": {
        if (!rest) {
          process.stdout.write(`\n  ${c(PALETTE.secondary, "Usage:")} ${c(PALETTE.text, "/re <path-to-exe|elf|apk|ipa|asar>")}\n`);
          return true;
        }
        const art = this.engine.runDirectBinaryTriage(rest.replace(/^["']|["']$/g, ""));
        process.stdout.write(renderBinaryTriageTerminal(art));
        return true;
      }

      case "/js": {
        const target = rest ? rest.replace(/^["']|["']$/g, "") : this.engine.session.workspace;
        const res = this.engine.runDirectJsRecon(target);
        process.stdout.write(renderJsReconTerminal(res, target));
        return true;
      }

      case "/http": {
        if (args.length < 1) {
          process.stdout.write(`\n  ${c(PALETTE.secondary, "Usage:")} ${c(PALETTE.text, "/http [METHOD] <URL>")}\n`);
          return true;
        }
        const method = args.length >= 2 ? args[0].toUpperCase() : "GET";
        const url = args.length >= 2 ? args[1] : args[0];
        this.spinner.start(`${method} ${truncatePlain(url, 48)}…`);
        const { capture, blockedReason } = await this.engine.runDirectHttp({ method, url });
        this.spinner.stop(true);
        process.stdout.write(renderHttpCaptureTerminal(capture, blockedReason));
        return true;
      }

      case "/swarm": {
        if (!rest) {
          process.stdout.write(`\n  ${c(PALETTE.secondary, "Usage:")} ${c(PALETTE.text, "/swarm <security objective or target>")}\n`);
          return true;
        }
        process.stdout.write("\n");
        this.spinner.start("Running parallel swarm…", "@recon · @web-hunter · @reverser");
        const summary = await this.engine.runSwarm([
          { agent: "recon", objective: `Recon & Attack Surface Mapping: ${rest}` },
          { agent: "web-hunter", objective: `Web/API Vulnerability Analysis: ${rest}` },
          { agent: "reverser", objective: `Artifact/Code Reverse Engineering & Triage: ${rest}` },
        ]);
        this.spinner.stop(true);
        process.stdout.write(`  ${c(PALETTE.accent, "✦")} ${c(PALETTE.text + PALETTE.bold, "Swarm Summary")}\n\n`);
        this.markdown.reset();
        this.markdown.push(summary);
        this.markdown.flush();
        return true;
      }

      case "/findings":
        if (process.stdout.isTTY && this.engine.session.findings.length > 0) {
          await this.openFindingsPicker();
        } else {
          process.stdout.write(renderFindingsTerminal(this.engine.session.findings));
        }
        return true;

      case "/report": {
        if (args.length === 0 && process.stdout.isTTY) {
          await this.openReportPicker();
          return true;
        }
        const fmt = (args[0] as "redteam" | "hackerone" | "bugcrowd") || "redteam";
        const md = this.engine.getReport(fmt);
        if (args[1]) {
          const outPath = path.resolve(this.engine.session.workspace, args[1]);
          fs.writeFileSync(outPath, md, "utf8");
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Saved sanitized ${fmt} report to ${c(PALETTE.info, outPath)}\n`);
        } else {
          process.stdout.write("\n");
          this.markdown.reset();
          this.markdown.push(md);
          this.markdown.flush();
        }
        return true;
      }

      case "/mcp": {
        const sub = (args[0] || "list").toLowerCase();
        if (sub === "connect" && args[1]) {
          process.stdout.write("\n");
          this.spinner.start(`Connecting MCP server "${args[1]}"…`);
          const tools = await this.engine.connectMcpServer(args[1]);
          this.spinner.stop(true);
          process.stdout.write(`  ${c(PALETTE.success, "✓")} Connected ${c(PALETTE.text + PALETTE.bold, args[1])} ${c(PALETTE.muted, `(${tools.length} tools via mcp_call)`)}\n`);
          return true;
        }
        if (sub === "add" && args.length >= 3) {
          this.engine.addMcpServer({
            name: args[1],
            command: args[2],
            args: args.slice(3),
            enabled: false,
          });
          process.stdout.write(
            `\n  ${c(PALETTE.success, "✓")} Added MCP server ${c(PALETTE.text + PALETTE.bold, args[1])}. Run ${c(PALETTE.info, `/mcp connect ${args[1]}`)} to connect.\n`,
          );
          return true;
        }
        const list = this.engine.mcpManager.listConfigured(this.engine.config.mcpServers);
        const w = termWidth(80, 62);
        process.stdout.write(`\n  ${c(PALETTE.text + PALETTE.bold, "MCP Servers")}\n  ${rule(w)}\n`);
        for (const m of list) {
          const st = m.connected
            ? c(PALETTE.success, `● connected (${m.toolCount} tools)`)
            : c(PALETTE.muted, "○ disconnected");
          process.stdout.write(
            `  ${padVisible(c(PALETTE.text + PALETTE.bold, m.name), 14)} ${padVisible(st, 24)} ${c(PALETTE.muted, `${m.command} ${m.args.join(" ")}`)}\n`,
          );
        }
        process.stdout.write(`  ${rule(w)}\n  ${c(PALETTE.muted, "/mcp connect rea  |  /mcp add <name> <command> [args...]")}\n`);
        return true;
      }

      case "/sessions": {
        if (process.stdout.isTTY) {
          await this.openSessionPicker();
          return true;
        }
        const list = listSessions().slice(0, 15);
        const w = termWidth(80, 62);
        process.stdout.write(`\n  ${c(PALETTE.text + PALETTE.bold, "Recent Sessions")}\n  ${rule(w)}\n`);
        for (const s of list) {
          const cur = s.id === this.engine.session.id ? c(PALETTE.accent, "●") : c(PALETTE.border, "○");
          process.stdout.write(
            `  ${cur} ${padVisible(c(PALETTE.info, s.id), 18)} ${padVisible(c(PALETTE.text, truncatePlain(s.name, 22)), 24)} ${c(PALETTE.muted, `${s.messagesCount} msgs · ${s.findingsCount} findings`)}\n`,
          );
        }
        return true;
      }

      case "/new":
        this.engine.newSession(rest || undefined);
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Started new session ${c(PALETTE.info, this.engine.session.id)}\n`);
        return true;

      case "/compact":
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} ${c(PALETTE.secondary, this.engine.compactSession())}\n`);
        return true;

      case "/clear":
        this.engine.clearMessages();
        console.clear();
        process.stdout.write(
          renderBanner(
            this.engine.session,
            this.engine.getAgent(),
            this.engine.getProviders(),
            this.daemon.url,
            this.engine.channels.getPublicViews(),
          ),
        );
        return true;

      case "/status": {
        const s = this.engine.session;
        process.stdout.write(
          renderStatusTerminal(
            s,
            this.engine.getEffectiveModelForAgent(s.activeAgent),
            this.daemon.url,
          ),
        );
        return true;
      }

      case "/exit":
      case "/quit":
        return false;

      default: {
        const suggestion = suggestCommand(cmd);
        const hint = suggestion
          ? ` Did you mean ${c(PALETTE.text, suggestion)}?`
          : ` Press ${c(PALETTE.text, "Ctrl+K")} for Command Palette or type ${c(PALETTE.text, "/help")}.`;
        process.stdout.write(`\n  ${c(PALETTE.warning, "!")} Unknown command ${c(PALETTE.text, cmd)}.${c(PALETTE.secondary, hint)}\n`);
        return true;
      }
    }
  }

  private async shutdown(): Promise<void> {
    this.activeModal?.close();
    this.clearDecorations();
    this.spinner.stop(true);
    process.stdout.write(c(PALETTE.muted, "\n  Shutting down YEDOGU…\n"));
    this.rl?.close();
    await this.engine.channels.stopAll();
    this.engine.mcpManager.shutdown();
    await this.daemon.stop();
    process.exit(0);
  }
}
