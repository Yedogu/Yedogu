import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { PassThrough } from "node:stream";
import type { YedoguEngine } from "../agents/orchestrator.js";
import type { YedoguDaemon } from "../server/daemon.js";
import { openInBrowser } from "../server/openBrowser.js";
import { listSessions } from "../config/store.js";
import { executeShell } from "../tools/pty.js";
import { fsGlob } from "../tools/fsOps.js";
import { formatFriendlyError } from "../providers/errors.js";
import {
  formatModelDisplayName,
  groupModelsForPicker,
  inferReasoningLevels,
  isProviderConnected,
  probeAgyModels,
  probeCustomEndpointModels,
  type GroupedModelEntry,
} from "../providers/registry.js";
import type { ChannelPublicView, ChatMessage, HarnessEvent, ProviderConfig, ProviderProtocol, ReasoningEffort } from "../types.js";
import {
  PALETTE,
  SYNC_END,
  SYNC_START,
  c,
  clipVisible,
  formatTokens,
  getActiveTheme,
  listThemes,
  osc52Copy,
  padVisible,
  renderThemeSwatch,
  renderYedoguLogo,
  rule,
  setActiveTheme,
  shortenPath,
  stripAnsi,
  termWidth,
  truncatePlain,
  visibleLength,
} from "./theme.js";
import { LeaderKeyController, type KeybindActionId } from "./keybinds.js";
import {
  TerminalScreen,
  compositeOverlay,
  extractAndStripMouseSequences,
  paintSurfaceLine,
  renderOpenCodeModal,
  renderOpenCodePromptBox,
  renderScrollbarColumn,
  takeVisiblePrefix,
  takeVisibleSuffix,
  type OpenCodeModalOption,
  type SgrMouseEvent,
} from "./screen.js";
import { StreamMarkdownWriter } from "./markdown.js";
import { TerminalSpinner } from "./spinner.js";
import {
  SLASH_COMMANDS,
  SlashMenuController,
  filterAgentMentions,
  filterSlashCommands,
  formatSlashCompletion,
} from "./slashMenu.js";
import {
  ConfirmModal,
  FormModal,
  InputModal,
  SelectModal,
  filterSelectOptions,
  type ActiveModal,
  type ConfirmModalConfig,
  type ConfirmOutcome,
  type FormModalConfig,
  type FormOutcome,
  type InputModalConfig,
  type InputOutcome,
  type ModalOutcome,
  type SelectModalConfig,
  type SelectModalPatch,
  type SelectOption,
} from "./popup.js";
import {
  renderDiffView,
  renderTodoListCard,
  renderSidebarPanel,
} from "./components.js";
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

const PLACEHOLDER_TEXT = "Ask anything, / commands, @ file/agent, ! shell, ^P/^K palette…";

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
  private sidebarMode: "auto" | "show" | "hide" = "auto";
  private diffViewMode: "auto" | "unified" | "split" = "auto";
  private undoStack: ChatMessage[][] = [];
  private redoStack: ChatMessage[][] = [];
  private recentModels: string[] = [];
  private cachedWorkspaceFiles: string[] = [];
  private lastFileScanAt = 0;
  private readonly screen = new TerminalScreen();
  private fullScreenActive = false;
  private screenMode: "home" | "session" = "home";
  private inputBuffer = "";
  private inputCursor = 0;
  private inputHistory: string[] = [];
  private historyIndex = -1;
  private historyDraft = "";
  private scrollOffset = 0;
  private transcriptLines: string[] = [""];
  private spinnerLabel = "";
  private spinnerDetail = "";
  private spinnerFrame = 0;
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private popoverIndex = 0;
  private popoverScrollTop = 0;
  private popoverDismissedFor: string | null = null;
  private focusArea: "prompt" | "chat" = "prompt";
  private chatScrollbarGeo: { col: number; topRow: number; height: number; totalLines: number } | null = null;
  private modalScrollbarGeo: {
    col: number;
    topRow: number;
    height: number;
    maxScrollTop: number;
    onScrub: (nextScrollTop: number) => void;
  } | null = null;
  private modalHitGeo: {
    topRow: number;
    leftCol: number;
    width: number;
    height: number;
    optionRows: Map<number, number>;
    onClickOption?: (optionIndex: number) => void;
    onWheel?: (dir: "up" | "down") => void;
    onCancel?: () => void;
  } | null = null;
  private pendingModalClickIndex: number | null = null;
  private draggingScrollbar: "chat" | "modal" | null = null;
  private mouseEnabled = true;
  private textSelection: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
    dragging: boolean;
  } | null = null;
  private lastRenderedRows: string[] = [];
  private statusToast: string | null = null;
  private statusToastTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayRender: (() => {
    lines: string[];
    width: number;
    cursorRow?: number;
    cursorCol?: number;
    scrollbarRowOffset?: number;
    scrollbarHeight?: number;
    maxScrollTop?: number;
    optionRowOffsets?: Array<{ rowOffset: number; optionIndex: number }>;
    onScrub?: (nextScrollTop: number) => void;
    onWheel?: (dir: "up" | "down") => void;
    onClickOption?: (optionIndex: number) => void;
    onCancel?: () => void;
  }) | null = null;
  private overlayKeyHandler: ((str: string, key: readline.Key) => void) | null = null;
  private keypressListener: ((str: string, key: readline.Key) => void) | null = null;
  private mouseDataListener: ((buf: Buffer) => void) | null = null;
  private keyStream: PassThrough | null = null;
  private resizeListener: (() => void) | null = null;
  private readonly spinner = new TerminalSpinner();
  private readonly markdown = new StreamMarkdownWriter((chunk) => {
    if (this.fullScreenActive) this.appendTranscript(chunk);
    else process.stdout.write(chunk);
  });
  private readonly slashMenu = new SlashMenuController();
  private readonly leader = new LeaderKeyController(1500, () => {
    if (this.fullScreenActive) this.render();
    else if (this.promptActive && !this.activeModal) this.drawIdleDecorations();
  });

  constructor(
    private readonly engine: YedoguEngine,
    private readonly daemon: YedoguDaemon,
  ) {
    setActiveTheme(this.engine.config.theme || "yedogu");
    this.recentModels = [this.engine.session.activeModel];
    this.slashMenu.setAgentsProvider(() => {
      const agentItems = this.engine.getAgents().map((a) => ({
        id: a.id,
        title: a.title,
        model: this.engine.getEffectiveModelForAgent(a.id),
        active: this.engine.session.activeAgent === a.id,
        kind: "agent" as const,
      }));
      const files = this.getWorkspaceFiles();
      const fileItems = files.slice(0, 60).map((f) => ({
        id: f,
        title: "workspace file",
        model: "file",
        kind: "file" as const,
      }));
      return [...agentItems, ...fileItems];
    });
    this.loadCommandHistory();
    this.bindEngineEvents();
  }

  private getHistoryFilePath(): string {
    return path.join(os.homedir(), ".yedogu", "history.json");
  }

  private loadCommandHistory(): void {
    try {
      const file = this.getHistoryFilePath();
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (Array.isArray(parsed)) {
          this.inputHistory = parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 200);
        }
      }
    } catch {
      // Ignore corrupt history file
    }
    if (this.inputHistory.length === 0 && this.engine.session.messages.length > 0) {
      const userMsgs = this.engine.session.messages
        .filter((m) => m.role === "user" && m.content.trim().length > 0)
        .map((m) => m.content.trim())
        .reverse();
      for (const msg of userMsgs) {
        if (this.inputHistory[this.inputHistory.length - 1] !== msg) {
          this.inputHistory.push(msg);
        }
        if (this.inputHistory.length >= 200) break;
      }
    }
  }

  private saveCommandHistory(): void {
    try {
      const file = this.getHistoryFilePath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(this.inputHistory.slice(0, 200)), "utf8");
    } catch {
      // Best-effort persistence
    }
  }

  private getWorkspaceFiles(): string[] {
    const now = Date.now();
    if (now - this.lastFileScanAt > 15000 || this.cachedWorkspaceFiles.length === 0) {
      try {
        const raw = fsGlob(this.engine.session.workspace, "", 80);
        this.cachedWorkspaceFiles = raw.startsWith("No files") ? [] : raw.split(/\r?\n/);
      } catch {
        this.cachedWorkspaceFiles = [];
      }
      this.lastFileScanAt = now;
    }
    return this.cachedWorkspaceFiles;
  }

  private appendTranscript(chunk: string): void {
    // Strip non-SGR CSI control sequences (e.g. \x1b[2K, \x1b[1A) so they never pollute frame rows
    const noCtrl = chunk.replace(/\x1b\[[0-9;?]*[A-LN-Za-ln-z]/g, "");
    const parts = noCtrl.split("\n");
    if (this.transcriptLines.length === 0) this.transcriptLines.push("");
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i] ?? "";
      if (seg.includes("\r")) {
        const crParts = seg.split("\r");
        const last = crParts[crParts.length - 1] ?? "";
        if (i === 0) {
          this.transcriptLines[this.transcriptLines.length - 1] = last;
        } else {
          this.transcriptLines.push(last);
        }
      } else {
        if (i === 0) {
          this.transcriptLines[this.transcriptLines.length - 1] += seg;
        } else {
          this.transcriptLines.push(seg);
        }
      }
    }
    if (this.transcriptLines.length > 2000) {
      this.transcriptLines = this.transcriptLines.slice(-2000);
    }
    this.scrollOffset = 0;
  }

  private emitOut(text: string): void {
    if (this.fullScreenActive) {
      this.screenMode = "session";
      this.appendTranscript(text);
      this.render();
    } else {
      process.stdout.write(text);
    }
  }

  private startSpinnerFs(label: string, detail = ""): void {
    if (!this.fullScreenActive) {
      this.spinner.start(label, detail);
      return;
    }
    this.spinnerLabel = label;
    this.spinnerDetail = detail;
    if (!this.spinnerTimer) {
      this.spinnerTimer = setInterval(() => {
        this.spinnerFrame = (this.spinnerFrame + 1) % 10;
        this.render();
      }, 90);
    }
    this.render();
  }

  private stopSpinnerFs(): void {
    if (!this.fullScreenActive) {
      this.spinner.stop(true);
      return;
    }
    this.spinnerLabel = "";
    this.spinnerDetail = "";
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
  }

  private getPopoverState(): {
    mode: "slash" | "mention";
    items: Array<{ label: string; description: string; badge?: string; insert: string; isSlash: boolean; takesArgs?: boolean; interactivePopup?: boolean }>;
  } | null {
    if (!this.fullScreenActive || this.overlayRender || this.historyIndex !== -1) return null;
    if (this.popoverDismissedFor !== null && this.popoverDismissedFor === this.inputBuffer) {
      return null;
    }
    this.popoverDismissedFor = null;

    if (this.inputBuffer.startsWith("/") && !/\s/.test(this.inputBuffer)) {
      const matches = filterSlashCommands(this.inputBuffer) ?? [];
      return {
        mode: "slash",
        items: matches.map((s) => ({
          label: s.name,
          description: s.description,
          badge: s.interactivePopup ? "⊞" : s.category,
          insert: formatSlashCompletion(s),
          isSlash: true,
          takesArgs: s.takesArgs,
          interactivePopup: s.interactivePopup,
        })),
      };
    }

    if (this.inputBuffer.startsWith("@") && !/\s/.test(this.inputBuffer)) {
      const agents = this.engine.getAgents().map((a) => ({
        id: a.id,
        title: a.title,
        model: this.engine.getEffectiveModelForAgent(a.id),
        active: this.engine.session.activeAgent === a.id,
        kind: "agent" as const,
      }));
      const files = this.getWorkspaceFiles().slice(0, 60).map((f) => ({
        id: f,
        title: "file",
        model: "file",
        kind: "file" as const,
      }));
      const matches = filterAgentMentions(this.inputBuffer, [...agents, ...files]) ?? [];
      return {
        mode: "mention",
        items: matches.map((m) => ({
          label: `@${m.id}`,
          description: m.kind === "file" ? "workspace file" : m.title,
          badge: m.kind === "file" ? "file" : truncatePlain(m.model, 20),
          insert: `@${m.id} `,
          isSlash: false,
        })),
      };
    }
    return null;
  }

  public render(): void {
    if (!this.fullScreenActive) return;
    const { cols, rows } = this.screen.size;
    const baseRows = new Array<string>(rows).fill("");
    const activeAgent = this.engine.getAgent();
    const effectiveModel = this.engine.getEffectiveModelForAgent(activeAgent.id);
    const [provId, ...modelRest] = effectiveModel.split("/");
    const modelId = modelRest.join("/") || effectiveModel;
    const provObj = this.engine.getProviders().find((p) => p.id === provId);
    const provModel = provObj?.models.find((m) => m.id === modelId);
    const modelDisplay = formatModelDisplayName(effectiveModel, provModel?.name);
    const providerDisplay = provObj?.name || provId || "Provider";
    const shellMode = this.inputBuffer.startsWith("!");

    const popover = this.getPopoverState();
    let cursor: { row: number; col: number } | undefined;
    this.chatScrollbarGeo = null;
    this.modalScrollbarGeo = null;
    this.modalHitGeo = null;

    const applyPopoverSelection = (pop: NonNullable<ReturnType<YedoguTui["getPopoverState"]>>, idx: number) => {
      const chosen = pop.items[Math.max(0, Math.min(idx, pop.items.length - 1))];
      if (!chosen) return;
      if (!chosen.isSlash) {
        this.inputBuffer = chosen.insert;
        this.inputCursor = this.inputBuffer.length;
        this.popoverDismissedFor = this.inputBuffer;
        this.render();
        return;
      }
      if (chosen.takesArgs && !chosen.interactivePopup && this.inputBuffer !== chosen.label) {
        this.inputBuffer = `${chosen.label} `;
        this.inputCursor = this.inputBuffer.length;
        this.render();
        return;
      }
      this.inputBuffer = "";
      this.inputCursor = 0;
      this.popoverIndex = 0;
      this.popoverScrollTop = 0;
      this.popoverDismissedFor = null;
      this.screenMode = "session";
      this.render();
      void this.executeSubmittedLine(chosen.label).then(() => this.render());
    };

    const registerPopoverGeo = (
      pop: NonNullable<ReturnType<YedoguTui["getPopoverState"]>>,
      popModal: ReturnType<typeof renderOpenCodeModal>,
      popTop: number,
      popLeft: number,
      popW: number,
    ) => {
      this.popoverScrollTop = popModal.scrollTop;
      const optionRows = new Map<number, number>();
      for (const entry of popModal.optionRowOffsets) {
        optionRows.set(popTop + entry.rowOffset + 1, entry.optionIndex);
      }
      this.modalHitGeo = {
        topRow: popTop + 1,
        leftCol: popLeft + 1,
        width: popW,
        height: popModal.lines.length,
        optionRows,
        onClickOption: (optIdx: number) => applyPopoverSelection(pop, optIdx),
        onWheel: (dir: "up" | "down") => {
          const delta = dir === "up" ? -3 : 3;
          this.popoverScrollTop = Math.max(0, Math.min(popModal.maxScrollTop, this.popoverScrollTop + delta));
          this.render();
        },
        onCancel: () => {
          this.popoverDismissedFor = this.inputBuffer;
          this.render();
        },
      };
      if (popModal.scrollbarRowOffset !== undefined && popModal.scrollbarHeight && popModal.maxScrollTop > 0) {
        this.modalScrollbarGeo = {
          col: popLeft + popW - 1,
          topRow: popTop + popModal.scrollbarRowOffset + 1,
          height: popModal.scrollbarHeight,
          maxScrollTop: popModal.maxScrollTop,
          onScrub: (nextTop: number) => {
            this.popoverScrollTop = Math.max(0, Math.min(popModal.maxScrollTop, nextTop));
            this.render();
          },
        };
      }
    };

    if (this.screenMode === "home") {
      const promptW = Math.min(75, Math.max(38, cols - 4));
      const promptLeft = Math.max(0, Math.floor((cols - promptW) / 2));
      const logoLines = renderYedoguLogo(cols, true).split("\n");
      const box = renderOpenCodePromptBox({
        width: promptW,
        input: this.inputBuffer,
        cursorPos: this.inputCursor,
        placeholder: 'Ask anything... "Audit /api/auth for IDOR"',
        agentId: activeAgent.id,
        agentTitle: activeAgent.title,
        modelDisplay,
        providerDisplay,
        effort: this.engine.session.reasoningEffort,
        shellMode,
      });

      const totalBlockH = logoLines.length + 2 + box.lines.length + 1;
      const startY = Math.max(1, Math.floor((rows - 2 - totalBlockH) / 2));

      for (let i = 0; i < logoLines.length; i++) {
        if (startY + i < rows - 1) baseRows[startY + i] = logoLines[i];
      }

      const promptTop = startY + logoLines.length + 2;
      for (let i = 0; i < box.lines.length; i++) {
        if (promptTop + i < rows - 1) {
          baseRows[promptTop + i] = `${" ".repeat(promptLeft)}${box.lines[i]}`;
        }
      }

      const subRow = promptTop + box.lines.length;
      if (subRow < rows - 1) {
        if (this.leader.isArmed) {
          baseRows[subRow] = `${" ".repeat(promptLeft)}${this.leader.renderHintBar().trimStart()}`;
        } else {
          const leftHint = c(PALETTE.muted, shortenPath(this.engine.session.workspace, Math.max(12, promptW - 34)));
          const rightHint = `${c(PALETTE.text, "shift+tab")} ${c(PALETTE.muted, "agents")}  ${c(PALETTE.text, "ctrl+p")} ${c(PALETTE.muted, "commands")}`;
          const gap = Math.max(2, promptW - visibleLength(leftHint) - visibleLength(rightHint));
          baseRows[subRow] = `${" ".repeat(promptLeft)}${leftHint}${" ".repeat(gap)}${rightHint}`;
        }
      }

      // Bottom status bar (exact OpenCode Home footer)
      const connectedCount = this.engine.getConnectedProviders().length;
      const liveBots = this.engine.channels.getPublicViews().filter((ch) => ch.status.state === "connected").length;
      const statusLeft =
        `  ${c(connectedCount > 0 ? PALETTE.success : PALETTE.warning, "⊙")} ` +
        `${c(PALETTE.text, `${connectedCount} provider${connectedCount === 1 ? "" : "s"}`)} ` +
        `${c(PALETTE.muted, "/connect")}` +
        (liveBots > 0 ? `  ${c(PALETTE.info, `· ${liveBots} bot${liveBots === 1 ? "" : "s"}`)}` : "") +
        `  ${c(PALETTE.muted, "· /browser")}`;
      const versionRight = c(PALETTE.muted, "1.0.0  ");
      const botGap = Math.max(2, cols - visibleLength(statusLeft) - visibleLength(versionRight));
      baseRows[rows - 1] = `${statusLeft}${" ".repeat(botGap)}${versionRight}`;

      if (!this.overlayRender) {
        cursor = { row: promptTop + box.cursorRowOffset, col: promptLeft + box.cursorColOffset };
      }

      if (popover && popover.items.length > 0) {
        const popIdx = Math.max(0, Math.min(this.popoverIndex, popover.items.length - 1));
        const popModal = renderOpenCodeModal({
          title: popover.mode === "mention" ? "Route to Agent or File" : "Commands",
          width: promptW,
          maxRows: Math.max(4, Math.min(8, rows - subRow - 3)),
          searchable: false,
          options: popover.items.map((it) => ({
            value: it.insert,
            label: it.label,
            description: it.description,
            badge: it.badge,
          })),
          selectedIndex: popIdx,
          scrollTop: this.popoverScrollTop,
        });
        const popTop = subRow + 1;
        const spliced = compositeOverlay(baseRows, popModal.lines, popTop, promptLeft, promptW, cols);
        for (let r = 0; r < rows; r++) baseRows[r] = spliced[r];
        if (!this.overlayRender) {
          registerPopoverGeo(popover, popModal, popTop, promptLeft, promptW);
        }
      }
    } else {
      // Session screen (chat viewport + bottom composer + optional 40-col sidebar)
      const showSidebar =
        this.sidebarMode === "show" ||
        (this.sidebarMode === "auto" && cols > 120 && !this.engine.session.parentSessionId);
      const sidebarW = 40;
      const mainCols = showSidebar ? Math.max(48, cols - sidebarW - 1) : cols;
      const promptW = Math.max(36, mainCols - 4);
      const promptLeft = 2;

      const box = renderOpenCodePromptBox({
        width: promptW,
        input: this.inputBuffer,
        cursorPos: this.inputCursor,
        placeholder: 'Ask anything... "/help" or "!" for shell',
        agentId: activeAgent.id,
        agentTitle: activeAgent.title,
        modelDisplay,
        providerDisplay,
        effort: this.engine.session.reasoningEffort,
        shellMode,
      });

      const chatHeight = Math.max(4, rows - box.lines.length - 2);
      const allLines = [...this.transcriptLines];
      if (this.spinnerLabel) {
        const glyphs = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        const g = glyphs[this.spinnerFrame % glyphs.length];
        allLines.push(
          `  ${c(PALETTE.accent, g)} ${c(PALETTE.text, this.spinnerLabel)}${this.spinnerDetail ? ` ${c(PALETTE.muted, this.spinnerDetail)}` : ""}`,
        );
      }

      const maxScroll = Math.max(0, allLines.length - chatHeight);
      const clampedScroll = Math.max(0, Math.min(this.scrollOffset, maxScroll));
      this.scrollOffset = clampedScroll;
      const endIdx = allLines.length - clampedScroll;
      const startIdx = Math.max(0, endIdx - chatHeight);
      const visibleChat = allLines.slice(startIdx, endIdx);
      const chatScrollbar = renderScrollbarColumn(chatHeight, allLines.length, startIdx);
      const chatTextW = Math.max(30, mainCols - 2);
      this.chatScrollbarGeo = {
        col: chatTextW + 2, // 1-indexed terminal column of the scrollbar
        topRow: 1,
        height: chatHeight,
        totalLines: allLines.length,
      };

      const mainRows = new Array<string>(rows).fill("");
      for (let i = 0; i < chatHeight; i++) {
        const line = visibleChat[i] ?? "";
        const padded = padVisible(clipVisible(line, chatTextW), chatTextW);
        mainRows[i] = `${padded} ${chatScrollbar[i] ?? "│"}`;
      }

      const promptTop = chatHeight;
      for (let i = 0; i < box.lines.length; i++) {
        if (promptTop + i < rows - 1) {
          mainRows[promptTop + i] = `${" ".repeat(promptLeft)}${box.lines[i]}`;
        }
      }

      const subRow = promptTop + box.lines.length;
      if (subRow < rows) {
        if (this.leader.isArmed) {
          mainRows[subRow] = `${" ".repeat(promptLeft)}${this.leader.renderHintBar().trimStart()}`;
        } else {
          const focusHint = this.statusToast
            ? c(PALETTE.success, this.statusToast)
            : this.focusArea === "chat"
              ? `${c(PALETTE.accent, "chat scroll")} ${c(PALETTE.muted, "(↑↓ scroll · type/esc prompt)")}`
              : `${c(PALETTE.muted, shortenPath(this.engine.session.workspace, 28))}  ${c(PALETTE.muted, `${this.engine.session.id}`)}`;
          const rightInfo = `${c(PALETTE.text, "ctrl+p")} ${c(PALETTE.muted, "palette")}  ${c(PALETTE.text, "ctrl+x")} ${c(PALETTE.muted, "leader")}`;
          const gap = Math.max(2, promptW - visibleLength(focusHint) - visibleLength(rightInfo));
          mainRows[subRow] = `${" ".repeat(promptLeft)}${focusHint}${" ".repeat(gap)}${rightInfo}`;
        }
      }

      if (showSidebar) {
        const sideLines = renderSidebarPanel(
          this.engine.session,
          activeAgent,
          this.engine.getProviders(),
          this.daemon.url,
          this.engine.channels.getPublicViews(),
          sidebarW,
        );
        for (let r = 0; r < rows; r++) {
          const left = padVisible(clipVisible(mainRows[r] ?? "", mainCols), mainCols);
          const right = paintSurfaceLine(` ${sideLines[r] ?? ""}`, sidebarW, PALETTE.pillBg);
          baseRows[r] = `${left} ${right}`;
        }
      } else {
        for (let r = 0; r < rows; r++) baseRows[r] = mainRows[r];
      }

      if (!this.overlayRender) {
        cursor = { row: promptTop + box.cursorRowOffset, col: promptLeft + box.cursorColOffset };
      }

      if (popover && popover.items.length > 0) {
        const popIdx = Math.max(0, Math.min(this.popoverIndex, popover.items.length - 1));
        const popW = Math.min(promptW, 72);
        const popModal = renderOpenCodeModal({
          title: popover.mode === "mention" ? "Route to Agent or File" : "Commands",
          width: popW,
          maxRows: Math.max(4, Math.min(8, promptTop - 2)),
          searchable: false,
          options: popover.items.map((it) => ({
            value: it.insert,
            label: it.label,
            description: it.description,
            badge: it.badge,
          })),
          selectedIndex: popIdx,
          scrollTop: this.popoverScrollTop,
        });
        const popTop = Math.max(1, promptTop - popModal.lines.length);
        const spliced = compositeOverlay(baseRows, popModal.lines, popTop, promptLeft, popW, cols);
        for (let r = 0; r < rows; r++) baseRows[r] = spliced[r];
        if (!this.overlayRender) {
          registerPopoverGeo(popover, popModal, popTop, promptLeft, popW);
        }
      }
    }

    // Floating elevated OpenCode modal overlay
    let finalRows = baseRows;
    if (this.overlayRender) {
      const ov = this.overlayRender();
      const topRow = Math.max(1, Math.floor((rows - ov.lines.length) / 2));
      const leftCol = Math.max(1, Math.floor((cols - ov.width) / 2));
      finalRows = compositeOverlay(baseRows, ov.lines, topRow, leftCol, ov.width, cols);
      if (ov.cursorRow !== undefined && ov.cursorCol !== undefined) {
        cursor = { row: topRow + ov.cursorRow, col: leftCol + ov.cursorCol };
      } else {
        cursor = undefined;
      }
      const optionRows = new Map<number, number>();
      if (ov.optionRowOffsets) {
        for (const entry of ov.optionRowOffsets) {
          optionRows.set(topRow + entry.rowOffset + 1, entry.optionIndex);
        }
      }
      this.modalHitGeo = {
        topRow: topRow + 1,
        leftCol: leftCol + 1,
        width: ov.width,
        height: ov.lines.length,
        optionRows,
        onClickOption: ov.onClickOption,
        onWheel: ov.onWheel,
        onCancel: ov.onCancel,
      };
      if (ov.scrollbarRowOffset !== undefined && ov.scrollbarHeight && ov.onScrub) {
        this.modalScrollbarGeo = {
          col: leftCol + ov.width - 1, // 1-indexed column of modal scrollbar
          topRow: topRow + ov.scrollbarRowOffset + 1,
          height: ov.scrollbarHeight,
          maxScrollTop: ov.maxScrollTop ?? 0,
          onScrub: ov.onScrub,
        };
      }
    }

    this.lastRenderedRows = [...finalRows];
    const displayRows = this.textSelection
      ? this.applySelectionHighlight(finalRows, this.textSelection, cols)
      : finalRows;
    this.screen.paint(displayRows, cursor);
  }

  private showStatusToast(msg: string, durationMs = 2500): void {
    this.statusToast = msg;
    if (this.statusToastTimer) clearTimeout(this.statusToastTimer);
    this.statusToastTimer = setTimeout(() => {
      this.statusToast = null;
      this.statusToastTimer = null;
      if (this.fullScreenActive) this.render();
    }, durationMs);
    if (this.fullScreenActive) this.render();
  }

  private toggleMouseCapture(): void {
    this.mouseEnabled = !this.mouseEnabled;
    this.screen.setMouseEnabled(this.mouseEnabled);
    this.showStatusToast(
      this.mouseEnabled
        ? "Mouse capture ON (scroll & drag-select)"
        : "Mouse capture OFF (native select · Alt+M or /mouse to restore)",
      3500,
    );
  }

  private normalizeSelection(sel: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }): { r1: number; c1: number; r2: number; c2: number } {
    if (sel.startRow < sel.endRow || (sel.startRow === sel.endRow && sel.startCol <= sel.endCol)) {
      return { r1: sel.startRow, c1: sel.startCol, r2: sel.endRow, c2: sel.endCol };
    }
    return { r1: sel.endRow, c1: sel.endCol, r2: sel.startRow, c2: sel.startCol };
  }

  private applySelectionHighlight(
    rows: string[],
    sel: { startRow: number; startCol: number; endRow: number; endCol: number },
    cols: number,
  ): string[] {
    const { r1, c1, r2, c2 } = this.normalizeSelection(sel);
    const out = [...rows];
    for (let r = r1; r <= r2; r++) {
      if (r < 0 || r >= out.length) continue;
      const row = out[r] ?? "";
      const rowStart = r === r1 ? Math.max(0, c1) : 0;
      const rowEnd = r === r2 ? Math.min(cols - 1, c2) : cols - 1;
      if (rowEnd < rowStart) continue;
      const left = takeVisiblePrefix(row, rowStart);
      const midPlain = stripAnsi(takeVisiblePrefix(row, rowEnd + 1)).slice(rowStart);
      const right = rowEnd + 1 < cols ? takeVisibleSuffix(row, rowEnd + 1) : "";
      out[r] = `${left}\x1b[7m${midPlain}\x1b[27m${right}`;
    }
    return out;
  }

  private extractSelectedText(
    rows: string[],
    sel: { startRow: number; startCol: number; endRow: number; endCol: number },
  ): string {
    const { r1, c1, r2, c2 } = this.normalizeSelection(sel);
    const lines: string[] = [];
    for (let r = r1; r <= r2; r++) {
      if (r < 0 || r >= rows.length) continue;
      const plain = stripAnsi(rows[r] ?? "");
      const rowStart = r === r1 ? Math.max(0, c1) : 0;
      const rowEnd = r === r2 ? c2 : plain.length - 1;
      if (rowEnd < rowStart) {
        lines.push("");
        continue;
      }
      lines.push(plain.slice(rowStart, rowEnd + 1).replace(/\s+$/, ""));
    }
    return lines.join("\n").trimEnd();
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
          this.emitOut("\n");
          this.startSpinnerFs("Thinking…", `${this.activeAgentLabel} · ${truncatePlain(p.model, 28)}`);
          break;
        }
        case "reasoning.delta": {
          const p = evt.payload as { delta: string };
          this.stopSpinnerFs();
          if (!this.isStreamingReasoning) {
            this.isStreamingReasoning = true;
            this.emitOut(
              `  ${c(PALETTE.reasoning, "◇")} ${c(PALETTE.muted + PALETTE.italic, "Thinking")}\n  ${c(PALETTE.border, "│")} `,
            );
          }
          this.emitOut(
            c(PALETTE.muted + PALETTE.italic, p.delta.replace(/\n/g, `\n  ${c(PALETTE.border, "│")} `)),
          );
          break;
        }
        case "message.delta": {
          const p = evt.payload as { delta: string };
          this.stopSpinnerFs();
          if (this.isStreamingReasoning && !this.isStreamingText) {
            this.emitOut("\n\n");
          }
          if (!this.isStreamingText) {
            this.isStreamingText = true;
            this.emitOut(
              `  ${c(PALETTE.accent, "✦")} ${c(PALETTE.text + PALETTE.bold, this.activeAgentLabel)} ${c(PALETTE.muted, this.activeModelLabel)}\n\n`,
            );
          }
          this.markdown.push(p.delta);
          if (this.fullScreenActive) this.render();
          break;
        }
        case "message.done": {
          const p = evt.payload as ChatMessage;
          this.stopSpinnerFs();
          if (p.role === "user" && p.source) {
            if (this.promptActive && !this.activeModal && !this.fullScreenActive) {
              this.promptActive = false;
              this.clearDecorations();
              this.slashMenu.reset();
              process.stdout.write("\r\x1b[2K");
            }
            this.remoteTurnActive = true;
            this.emitOut(
              `\n  ${c(PALETTE.info + PALETTE.bold, "◉")} ${c(PALETTE.accentSoft, `[${p.source.platform} · ${p.source.senderName}]`)} ${c(PALETTE.text, p.content)}\n`,
            );
          } else if (p.role === "assistant") {
            if (this.isStreamingText) {
              this.markdown.flush();
            } else if (this.isStreamingReasoning) {
              this.emitOut("\n");
            }
            this.isStreamingText = false;
            this.isStreamingReasoning = false;
            if (this.fullScreenActive) this.render();
            if (this.remoteTurnActive && (!p.toolCalls || p.toolCalls.length === 0)) {
              this.remoteTurnActive = false;
              if (!this.fullScreenActive && !this.activeModal && !this.promptActive) {
                this.prompt(true);
              }
            }
          }
          break;
        }
        case "tool.start": {
          const p = evt.payload as { toolCall: { name: string; arguments: Record<string, unknown> } };
          this.stopSpinnerFs();
          if (this.isStreamingText) {
            this.markdown.flush();
            this.isStreamingText = false;
          }
          this.toolStepCount++;
          this.emitOut(renderToolStart(p.toolCall.name, p.toolCall.arguments, this.toolStepCount));
          const compactArgs = formatToolArgsCompact(p.toolCall.arguments, 40);
          this.startSpinnerFs(`Running ${p.toolCall.name}…`, compactArgs);
          break;
        }
        case "tool.done": {
          const p = evt.payload as {
            toolCall: { name: string; status: string; durationMs?: number; output?: string };
          };
          this.stopSpinnerFs();
          const ok = p.toolCall.status !== "error";
          this.emitOut(
            renderToolDone(p.toolCall.name, ok, p.toolCall.durationMs ?? 0, p.toolCall.output, this.diffViewMode),
          );
          break;
        }
        case "finding.updated": {
          const f = evt.payload as { id: string; severity: string; title: string };
          this.stopSpinnerFs();
          this.emitOut(
            `\n  ${c(PALETTE.danger + PALETTE.bold, "⚑ Finding logged")} ${c(PALETTE.info, f.id)} ${c(PALETTE.warning, `[${f.severity.toUpperCase()}]`)} ${c(PALETTE.text, f.title)}\n`,
          );
          break;
        }
        case "system.notice": {
          const n = evt.payload as { level?: string; message: string };
          this.stopSpinnerFs();
          if (this.fullScreenActive && n.level !== "error") {
            this.render();
            break;
          }
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
          this.emitOut(`${formattedLines}\n`);
          if (this.remoteTurnActive && n.level === "error") {
            this.remoteTurnActive = false;
            if (!this.fullScreenActive && !this.activeModal && !this.promptActive) {
              this.prompt(true);
            }
          }
          break;
        }
        case "model.changed":
        case "agent.changed":
        case "provider.updated":
        case "channel.updated":
        case "scope.updated":
        case "session.updated": {
          if (evt.type === "session.updated") {
            const payload = evt.payload as { theme?: string } | undefined;
            if (payload?.theme) {
              setActiveTheme(payload.theme);
            }
          }
          if (this.fullScreenActive && !this.overlayRender) {
            this.render();
          }
          break;
        }
      }
    });
  }

  public async start(): Promise<void> {
    if (process.stdout.isTTY && process.stdin.isTTY) {
      this.fullScreenActive = true;
      this.screen.enter();
      this.keyStream = new PassThrough();
      readline.emitKeypressEvents(this.keyStream);
      if (typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      this.keypressListener = (str: string, key: readline.Key = {}) => {
        this.handleFullScreenKeypress(str || "", key);
      };
      this.mouseDataListener = (buf: Buffer) => {
        const { cleaned, events } = extractAndStripMouseSequences(buf.toString("utf8"));
        for (const ev of events) {
          this.handleMouseEvent(ev);
        }
        if (cleaned.length > 0 && this.keyStream) {
          this.keyStream.write(cleaned);
        }
      };
      this.resizeListener = () => {
        this.render();
      };
      process.stdin.on("data", this.mouseDataListener);
      this.keyStream.on("keypress", this.keypressListener);
      process.stdout.on("resize", this.resizeListener);
      process.on("SIGINT", () => void this.shutdown());
      process.on("SIGTERM", () => void this.shutdown());

      this.render();
      return;
    }

    process.stdout.write(
      renderBanner(
        this.engine.session,
        this.engine.getAgent(),
        this.engine.getProviders(),
        this.daemon.url,
        this.engine.channels.getPublicViews(),
        { sidebarMode: this.sidebarMode },
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

  private handleMouseEvent(ev: SgrMouseEvent): void {
    if (!this.fullScreenActive) return;
    if (ev.kind === "wheel-up") {
      this.handleMouseWheel("up");
      return;
    }
    if (ev.kind === "wheel-down") {
      this.handleMouseWheel("down");
      return;
    }
    if (ev.kind === "up") {
      if (this.draggingScrollbar) {
        this.draggingScrollbar = null;
        return;
      }
      if (this.pendingModalClickIndex !== null) {
        const clickedIdx = this.pendingModalClickIndex;
        this.pendingModalClickIndex = null;
        if (this.modalHitGeo?.optionRows.get(ev.row) === clickedIdx) {
          this.modalHitGeo.onClickOption?.(clickedIdx);
        }
        return;
      }
      if (this.textSelection?.dragging) {
        this.textSelection.dragging = false;
        const dragged =
          this.textSelection.startRow !== this.textSelection.endRow ||
          this.textSelection.startCol !== this.textSelection.endCol;
        if (dragged) {
          const text = this.extractSelectedText(this.lastRenderedRows, this.textSelection);
          this.textSelection = null;
          if (text.length > 0) {
            this.copyTextToClipboard(text);
            this.showStatusToast(`✓ Copied ${text.length} chars`);
          } else {
            this.render();
          }
        } else {
          this.textSelection = null;
          this.render();
        }
      }
      return;
    }

    const scrubModal = (row: number) => {
      const geo = this.modalScrollbarGeo;
      if (!geo || geo.maxScrollTop <= 0) return;
      const ratio = Math.max(0, Math.min(1, (row - geo.topRow) / Math.max(1, geo.height - 1)));
      const nextScrollTop = Math.round(ratio * geo.maxScrollTop);
      geo.onScrub(nextScrollTop);
    };

    const scrubChat = (row: number) => {
      const geo = this.chatScrollbarGeo;
      if (!geo) return;
      const maxScroll = Math.max(0, geo.totalLines - geo.height);
      const ratio = Math.max(0, Math.min(1, (row - geo.topRow) / Math.max(1, geo.height - 1)));
      // top of track = maxScroll, bottom of track = 0
      this.scrollOffset = Math.round((1 - ratio) * maxScroll);
      this.render();
    };

    if (ev.kind === "down") {
      this.textSelection = null;
      this.pendingModalClickIndex = null;
      // 1. Right-edge scrollbar grab & drag (for modals & popovers)
      if (this.modalScrollbarGeo) {
        const g = this.modalScrollbarGeo;
        if (Math.abs(ev.col - g.col) <= 2 && ev.row >= g.topRow && ev.row < g.topRow + g.height) {
          this.draggingScrollbar = "modal";
          scrubModal(ev.row);
          return;
        }
      }
      // 2. Click inside or outside a modal / popover
      if (this.modalHitGeo) {
        const m = this.modalHitGeo;
        const insideModal =
          ev.col >= m.leftCol &&
          ev.col < m.leftCol + m.width &&
          ev.row >= m.topRow &&
          ev.row < m.topRow + m.height;
        if (insideModal) {
          // Clicking `esc` in the top-right header cancels the modal
          if (ev.row === m.topRow + 1 && ev.col >= m.leftCol + m.width - 6) {
            m.onCancel?.();
            return;
          }
          const optIdx = m.optionRows.get(ev.row);
          if (optIdx !== undefined) {
            this.pendingModalClickIndex = optIdx;
            return;
          }
          // Click on modal chrome (title/search/category/footer): consume without text selection
          return;
        }
        if (this.overlayRender) {
          // Click outside floating overlay modal dismisses it cleanly
          m.onCancel?.();
          return;
        }
      }
      // 3. Chat scrollbar grab & drag in session view
      if (!this.overlayRender && this.chatScrollbarGeo && this.screenMode === "session") {
        const g = this.chatScrollbarGeo;
        if (Math.abs(ev.col - g.col) <= 2 && ev.row >= g.topRow && ev.row < g.topRow + g.height) {
          this.focusArea = "chat";
          this.draggingScrollbar = "chat";
          scrubChat(ev.row);
          return;
        }
        if (ev.row >= g.topRow && ev.row < g.topRow + g.height && ev.col <= g.col) {
          this.focusArea = "chat";
        } else {
          this.focusArea = "prompt";
        }
      }
      const row = Math.max(0, ev.row - 1);
      const col = Math.max(0, ev.col - 1);
      this.textSelection = { startRow: row, startCol: col, endRow: row, endCol: col, dragging: true };
      this.render();
    } else if (ev.kind === "drag") {
      if (this.draggingScrollbar === "modal") {
        scrubModal(ev.row);
      } else if (this.draggingScrollbar === "chat") {
        scrubChat(ev.row);
      } else if (this.pendingModalClickIndex !== null) {
        // Ignore drag while pressing an option row; release only fires if still on same row
      } else if (this.textSelection?.dragging) {
        this.textSelection.endRow = Math.max(0, ev.row - 1);
        this.textSelection.endCol = Math.max(0, ev.col - 1);
        this.render();
      }
    }
  }

  private handleMouseWheel(dir: "up" | "down"): void {
    if (!this.fullScreenActive) return;
    // Scroll active modal or popover viewport WITHOUT moving selection
    if (this.modalHitGeo?.onWheel) {
      this.modalHitGeo.onWheel(dir);
      return;
    }
    if (this.overlayRender) {
      return;
    }
    if (this.screenMode === "session") {
      if (dir === "up") {
        this.scrollOffset += 3;
      } else {
        this.scrollOffset = Math.max(0, this.scrollOffset - 3);
      }
      this.render();
    }
  }

  private handleFullScreenKeypress(str: string, key: readline.Key = {}): void {
    // Ignore raw SGR mouse escape fragments (handled by mouseDataListener)
    if (str.startsWith("\x1b[<") || /^\[\<\d+;\d+;\d+[Mm]$/.test(str) || key.sequence?.startsWith("\x1b[<")) {
      return;
    }

    // 1. Floating overlay modal owns all input while open
    if (this.overlayKeyHandler) {
      this.overlayKeyHandler(str, key);
      return;
    }

    // 2. Ctrl+C: abort active generation or double-press to exit
    if (key.ctrl && key.name === "c") {
      if (this.engine.busy) {
        this.stopSpinnerFs();
        this.markdown.flush();
        this.engine.abortActive();
        this.emitOut(`\n  ${c(PALETTE.warning, "!")} ${c(PALETTE.muted, "Aborted active generation.")}\n`);
        return;
      }
      if (this.inputBuffer.length > 0) {
        this.inputBuffer = "";
        this.inputCursor = 0;
        this.render();
        return;
      }
      const now = Date.now();
      if (now - this.lastSigint < 1500) {
        void this.shutdown();
        return;
      }
      this.lastSigint = now;
      this.emitOut(`\n  ${c(PALETTE.muted, "Press Ctrl+C again or type /exit to quit.")}\n`);
      return;
    }

    if (this.engine.busy) {
      if (key.name === "escape") {
        this.stopSpinnerFs();
        this.markdown.flush();
        this.engine.abortActive();
        this.emitOut(`\n  ${c(PALETTE.warning, "!")} ${c(PALETTE.muted, "Interrupted.")}\n`);
      } else if (key.name === "pageup") {
        this.scrollOffset += 8;
        this.render();
      } else if (key.name === "pagedown") {
        this.scrollOffset = Math.max(0, this.scrollOffset - 8);
        this.render();
      }
      return;
    }

    // 3. Leader key (<leader> = Ctrl+X) chord resolution
    if (this.leader.isArmed) {
      const action = this.leader.resolveChord(str, key);
      if (action === "cancel") {
        this.render();
        return;
      }
      if (action) {
        void this.dispatchKeybindAction(action).catch((err) => {
          this.emitOut(`\n  ${c(PALETTE.danger, "✗")} ${c(PALETTE.text, formatFriendlyError(err))}\n`);
        });
        return;
      }
      this.render();
    }

    if (key.ctrl && key.name === "x") {
      this.leader.arm();
      this.render();
      return;
    }

    // 4. Global OpenCode + Yedogu shortcuts
    const runModalAction = (fn: () => Promise<void>) => {
      void fn().catch((err) => {
        this.emitOut(`\n  ${c(PALETTE.danger, "✗")} ${c(PALETTE.text, formatFriendlyError(err))}\n`);
      });
    };

    if (key.ctrl && (key.name === "p" || key.name === "k")) {
      runModalAction(() => this.openCommandPalette());
      return;
    }
    if (key.shift && key.name === "tab") {
      this.cycleActiveAgent(1);
      this.render();
      return;
    }
    if (key.name === "f2") {
      this.cycleRecentModel(key.shift ? -1 : 1);
      this.render();
      return;
    }
    if (key.ctrl && key.name === "g") {
      runModalAction(() => this.openAgentPicker());
      return;
    }
    if (key.ctrl && key.name === "t") {
      runModalAction(() => this.openThemePicker());
      return;
    }
    if (key.ctrl && key.name === "o") {
      runModalAction(() => this.openSessionPicker());
      return;
    }
    if (key.ctrl && key.name === "b") {
      runModalAction(async () => { await this.handleSlashCommand("/browser"); });
      return;
    }
    if (key.meta && key.name === "m") {
      this.toggleMouseCapture();
      return;
    }
    if (key.ctrl && key.name === "r") {
      runModalAction(() => this.renameCurrentSession());
      return;
    }
    if (key.ctrl && key.name === "l") {
      this.transcriptLines = [""];
      this.scrollOffset = 0;
      this.screenMode = "home";
      this.render();
      return;
    }
    if (str === "?" && !key.ctrl && !key.meta && this.inputBuffer.length === 0) {
      runModalAction(async () => { await this.handleSlashCommand("/help"); });
      return;
    }

    // 5. Scrollback navigation in Session view
    if (key.name === "pageup") {
      this.scrollOffset += 8;
      this.render();
      return;
    }
    if (key.name === "pagedown") {
      this.scrollOffset = Math.max(0, this.scrollOffset - 8);
      this.render();
      return;
    }

    // 6. Active `/` or `@` popover navigation
    const pop = this.getPopoverState();
    if (pop && pop.items.length > 0) {
      const keepPopInView = () => {
        const viewRows = 8;
        if (this.popoverIndex < this.popoverScrollTop) {
          this.popoverScrollTop = this.popoverIndex;
        } else if (this.popoverIndex >= this.popoverScrollTop + viewRows) {
          this.popoverScrollTop = Math.max(0, this.popoverIndex - viewRows + 1);
        }
      };
      if (key.name === "up") {
        this.popoverIndex = (this.popoverIndex - 1 + pop.items.length) % pop.items.length;
        keepPopInView();
        this.render();
        return;
      }
      if (key.name === "down") {
        this.popoverIndex = (this.popoverIndex + 1) % pop.items.length;
        keepPopInView();
        this.render();
        return;
      }
      if (key.name === "escape") {
        this.popoverDismissedFor = this.inputBuffer;
        this.render();
        return;
      }
      if (key.name === "tab") {
        const chosen = pop.items[Math.max(0, Math.min(this.popoverIndex, pop.items.length - 1))];
        if (chosen) {
          this.inputBuffer = chosen.insert;
          this.inputCursor = this.inputBuffer.length;
          this.popoverDismissedFor = this.inputBuffer;
          this.render();
        }
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        const chosen = pop.items[Math.max(0, Math.min(this.popoverIndex, pop.items.length - 1))];
        if (chosen) {
          if (!chosen.isSlash) {
            this.inputBuffer = chosen.insert;
            this.inputCursor = this.inputBuffer.length;
            this.popoverDismissedFor = this.inputBuffer;
            this.render();
            return;
          }
          if (chosen.takesArgs && !chosen.interactivePopup && this.inputBuffer !== chosen.label) {
            this.inputBuffer = `${chosen.label} `;
            this.inputCursor = this.inputBuffer.length;
            this.render();
            return;
          }
          this.inputBuffer = chosen.label;
          this.inputCursor = this.inputBuffer.length;
        }
      }
    }

    // 7. Standard prompt editing keys
    if (key.name === "escape" && this.focusArea === "chat") {
      this.focusArea = "prompt";
      this.render();
      return;
    }
    if (key.name === "escape" && this.inputBuffer.length > 0) {
      this.inputBuffer = "";
      this.inputCursor = 0;
      this.render();
      return;
    }
    if (key.name === "return" || key.name === "enter") {
      const submitted = this.inputBuffer.trim();
      this.inputBuffer = "";
      this.inputCursor = 0;
      this.popoverIndex = 0;
      this.popoverScrollTop = 0;
      this.popoverDismissedFor = null;
      this.historyIndex = -1;
      this.historyDraft = "";
      if (!submitted) {
        this.render();
        return;
      }
      if (this.inputHistory[0] !== submitted) {
        this.inputHistory.unshift(submitted);
        if (this.inputHistory.length > 200) this.inputHistory.pop();
        this.saveCommandHistory();
      }
      this.screenMode = "session";
      if (!submitted.startsWith("/")) {
        this.appendTranscript(`\n  ${c(PALETTE.accent, "┃")} ${c(PALETTE.text + PALETTE.bold, submitted)}\n`);
      }
      this.render();
      void this.executeSubmittedLine(submitted).then(() => {
        this.render();
      });
      return;
    }
    if (key.name === "backspace") {
      if (this.inputCursor > 0) {
        this.historyIndex = -1;
        this.popoverDismissedFor = null;
        this.inputBuffer =
          this.inputBuffer.slice(0, this.inputCursor - 1) +
          this.inputBuffer.slice(this.inputCursor);
        this.inputCursor--;
        this.popoverIndex = 0;
        this.popoverScrollTop = 0;
        this.render();
      }
      return;
    }
    if (key.name === "delete") {
      if (this.inputCursor < this.inputBuffer.length) {
        this.historyIndex = -1;
        this.popoverDismissedFor = null;
        this.inputBuffer =
          this.inputBuffer.slice(0, this.inputCursor) +
          this.inputBuffer.slice(this.inputCursor + 1);
        this.render();
      }
      return;
    }
    if (key.ctrl && key.name === "u") {
      this.historyIndex = -1;
      this.popoverDismissedFor = null;
      this.inputBuffer = "";
      this.inputCursor = 0;
      this.render();
      return;
    }
    if (key.ctrl && key.name === "w") {
      this.historyIndex = -1;
      this.popoverDismissedFor = null;
      const before = this.inputBuffer.slice(0, this.inputCursor).replace(/\s+$/, "");
      const idx = before.lastIndexOf(" ");
      const nextCursor = idx === -1 ? 0 : idx + 1;
      this.inputBuffer = this.inputBuffer.slice(0, nextCursor) + this.inputBuffer.slice(this.inputCursor);
      this.inputCursor = nextCursor;
      this.render();
      return;
    }
    if (key.name === "left") {
      if (this.inputCursor > 0) {
        this.inputCursor--;
        this.render();
      }
      return;
    }
    if (key.name === "right") {
      if (this.inputCursor < this.inputBuffer.length) {
        this.inputCursor++;
        this.render();
      }
      return;
    }
    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      this.inputCursor = 0;
      this.render();
      return;
    }
    if (key.name === "end" || (key.ctrl && key.name === "e" && this.inputBuffer.length > 0)) {
      this.inputCursor = this.inputBuffer.length;
      this.render();
      return;
    }
    if (key.ctrl && key.name === "e" && this.inputBuffer.length === 0) {
      runModalAction(() => this.openReasoningPicker());
      return;
    }
    if (key.name === "up") {
      this.focusArea = "prompt";
      if (this.inputHistory.length > 0) {
        if (this.historyIndex === -1) {
          this.historyDraft = this.inputBuffer;
        }
        this.historyIndex = Math.min(this.inputHistory.length - 1, this.historyIndex + 1);
        this.inputBuffer = this.inputHistory[this.historyIndex];
        this.inputCursor = this.inputBuffer.length;
        this.popoverDismissedFor = this.inputBuffer;
        this.render();
      }
      return;
    }
    if (key.name === "down") {
      this.focusArea = "prompt";
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.inputBuffer = this.inputHistory[this.historyIndex];
        this.inputCursor = this.inputBuffer.length;
        this.popoverDismissedFor = this.inputBuffer;
        this.render();
      } else if (this.historyIndex === 0) {
        this.historyIndex = -1;
        this.inputBuffer = this.historyDraft;
        this.inputCursor = this.inputBuffer.length;
        this.popoverDismissedFor = this.inputBuffer;
        this.render();
      }
      return;
    }

    if (str && !key.ctrl && !key.meta && /^[\x20-\x7e]+$/.test(str)) {
      this.focusArea = "prompt";
      this.historyIndex = -1;
      this.popoverDismissedFor = null;
      this.inputBuffer =
        this.inputBuffer.slice(0, this.inputCursor) +
        str +
        this.inputBuffer.slice(this.inputCursor);
      this.inputCursor += str.length;
      this.popoverIndex = 0;
      this.popoverScrollTop = 0;
      this.render();
    }
  }

  private async executeSubmittedLine(line: string): Promise<void> {
    try {
      if (line.startsWith("/")) {
        const shouldContinue = await this.handleSlashCommand(line);
        if (!shouldContinue) {
          this.shutdown();
          return;
        }
      } else if (line.startsWith("!") && line.length > 1) {
        const cmd = line.slice(1).trim();
        this.emitOut(renderToolStart("shell", { command: cmd }));
        this.startSpinnerFs(`$ ${truncatePlain(cmd, 42)}…`);
        const res = await executeShell(cmd, this.engine.session.workspace, 60000);
        this.stopSpinnerFs();
        const combined = [res.stdout, res.stderr].filter(Boolean).join("\n").trim();
        this.emitOut(renderToolDone("shell", res.exitCode === 0, res.durationMs, combined || `(exit ${res.exitCode})`, this.diffViewMode));
      } else {
        this.undoStack.push(structuredClone(this.engine.session.messages));
        if (this.undoStack.length > 30) this.undoStack.shift();
        this.redoStack = [];
        const enriched = this.expandAtFileReferences(line);
        await this.engine.sendPrompt(enriched);
      }
    } catch (err) {
      this.stopSpinnerFs();
      this.markdown.flush();
      const friendly = formatFriendlyError(err).split(/\r?\n/);
      this.emitOut(
        `\n  ${c(PALETTE.danger + PALETTE.bold, "✗")} ${c(PALETTE.text, friendly[0])}\n` +
          friendly
            .slice(1)
            .map((l) => `    ${c(PALETTE.muted, l)}\n`)
            .join(""),
      );
    }

    if (!this.fullScreenActive) {
      this.prompt(true);
    }
  }

  private expandAtFileReferences(input: string): string {
    const tokens = input.match(/@([^\s]+)/g);
    if (!tokens || tokens.length === 0) return input;
    const agentIds = new Set(this.engine.getAgents().map((a) => a.id));
    const attachedBlocks: string[] = [];
    for (const tok of tokens) {
      const candidate = tok.slice(1);
      if (agentIds.has(candidate)) continue;
      const abs = path.isAbsolute(candidate)
        ? candidate
        : path.resolve(this.engine.session.workspace, candidate);
      try {
        if (fs.existsSync(abs) && fs.statSync(abs).isFile() && fs.statSync(abs).size < 256 * 1024) {
          const content = fs.readFileSync(abs, "utf8");
          if (!content.includes("\0")) {
            attachedBlocks.push(`<file path="${candidate}">\n${content.slice(0, 12000)}\n</file>`);
          }
        }
      } catch {
        // ignore unreadable paths
      }
    }
    if (attachedBlocks.length === 0) return input;
    return `${input}\n\n${attachedBlocks.join("\n\n")}`;
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

    const footer = this.leader.isArmed ? this.leader.renderHintBar() : renderComposerFooter();
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
  private runSelectModal<T>(
    config: SelectModalConfig<T> & { onHover?: (selected: SelectOption<T> | undefined) => void },
  ): Promise<ModalOutcome<T>> {
    return new Promise((resolve) => {
      if (!process.stdout.isTTY) {
        resolve({ action: "cancel" });
        return;
      }

      if (this.fullScreenActive) {
        let query = "";
        let options = [...config.options];
        let filtered = [...options];
        let selectedIndex =
          config.initialIndex !== undefined && config.initialIndex >= 0 && config.initialIndex < filtered.length
            ? config.initialIndex
            : Math.max(0, filtered.findIndex((o) => o.active));
        let scrollTop = 0;
        let keepSelectionInView = true;
        let lastMaxScrollTop = 0;
        let subtitle = config.subtitle ?? "";
        let footerHint =
          config.footerHints ??
          (config.onTab ? "↑↓ move · ↵ select · tab mode · esc close" : "↑↓ move · ↵ select · esc close");

        const applyFilter = () => {
          filtered = filterSelectOptions(options, query);
          if (selectedIndex >= filtered.length) selectedIndex = 0;
          scrollTop = 0;
          keepSelectionInView = true;
          config.onHover?.(filtered[selectedIndex]);
        };

        const closeOverlay = (outcome: ModalOutcome<T>) => {
          this.overlayRender = null;
          this.overlayKeyHandler = null;
          this.pendingModalClickIndex = null;
          this.render();
          resolve(outcome);
        };

        const applyPatch = (patch: SelectModalPatch<T>) => {
          if (patch.closeWith) {
            closeOverlay(patch.closeWith);
            return true;
          }
          if (patch.subtitle !== undefined) subtitle = patch.subtitle;
          if (patch.footerHints !== undefined) footerHint = patch.footerHints;
          if (patch.options) {
            options = [...patch.options];
            applyFilter();
          }
          if (patch.selectedIndex !== undefined && filtered.length > 0) {
            selectedIndex = Math.max(0, Math.min(filtered.length - 1, patch.selectedIndex));
            keepSelectionInView = true;
            config.onHover?.(filtered[selectedIndex]);
          }
          return false;
        };

        this.overlayRender = () => {
          const { cols, rows } = this.screen.size;
          const modalW = Math.min(config.width ?? 70, Math.max(46, cols - 6));
          const innerW = modalW - 4;
          const footerPanel = config.renderFooterPanel
            ? config.renderFooterPanel(filtered[selectedIndex], innerW)
            : undefined;
          const modalOpts: OpenCodeModalOption<T>[] = filtered.map((o) => ({
            value: o.value,
            label: o.label,
            description: o.description,
            badge: o.badge,
            badgeColor: o.badgeColor,
            badgeRaw: o.badgeRaw,
            checked: o.checked ?? o.active,
            category: o.category,
            keywords: o.keywords,
          }));
          const maxRows = Math.max(4, Math.min(config.maxVisible ?? 12, rows - 10));
          let rendered = renderOpenCodeModal({
            title: subtitle ? `${config.title} · ${subtitle}` : config.title,
            width: modalW,
            maxRows,
            searchable: config.searchable !== false,
            searchPlaceholder: config.placeholder ?? "Search",
            query,
            options: modalOpts,
            selectedIndex,
            scrollTop,
            footerPanel,
            footerHint,
          });
          if (keepSelectionInView && rendered.scrollbarHeight) {
            const viewH = rendered.scrollbarHeight;
            let desiredScroll = rendered.scrollTop;
            if (rendered.selectedVisualRow < desiredScroll) {
              desiredScroll = rendered.selectedVisualRow;
            } else if (rendered.selectedVisualRow >= desiredScroll + viewH) {
              desiredScroll = rendered.selectedVisualRow - viewH + 1;
            }
            desiredScroll = Math.max(0, Math.min(rendered.maxScrollTop, desiredScroll));
            if (desiredScroll !== rendered.scrollTop) {
              scrollTop = desiredScroll;
              rendered = renderOpenCodeModal({
                title: subtitle ? `${config.title} · ${subtitle}` : config.title,
                width: modalW,
                maxRows,
                searchable: config.searchable !== false,
                searchPlaceholder: config.placeholder ?? "Search",
                query,
                options: modalOpts,
                selectedIndex,
                scrollTop,
                footerPanel,
                footerHint,
              });
            }
          }
          scrollTop = rendered.scrollTop;
          lastMaxScrollTop = rendered.maxScrollTop;
          return {
            lines: rendered.lines,
            width: modalW,
            cursorRow: rendered.cursorRowOffset,
            cursorCol: rendered.cursorColOffset,
            scrollbarRowOffset: rendered.scrollbarRowOffset,
            scrollbarHeight: rendered.scrollbarHeight,
            maxScrollTop: rendered.maxScrollTop,
            optionRowOffsets: rendered.optionRowOffsets,
            onScrub: (nextTop: number) => {
              keepSelectionInView = false;
              scrollTop = Math.max(0, Math.min(lastMaxScrollTop, nextTop));
              this.render();
            },
            onWheel: (dir: "up" | "down") => {
              keepSelectionInView = false;
              const delta = dir === "up" ? -3 : 3;
              scrollTop = Math.max(0, Math.min(lastMaxScrollTop, scrollTop + delta));
              this.render();
            },
            onClickOption: (optIdx: number) => {
              const chosen = filtered[optIdx];
              if (!chosen) return;
              selectedIndex = optIdx;
              config.onHover?.(chosen);
              closeOverlay({ action: "select", value: chosen.value, option: chosen });
            },
            onCancel: () => {
              closeOverlay({ action: "cancel" });
            },
          };
        };

        this.overlayKeyHandler = (str: string, key: readline.Key = {}) => {
          if (key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d"))) {
            closeOverlay({ action: "cancel" });
            return;
          }
          if (key.name === "return" || key.name === "enter") {
            const chosen = filtered[selectedIndex];
            if (!chosen) return;
            closeOverlay({ action: "select", value: chosen.value, option: chosen });
            return;
          }
          if (key.name === "up" || (key.ctrl && key.name === "p")) {
            if (filtered.length > 0) {
              selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
              keepSelectionInView = true;
              config.onHover?.(filtered[selectedIndex]);
              this.render();
            }
            return;
          }
          if (key.name === "down" || (key.ctrl && key.name === "n")) {
            if (filtered.length > 0) {
              selectedIndex = (selectedIndex + 1) % filtered.length;
              keepSelectionInView = true;
              config.onHover?.(filtered[selectedIndex]);
              this.render();
            }
            return;
          }
          if (key.name === "pageup") {
            if (filtered.length > 0) {
              selectedIndex = Math.max(0, selectedIndex - 6);
              keepSelectionInView = true;
              config.onHover?.(filtered[selectedIndex]);
              this.render();
            }
            return;
          }
          if (key.name === "pagedown") {
            if (filtered.length > 0) {
              selectedIndex = Math.min(filtered.length - 1, selectedIndex + 6);
              keepSelectionInView = true;
              config.onHover?.(filtered[selectedIndex]);
              this.render();
            }
            return;
          }
          if (key.name === "left" && config.onLeftRight) {
            const patch = config.onLeftRight(-1, filtered[selectedIndex]);
            if (patch && applyPatch(patch)) return;
            this.render();
            return;
          }
          if (key.name === "right" && config.onLeftRight) {
            const patch = config.onLeftRight(1, filtered[selectedIndex]);
            if (patch && applyPatch(patch)) return;
            this.render();
            return;
          }
          if (key.name === "tab" && config.onTab) {
            const patch = config.onTab();
            if (patch && applyPatch(patch)) return;
            this.render();
            return;
          }
          if (config.onKey) {
            const handled = config.onKey(str, key, filtered[selectedIndex]);
            if (handled) {
              if (typeof handled === "object" && applyPatch(handled)) return;
              this.render();
              return;
            }
          }
          if (config.searchable === false) return;
          if (key.name === "backspace") {
            if (query.length > 0) {
              query = query.slice(0, -1);
              applyFilter();
              this.render();
            }
            return;
          }
          if (key.ctrl && key.name === "u") {
            if (query.length > 0) {
              query = "";
              applyFilter();
              this.render();
            }
            return;
          }
          if (str && !key.ctrl && !key.meta && /^[\x20-\x7e]+$/.test(str)) {
            query += str;
            applyFilter();
            this.render();
          }
        };

        this.render();
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

      if (this.fullScreenActive) {
        let value = config.initialValue ?? "";
        let errorMsg = "";

        const closeOverlay = (outcome: InputOutcome) => {
          this.overlayRender = null;
          this.overlayKeyHandler = null;
          this.render();
          resolve(outcome);
        };

        this.overlayRender = () => {
          const { cols } = this.screen.size;
          const modalW = Math.min(config.width ?? 68, Math.max(46, cols - 6));
          const innerW = modalW - 4;
          const modalBg = PALETTE.pillBg;
          const lines: string[] = [];
          lines.push(paintSurfaceLine("", modalW, modalBg));
          const titleStr = c(PALETTE.text + PALETTE.bold, truncatePlain(config.subtitle ? `${config.title} · ${config.subtitle}` : config.title, innerW - 6));
          const escStr = c(PALETTE.muted, "esc");
          const gap = Math.max(1, innerW - visibleLength(titleStr) - visibleLength(escStr));
          lines.push(paintSurfaceLine(`  ${titleStr}${" ".repeat(gap)}${escStr}  `, modalW, modalBg));

          if (config.steps?.length) {
            lines.push(paintSurfaceLine("", modalW, modalBg));
            config.steps.forEach((st, i) => {
              lines.push(paintSurfaceLine(`  ${c(PALETTE.accent, `${i + 1}.`)} ${c(PALETTE.secondary, truncatePlain(st, innerW - 4))}`, modalW, modalBg));
            });
          }

          lines.push(paintSurfaceLine("", modalW, modalBg));
          if (config.fieldLabel) {
            lines.push(paintSurfaceLine(`  ${c(PALETTE.muted, config.fieldLabel)}`, modalW, modalBg));
          }
          const shown = config.secret ? "•".repeat(value.length) : value;
          const fieldText = shown
            ? c(PALETTE.text, truncatePlain(shown, innerW - 4))
            : c(PALETTE.muted, truncatePlain(config.placeholder ?? "Type value…", innerW - 4));
          const cursorRow = lines.length;
          const cursorCol = 3 + Math.min(shown.length, innerW - 4);
          lines.push(`${c(PALETTE.accent, "┃")}${paintSurfaceLine(`  ${fieldText}`, modalW - 1, PALETTE.surfaceActiveBg)}`);

          if (errorMsg) {
            lines.push(paintSurfaceLine(`  ${c(PALETTE.danger, truncatePlain(errorMsg, innerW))}`, modalW, modalBg));
          } else if (config.hint) {
            lines.push(paintSurfaceLine(`  ${c(PALETTE.muted, truncatePlain(config.hint, innerW))}`, modalW, modalBg));
          }
          lines.push(paintSurfaceLine("", modalW, modalBg));
          lines.push(paintSurfaceLine(`  ${c(PALETTE.muted, config.footerHints ?? "enter submit · esc cancel")}`, modalW, modalBg));
          lines.push(paintSurfaceLine("", modalW, modalBg));
          return { lines, width: modalW, cursorRow, cursorCol, onCancel: () => closeOverlay({ action: "cancel" }) };
        };

        this.overlayKeyHandler = (str: string, key: readline.Key = {}) => {
          if (key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d"))) {
            closeOverlay({ action: "cancel" });
            return;
          }
          if (key.name === "return" || key.name === "enter") {
            const err = config.validate?.(value.trim());
            if (err) {
              errorMsg = err;
              this.render();
              return;
            }
            closeOverlay({ action: "submit", value: value.trim() });
            return;
          }
          if (key.name === "backspace") {
            if (value.length > 0) {
              value = value.slice(0, -1);
              errorMsg = "";
              this.render();
            }
            return;
          }
          if (key.ctrl && key.name === "u") {
            value = "";
            errorMsg = "";
            this.render();
            return;
          }
          if (str && !key.ctrl && !key.meta && /^[\x20-\x7e]+$/.test(str)) {
            value += str;
            errorMsg = "";
            this.render();
          }
        };

        this.render();
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

      if (this.fullScreenActive) {
        const values: Record<string, string> = {};
        for (const f of config.fields) values[f.id] = f.initialValue ?? "";
        let activeIdx = 0;
        let errorMsg = "";

        const closeOverlay = (outcome: FormOutcome) => {
          this.overlayRender = null;
          this.overlayKeyHandler = null;
          this.render();
          resolve(outcome);
        };

        this.overlayRender = () => {
          const { cols } = this.screen.size;
          const modalW = Math.min(config.width ?? 72, Math.max(48, cols - 6));
          const innerW = modalW - 4;
          const modalBg = PALETTE.pillBg;
          const lines: string[] = [];
          lines.push(paintSurfaceLine("", modalW, modalBg));
          const titleStr = c(PALETTE.text + PALETTE.bold, truncatePlain(config.subtitle ? `${config.title} · ${config.subtitle}` : config.title, innerW - 6));
          const escStr = c(PALETTE.muted, "esc");
          const gap = Math.max(1, innerW - visibleLength(titleStr) - visibleLength(escStr));
          lines.push(paintSurfaceLine(`  ${titleStr}${" ".repeat(gap)}${escStr}  `, modalW, modalBg));

          if (config.steps?.length) {
            lines.push(paintSurfaceLine("", modalW, modalBg));
            config.steps.forEach((st, i) => {
              lines.push(paintSurfaceLine(`  ${c(PALETTE.accent, `${i + 1}.`)} ${c(PALETTE.secondary, truncatePlain(st, innerW - 4))}`, modalW, modalBg));
            });
          }

          let cursorRow = 0;
          let cursorCol = 3;
          config.fields.forEach((f, idx) => {
            lines.push(paintSurfaceLine("", modalW, modalBg));
            lines.push(paintSurfaceLine(`  ${c(idx === activeIdx ? PALETTE.text + PALETTE.bold : PALETTE.muted, f.label)}`, modalW, modalBg));
            const raw = values[f.id] ?? "";
            const shown = f.secret ? "•".repeat(raw.length) : raw;
            const txt = shown ? c(PALETTE.text, truncatePlain(shown, innerW - 4)) : c(PALETTE.muted, truncatePlain(f.placeholder ?? "", innerW - 4));
            if (idx === activeIdx) {
              cursorRow = lines.length;
              cursorCol = 3 + Math.min(shown.length, innerW - 4);
              lines.push(`${c(PALETTE.accent, "┃")}${paintSurfaceLine(`  ${txt}`, modalW - 1, PALETTE.surfaceActiveBg)}`);
            } else {
              lines.push(paintSurfaceLine(`  ${txt}`, modalW, modalBg));
            }
          });

          if (errorMsg) {
            lines.push(paintSurfaceLine("", modalW, modalBg));
            lines.push(paintSurfaceLine(`  ${c(PALETTE.danger, truncatePlain(errorMsg, innerW))}`, modalW, modalBg));
          } else if (config.callout) {
            lines.push(paintSurfaceLine("", modalW, modalBg));
            lines.push(paintSurfaceLine(`  ${c(PALETTE.muted, truncatePlain(config.callout, innerW))}`, modalW, modalBg));
          }
          lines.push(paintSurfaceLine("", modalW, modalBg));
          lines.push(paintSurfaceLine(`  ${c(PALETTE.muted, config.footerHints ?? "tab/↑↓ switch field · enter next/submit · esc cancel")}`, modalW, modalBg));
          lines.push(paintSurfaceLine("", modalW, modalBg));
          return { lines, width: modalW, cursorRow, cursorCol, onCancel: () => closeOverlay({ action: "cancel" }) };
        };

        this.overlayKeyHandler = (str: string, key: readline.Key = {}) => {
          if (key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d"))) {
            closeOverlay({ action: "cancel" });
            return;
          }
          if (key.name === "tab" || key.name === "down") {
            activeIdx = (activeIdx + 1) % config.fields.length;
            this.render();
            return;
          }
          if (key.name === "up") {
            activeIdx = (activeIdx - 1 + config.fields.length) % config.fields.length;
            this.render();
            return;
          }
          const field = config.fields[activeIdx];
          if (key.name === "return" || key.name === "enter") {
            const val = (values[field.id] ?? "").trim();
            const err = field.validate?.(val);
            if (err) {
              errorMsg = err;
              this.render();
              return;
            }
            if (activeIdx < config.fields.length - 1) {
              activeIdx++;
              errorMsg = "";
              this.render();
              return;
            }
            const trimmed: Record<string, string> = {};
            for (const f of config.fields) trimmed[f.id] = (values[f.id] ?? "").trim();
            closeOverlay({ action: "submit", values: trimmed });
            return;
          }
          if (key.name === "backspace") {
            const cur = values[field.id] ?? "";
            if (cur.length > 0) {
              values[field.id] = cur.slice(0, -1);
              errorMsg = "";
              this.render();
            }
            return;
          }
          if (key.ctrl && key.name === "u") {
            values[field.id] = "";
            errorMsg = "";
            this.render();
            return;
          }
          if (str && !key.ctrl && !key.meta && /^[\x20-\x7e]+$/.test(str)) {
            values[field.id] = (values[field.id] ?? "") + str;
            errorMsg = "";
            this.render();
          }
        };

        this.render();
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

      if (this.fullScreenActive) {
        let selectedIndex = 0;
        const closeOverlay = (confirmed: boolean) => {
          this.overlayRender = null;
          this.overlayKeyHandler = null;
          this.render();
          resolve({ confirmed });
        };

        this.overlayRender = () => {
          const { cols } = this.screen.size;
          const modalW = Math.min(56, Math.max(44, cols - 6));
          const rendered = renderOpenCodeModal({
            title: config.title,
            width: modalW,
            searchable: false,
            options: [
              { value: "no", label: config.cancelLabel ?? "Cancel", badge: "n" },
              {
                value: "yes",
                label: config.confirmLabel ?? "Confirm",
                badge: "y",
                badgeColor: config.danger ? PALETTE.danger : PALETTE.success,
              },
            ],
            selectedIndex,
            footerPanel: [c(PALETTE.secondary, config.message)],
            footerHint: "↑↓/←→ choose · enter/click confirm · esc cancel",
          });
          return {
            lines: rendered.lines,
            width: modalW,
            optionRowOffsets: rendered.optionRowOffsets,
            onClickOption: (optIdx: number) => closeOverlay(optIdx === 1),
            onCancel: () => closeOverlay(false),
          };
        };

        this.overlayKeyHandler = (str: string, key: readline.Key = {}) => {
          if (key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d")) || str.toLowerCase() === "n") {
            closeOverlay(false);
            return;
          }
          if (str.toLowerCase() === "y") {
            closeOverlay(true);
            return;
          }
          if (key.name === "up" || key.name === "down" || key.name === "left" || key.name === "right" || key.name === "tab") {
            selectedIndex = selectedIndex === 0 ? 1 : 0;
            this.render();
            return;
          }
          if (key.name === "return" || key.name === "enter") {
            closeOverlay(selectedIndex === 1);
          }
        };

        this.render();
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

      // 2. OpenCode <leader> (Ctrl+X) chord resolution
      if (this.leader.isArmed) {
        const action = this.leader.resolveChord(s, key);
        if (action === "cancel") {
          this.drawIdleDecorations();
          return;
        }
        if (action) {
          this.triggerHotkeyFlow(origTtyWrite, () => this.dispatchKeybindAction(action));
          return;
        }
        this.drawIdleDecorations();
      }

      if (key.ctrl && key.name === "x") {
        this.leader.arm();
        this.drawIdleDecorations();
        return;
      }

      // 3. Global keyboard shortcuts (OpenCode + Yedogu)
      if (key.ctrl && (key.name === "k" || key.name === "p")) {
        this.triggerHotkeyFlow(origTtyWrite, () => this.openCommandPalette());
        return;
      }
      if (key.shift && key.name === "tab") {
        this.triggerHotkeyFlow(origTtyWrite, async () => {
          this.cycleActiveAgent(1);
        });
        return;
      }
      if (key.name === "f2") {
        this.triggerHotkeyFlow(origTtyWrite, async () => {
          this.cycleRecentModel(key.shift ? -1 : 1);
        });
        return;
      }
      if (key.ctrl && key.name === "r") {
        this.triggerHotkeyFlow(origTtyWrite, () => this.renameCurrentSession());
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
      { value: "popup:model", label: "Switch Model / Pin to Agent", description: this.engine.getEffectiveModelForAgent(activeAgent), badge: "<leader>m / F2", badgeColor: PALETTE.accentSoft, keywords: "model llm gpt claude gemini" },
      { value: "popup:reasoning", label: "Switch Reasoning Effort", description: `Current: ${this.engine.session.reasoningEffort || this.engine.config.reasoningEffort || "medium"}`, badge: "/effort · ^E", badgeColor: PALETTE.reasoning, keywords: "reasoning effort thinking none low medium high xhigh" },
      { value: "popup:agent", label: "Switch Specialist @Agent", description: `Current: @${activeAgent}`, badge: "<leader>a / S-Tab", badgeColor: PALETTE.accentSoft, keywords: "agent recon reverser web-hunter" },
      { value: "popup:theme", label: "Switch Color Theme (37 OpenCode Themes)", description: `Current: ${activeTheme.name}`, badge: "<leader>t / ^T", badgeColor: PALETTE.accentSoft, keywords: "theme color catppuccin tokyonight gruvbox nord opencode" },
      { value: "cmd:/sidebar", label: "Toggle Right Sidebar Panel", description: `Mode: ${this.sidebarMode}`, badge: "<leader>b", badgeColor: PALETTE.info, keywords: "sidebar panel layout split" },
      { value: "popup:timeline", label: "Session Timeline (Jump / Revert / Fork)", description: `${this.engine.session.messages.length} messages`, badge: "<leader>g", badgeColor: PALETTE.info, keywords: "timeline revert fork jump history" },
      { value: "cmd:/diff", label: "View Modified Files & Split/Unified Diff", description: `${this.engine.session.modifiedFiles?.length ?? 0} edited files · ${this.diffViewMode}`, badge: "<leader>d", badgeColor: PALETTE.info, keywords: "diff patch split unified edit" },
      { value: "cmd:/todos", label: "View Session # Todos Checklist", description: `${this.engine.session.todos?.length ?? 0} todos`, badge: "<leader>v", badgeColor: PALETTE.success, keywords: "todos checklist plan" },
      { value: "popup:settings", label: "TUI Settings (Sidebar, Diff View, Theme)", description: `sidebar=${this.sidebarMode} · diff=${this.diffViewMode}`, badge: "<leader>,", badgeColor: PALETTE.accentSoft, keywords: "settings preferences config" },
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
    else if (v === "popup:reasoning") await this.openReasoningPicker();
    else if (v === "popup:agent") await this.openAgentPicker();
    else if (v === "popup:theme") await this.openThemePicker();
    else if (v === "popup:channels") await this.openChannelsManager();
    else if (v === "popup:providers") await this.openProviderManager();
    else if (v === "popup:scope") await this.openScopeManager();
    else if (v === "popup:sessions") await this.openSessionPicker();
    else if (v === "popup:findings") await this.openFindingsPicker();
    else if (v === "popup:report") await this.openReportPicker();
    else if (v === "popup:timeline") await this.openTimelinePicker();
    else if (v === "popup:settings") await this.openSettingsModal();
    else if (v.startsWith("cmd:")) await this.handleSlashCommand(v.slice(4));
  }

  private async dispatchKeybindAction(action: KeybindActionId): Promise<void> {
    switch (action) {
      case "command_list":
        await this.openCommandPalette();
        break;
      case "sidebar_toggle":
        await this.handleSlashCommand("/sidebar");
        break;
      case "model_list":
        await this.openModelPicker();
        break;
      case "model_cycle_recent":
        this.cycleRecentModel(1);
        break;
      case "agent_list":
        await this.openAgentPicker();
        break;
      case "agent_cycle":
        this.cycleActiveAgent(1);
        break;
      case "theme_list":
        await this.openThemePicker();
        break;
      case "session_new":
        await this.handleSlashCommand("/new");
        break;
      case "session_list":
        await this.openSessionPicker();
        break;
      case "session_timeline":
        await this.openTimelinePicker();
        break;
      case "session_compact":
        await this.handleSlashCommand("/compact");
        break;
      case "session_export":
        await this.handleSlashCommand("/export");
        break;
      case "session_rename":
        await this.renameCurrentSession();
        break;
      case "session_fork":
        await this.handleSlashCommand("/fork");
        break;
      case "status_view":
        await this.handleSlashCommand("/status");
        break;
      case "editor_open":
        await this.handleSlashCommand("/editor");
        break;
      case "messages_undo":
        await this.handleSlashCommand("/undo");
        break;
      case "messages_redo":
        await this.handleSlashCommand("/redo");
        break;
      case "messages_copy":
        await this.handleSlashCommand("/yank");
        break;
      case "prompt_stash":
        await this.openStashPicker();
        break;
      case "diff_open":
        await this.handleSlashCommand("/diff");
        break;
      case "todos_view":
        await this.handleSlashCommand("/todos");
        break;
      case "browser_open":
        await this.handleSlashCommand("/browser");
        break;
      case "settings_open":
        await this.openSettingsModal();
        break;
      case "help_show":
        process.stdout.write(renderHelpText());
        break;
      case "app_exit":
        await this.shutdown();
        break;
    }
  }

  private cycleActiveAgent(delta: 1 | -1): void {
    const agents = this.engine.getAgents();
    if (agents.length === 0) return;
    const idx = agents.findIndex((a) => a.id === this.engine.session.activeAgent);
    const next = agents[(idx + delta + agents.length) % agents.length];
    const switched = this.engine.setActiveAgent(next.id);
    process.stdout.write(
      `\n  ${c(PALETTE.success, "✓")} Agent → ${c(PALETTE.accent + PALETTE.bold, `@${switched.id}`)} ${c(PALETTE.muted, `· ${switched.title}`)}\n`,
    );
  }

  private cycleRecentModel(delta: 1 | -1): void {
    if (this.recentModels.length <= 1) {
      const connected = this.engine.getConnectedProviders();
      const allModels = connected.flatMap((p) => p.models.map((m) => `${p.id}/${m.id}`));
      for (const m of allModels.slice(0, 6)) {
        if (!this.recentModels.includes(m)) this.recentModels.push(m);
      }
    }
    if (this.recentModels.length === 0) return;
    const cur = this.engine.session.activeModel;
    const idx = this.recentModels.indexOf(cur);
    const next = this.recentModels[(Math.max(0, idx) + delta + this.recentModels.length) % this.recentModels.length];
    this.engine.setModel(next);
    process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Model → ${c(PALETTE.text + PALETTE.bold, next)}\n`);
  }

  private async renameCurrentSession(): Promise<void> {
    const inp = await this.runInputModal({
      title: "Rename Session",
      subtitle: this.engine.session.id,
      initialValue: this.engine.session.name,
      placeholder: "Enter new session name…",
      validate: (v) => (!v.trim() ? "Session name cannot be empty." : null),
    });
    if (inp.action !== "submit") return;
    this.engine.updateSession(this.engine.session.id, { name: inp.value.trim() });
    process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Session renamed to ${c(PALETTE.text + PALETTE.bold, inp.value.trim())}\n`);
  }

  private async openTimelinePicker(): Promise<void> {
    const msgs = this.engine.session.messages;
    if (msgs.length === 0) {
      process.stdout.write(`\n  ${c(PALETTE.muted, "· No messages in session timeline yet.")}\n`);
      return;
    }
    const options: SelectOption<number>[] = msgs.map((m, idx) => ({
      value: idx,
      label: `${m.role === "user" ? "❯" : "✦"} ${truncatePlain(m.content.replace(/\s+/g, " "), 46)}`,
      description: `${m.agentId ? `@${m.agentId} · ` : ""}${m.timestamp.slice(11, 19)}`,
      badge: `#${idx + 1}`,
      badgeColor: m.role === "user" ? PALETTE.accent : PALETTE.info,
    }));
    const res = await this.runSelectModal({
      title: "Session Timeline",
      subtitle: `${msgs.length} messages`,
      placeholder: "Search messages…",
      options,
    });
    if (res.action !== "select") return;
    const msgIdx = res.value;
    const act = await this.runSelectModal({
      title: `Message #${msgIdx + 1} Actions`,
      subtitle: msgs[msgIdx].role,
      searchable: false,
      options: [
        { value: "copy", label: "Copy Message to Clipboard", description: "Copy via OSC 52 & system clipboard", badge: "y" },
        { value: "fork", label: "Fork Session From Here", description: "Branch a new session up to this message", badge: "f", badgeColor: PALETTE.info },
        { value: "revert", label: "Revert Session To Here", description: "Truncate messages after this point (undoable)", badge: "u", badgeColor: PALETTE.warning },
      ],
    });
    if (act.action !== "select") return;
    if (act.value === "copy") {
      this.copyTextToClipboard(msgs[msgIdx].content);
    } else if (act.value === "fork") {
      const forkedName = `${this.engine.session.name || "Session"} (fork #${msgIdx + 1})`;
      const snapshot = structuredClone(msgs.slice(0, msgIdx + 1));
      const newSess = this.engine.newSession(forkedName);
      newSess.parentSessionId = this.engine.session.id;
      newSess.messages = snapshot;
      process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Forked into ${c(PALETTE.info, newSess.id)} (${snapshot.length} msgs)\n`);
    } else if (act.value === "revert") {
      this.undoStack.push(structuredClone(this.engine.session.messages));
      this.redoStack = [];
      this.engine.session.messages = msgs.slice(0, msgIdx + 1);
      process.stdout.write(`\n  ${c(PALETTE.warning, "✓")} Reverted timeline to message #${msgIdx + 1} (/redo to restore)\n`);
    }
  }

  private async openStashPicker(): Promise<void> {
    this.engine.session.stashedPrompts ??= [];
    const stashes = this.engine.session.stashedPrompts;
    const options: SelectOption<string>[] = [
      { value: "__save__", label: "+ Stash Current Input / New Draft", description: "Save a draft prompt for later", badge: "save", badgeColor: PALETTE.accent },
      ...stashes.map((s, i) => ({
        value: `pop:${i}`,
        label: truncatePlain(s.replace(/\s+/g, " "), 52),
        description: `Stash #${i + 1}`,
        badge: "pop",
        badgeColor: PALETTE.info,
      })),
    ];
    const res = await this.runSelectModal({
      title: "Prompt Stash",
      subtitle: `${stashes.length} saved`,
      options,
    });
    if (res.action !== "select") return;
    if (res.value === "__save__") {
      const inp = await this.runInputModal({
        title: "Stash Draft Prompt",
        placeholder: "Enter prompt text to stash…",
        validate: (v) => (!v.trim() ? "Cannot stash empty prompt." : null),
      });
      if (inp.action === "submit") {
        stashes.unshift(inp.value);
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Stashed prompt (${stashes.length} total)\n`);
      }
    } else if (res.value.startsWith("pop:")) {
      const idx = Number(res.value.slice(4));
      const [popped] = stashes.splice(idx, 1);
      if (popped) {
        process.stdout.write(`\n  ${c(PALETTE.info, "→")} Popped stash:\n  ${c(PALETTE.text, popped)}\n`);
      }
    }
  }

  private async openSettingsModal(): Promise<void> {
    const res = await this.runSelectModal({
      title: "TUI Settings",
      subtitle: "OpenCode-style Preferences",
      searchable: false,
      options: [
        { value: "sidebar", label: "Sidebar Mode", description: `Current: ${this.sidebarMode} (auto shows at >120 cols)`, badge: this.sidebarMode, badgeColor: PALETTE.info },
        { value: "diff", label: "Diff View Mode", description: `Current: ${this.diffViewMode} (auto splits at >120 cols)`, badge: this.diffViewMode, badgeColor: PALETTE.accent },
        { value: "theme", label: "Color Theme", description: `Current: ${getActiveTheme().name}`, badge: getActiveTheme().id, badgeColor: PALETTE.accentSoft },
      ],
    });
    if (res.action !== "select") return;
    if (res.value === "sidebar") {
      const order: Array<"auto" | "show" | "hide"> = ["auto", "show", "hide"];
      this.sidebarMode = order[(order.indexOf(this.sidebarMode) + 1) % order.length];
      process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Sidebar mode → ${c(PALETTE.text + PALETTE.bold, this.sidebarMode)}\n`);
    } else if (res.value === "diff") {
      const order: Array<"auto" | "split" | "unified"> = ["auto", "split", "unified"];
      this.diffViewMode = order[(order.indexOf(this.diffViewMode) + 1) % order.length];
      process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Diff view mode → ${c(PALETTE.text + PALETTE.bold, this.diffViewMode)}\n`);
    } else if (res.value === "theme") {
      await this.openThemePicker();
    }
  }

  private copyTextToClipboard(text: string): void {
    if (process.stdout.isTTY) {
      process.stdout.write(osc52Copy(text));
    }
    try {
      if (process.platform === "win32") {
        spawnSync("clip", { input: text, encoding: "utf8" });
      } else if (process.platform === "darwin") {
        spawnSync("pbcopy", { input: text, encoding: "utf8" });
      } else {
        spawnSync("xclip", ["-selection", "clipboard"], { input: text, encoding: "utf8" });
      }
    } catch {
      // OSC 52 already sent
    }
    process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Copied ${c(PALETTE.muted, `${text.length} chars`)} to clipboard\n`);
  }

  private async openReasoningPicker(): Promise<void> {
    const current = (this.engine.session.reasoningEffort || this.engine.config.reasoningEffort || "medium") as ReasoningEffort;
    const levels: Array<{ id: ReasoningEffort; label: string; desc: string }> = [
      { id: "none", label: "None (Off)", desc: "No extended thinking — lowest latency" },
      { id: "low", label: "Low", desc: "Fastest responses with minimal reasoning overhead" },
      { id: "medium", label: "Medium", desc: "Balanced speed and reasoning quality (default)" },
      { id: "high", label: "High", desc: "Deeper reasoning for complex analysis & exploitation" },
      { id: "xhigh", label: "Extra High (xhigh)", desc: "Maximum reasoning depth for reverse engineering" },
    ];
    const res = await this.runSelectModal<ReasoningEffort>({
      title: "Select Reasoning Effort",
      subtitle: this.engine.session.activeModel,
      searchable: false,
      options: levels.map((l) => ({
        value: l.id,
        label: l.label,
        description: l.desc,
        badge: l.id === current ? "active" : l.id,
        badgeColor: l.id === current ? PALETTE.success : PALETTE.muted,
        active: l.id === current,
        checked: l.id === current,
      })),
      footerHints: "↑↓ move · ↵ set reasoning effort · esc close",
    });
    if (res.action !== "select") return;
    const applied = this.engine.setReasoningEffort(res.value);
    this.emitOut(`\n  ${c(PALETTE.success, "✓")} Reasoning effort → ${c(PALETTE.reasoning + PALETTE.bold, applied)}\n`);
  }

  private async openModelPicker(initialProviderFilter = "all"): Promise<void> {
    const activeAgent = this.engine.session.activeAgent;
    let pinToAgent = false;
    let providerFilter = initialProviderFilter;

    const runRefreshWithSpinner = async (label: string): Promise<void> => {
      if (this.fullScreenActive) {
        this.startSpinnerFs(label);
        try {
          await this.engine.refreshProviderModels();
        } finally {
          this.stopSpinnerFs();
        }
      } else {
        const spin = new TerminalSpinner();
        spin.start(label);
        try {
          await this.engine.refreshProviderModels();
        } finally {
          spin.stop();
        }
      }
    };

    const initialConnected = this.engine.getConnectedProviders();
    if (initialConnected.length === 0) {
      // Probe local Ollama once before concluding no providers are connected (matches WebUI)
      await runRefreshWithSpinner("Checking connected providers & local runtimes");
    }

    if (this.engine.getConnectedProviders().length === 0) {
      process.stdout.write(
        `\n  ${c(PALETTE.warning, "!")} ${c(PALETTE.text, "No providers connected yet.")} ${c(PALETTE.muted, "Connect a provider first with /connect or /login.")}\n`,
      );
      await this.openProviderManager();
      return;
    }

    // Lazily fetch live models for any connected provider not yet synced
    const needsSync = this.engine.getConnectedProviders().some((p) => !this.engine.hasLiveModelsCached(p.id));
    if (needsSync) {
      await runRefreshWithSpinner("Syncing models from connected providers");
    }

    const EFFORT_DESCRIPTIONS: Record<string, string> = {
      none: "No extended thinking — lowest latency",
      low: "Fastest responses with minimal reasoning overhead",
      medium: "Balanced speed and reasoning quality for most tasks",
      high: "Deeper reasoning for complex analysis and debugging",
      xhigh: "Maximum reasoning depth for the hardest problems",
      max: "Maximum reasoning budget and thoroughness",
    };

    const EFFORT_SHORT: Record<string, string> = {
      none: "Off",
      low: "Low",
      medium: "Med",
      high: "High",
      xhigh: "Extra",
      max: "Max",
    };

    type PickerItem =
      | { kind: "model"; group: GroupedModelEntry }
      | { kind: "action"; action: "refresh" | "providers" };

    // Track chosen effort/variant index per model group
    const variantState = new Map<string, number>();
    const effortState = new Map<string, ReasoningEffort>();

    const getEffortLevelsForGroup = (g: GroupedModelEntry): ReasoningEffort[] => {
      const primary = g.variants[0]?.model;
      if (primary?.reasoningLevels && primary.reasoningLevels.length > 1) {
        return primary.reasoningLevels;
      }
      const inferred = primary ? inferReasoningLevels(g.provider.id, primary.id, primary.supportsReasoning) : undefined;
      if (inferred && inferred.length > 1) return inferred;
      return primary?.supportsReasoning ? ["low", "medium", "high"] : ["none", "low", "medium", "high"];
    };

    const initStates = (groups: GroupedModelEntry[], currentTarget: string): void => {
      const curEffort = (this.engine.session.reasoningEffort || this.engine.config.reasoningEffort || "medium") as ReasoningEffort;
      for (const g of groups) {
        if (!variantState.has(g.key)) {
          const activeIdx = g.variants.findIndex((v) => v.spec === currentTarget);
          if (activeIdx !== -1) {
            variantState.set(g.key, activeIdx);
          } else {
            const medIdx = g.variants.findIndex((v) => v.label === "medium");
            variantState.set(g.key, medIdx !== -1 ? medIdx : 0);
          }
        }
        if (!effortState.has(g.key)) {
          const levels = getEffortLevelsForGroup(g);
          effortState.set(g.key, levels.includes(curEffort) ? curEffort : levels[Math.min(1, levels.length - 1)]);
        }
      }
    };

    while (true) {
      const connectedProviders = this.engine.getConnectedProviders();
      if (providerFilter !== "all" && !connectedProviders.some((p) => p.id === providerFilter)) {
        providerFilter = "all";
      }
      const filterOrder = ["all", ...connectedProviders.map((p) => p.id)];

      const buildSubtitle = (): string => {
        const filterLabel =
          providerFilter === "all"
            ? `All (${connectedProviders.length})`
            : connectedProviders.find((p) => p.id === providerFilter)?.name || providerFilter;
        return `${filterLabel} · ${pinToAgent ? `Pin → @${activeAgent}` : "Default"}`;
      };

      const buildModelOptions = (): SelectOption<PickerItem>[] => {
        const currentTarget = pinToAgent
          ? this.engine.getEffectiveModelForAgent(activeAgent)
          : this.engine.session.activeModel;
        const curProviders = this.engine.getConnectedProviders();
        const favs = new Set(this.engine.getFavoriteModels());
        let groups = groupModelsForPicker(curProviders);
        initStates(groups, currentTarget);

        if (providerFilter !== "all") {
          groups = groups.filter((g) => g.provider.id === providerFilter);
        }

        // Sort favorites first (preserving provider grouping order within non-favorites, matching WebUI)
        groups.sort((a, b) => {
          const af = favs.has(a.key) ? 0 : 1;
          const bf = favs.has(b.key) ? 0 : 1;
          return af - bf;
        });

        const modelOpts: SelectOption<PickerItem>[] = groups.map((g) => {
          const isCurrent = g.variants.some((v) => v.spec === currentTarget);
          const isFav = favs.has(g.key);
          const curEffort = g.variants.length > 1
            ? g.variants[Math.max(0, Math.min(variantState.get(g.key) ?? 0, g.variants.length - 1))]?.label
            : effortState.get(g.key);
          const effTag = curEffort ? (EFFORT_SHORT[curEffort] || curEffort) : "";
          const badgeText = isCurrent
            ? `● ${effTag || "active"}`
            : effTag
              ? `${effTag} · ${g.provider.id}`
              : g.provider.id;
          const badgeColor = isCurrent ? PALETTE.accent : PALETTE.muted;
          const allIds = g.variants.map((v) => `${v.spec} ${v.label} ${v.model.name}`).join(" ");
          return {
            value: { kind: "model", group: g },
            label: `${isFav ? "★ " : ""}${g.displayName}`,
            badge: badgeText,
            badgeColor,
            active: isCurrent,
            checked: isCurrent,
            category: isFav ? "★ Favorites" : g.provider.name,
            keywords: `${g.provider.id} ${g.provider.name} ${g.displayName} ${allIds}${isFav ? " favorite star pinned" : ""}`,
          };
        });

        modelOpts.push(
          {
            value: { kind: "action", action: "refresh" },
            label: "↻ Refresh / Sync Live Models",
            description: "Fetch latest models from all connected providers",
            badge: "^R",
            badgeColor: PALETTE.info,
            category: "Actions",
            keywords: "refresh sync reload live models",
          },
          {
            value: { kind: "action", action: "providers" },
            label: "+ Connect / Manage Providers & Custom Endpoints",
            description: "Add API keys, CLI logins, or custom URLs",
            badge: "^A",
            badgeColor: PALETTE.accent,
            category: "Actions",
            keywords: "connect manage provider custom endpoint add",
          },
        );
        return modelOpts;
      };

      const renderEffortPanel = (
        selected: SelectOption<PickerItem> | undefined,
        innerWidth: number,
      ): string[] => {
        // Provider filter pills row (matching WebUI's provider rail)
        const pills = filterOrder
          .slice(0, 7)
          .map((pid) => {
            const label = pid === "all" ? "All" : pid;
            return pid === providerFilter
              ? c(PALETTE.accent + PALETTE.bold, `[${label}]`)
              : c(PALETTE.muted, label);
          })
          .join("  ");
        const filterLine = `  ${c(PALETTE.muted, "Filter")}  ${pills}${filterOrder.length > 7 ? c(PALETTE.muted, ` +${filterOrder.length - 7}`) : ""}  ${c(PALETTE.muted, "(^F)")}`;

        if (!selected || selected.value.kind !== "model") {
          return [filterLine];
        }
        const g = selected.value.group;

        const isVariantMode = g.variants.length > 1;
        const levels = isVariantMode
          ? g.variants.map((v) => v.label)
          : getEffortLevelsForGroup(g);
        const idx = isVariantMode
          ? Math.max(0, Math.min(variantState.get(g.key) ?? 0, levels.length - 1))
          : Math.max(0, levels.indexOf(effortState.get(g.key) ?? "medium"));
        const activeLabel = levels[idx] || "medium";
        const panelTitle = isVariantMode && !g.isEffortGroup ? "Variant" : "Effort";

        const n = levels.length;
        const segLen = Math.max(4, Math.min(9, Math.floor((innerWidth - 26) / Math.max(1, n - 1))));
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

        const baseCol = prefixPlain.length;
        let cursor = 0;
        let labelsLine = "";
        for (let i = 0; i < n; i++) {
          const lbl = EFFORT_SHORT[levels[i]] || levels[i];
          const centerCol = baseCol + i * step;
          const startCol = Math.max(cursor + (i > 0 ? 1 : 0), centerCol - Math.floor(lbl.length / 2));
          if (startCol > cursor) {
            labelsLine += " ".repeat(startCol - cursor);
          }
          labelsLine += i === idx ? c(PALETTE.text + PALETTE.bold, lbl) : c(PALETTE.muted, lbl);
          cursor = startCol + lbl.length;
        }

        const primaryModel = isVariantMode ? g.variants[idx]?.model : g.variants[0]?.model;
        const ctx = primaryModel
          ? primaryModel.contextWindow >= 1_000_000
            ? `${(primaryModel.contextWindow / 1_000_000).toFixed(0)}M`
            : `${Math.round(primaryModel.contextWindow / 1000)}k`
          : "";
        const descText =
          EFFORT_DESCRIPTIONS[activeLabel] ||
          `${g.provider.name}${ctx ? ` · ${ctx} ctx` : ""}`;
        const descPad = " ".repeat(Math.max(2, Math.min(10, baseCol - 4)));
        const descLine = `${descPad}${c(PALETTE.muted, `${descText}${ctx ? ` · ${ctx} ctx` : ""}`)}`;

        return [filterLine, trackLine, labelsLine, descLine];
      };

      const initialOptions = buildModelOptions();
      const initialIdx = Math.max(
        0,
        initialOptions.findIndex((o) => o.active),
      );

      const res = await this.runSelectModal<PickerItem>({
        title: "Switch Model",
        subtitle: buildSubtitle(),
        placeholder: "Search models or providers…",
        options: initialOptions,
        initialIndex: initialIdx,
        width: 78,
        footerHints: "↑↓ move · ←→ effort · ^F provider · ^S star · ^R sync · tab pin · ↵ select",
        onLeftRight: (delta, selected) => {
          if (!selected || selected.value.kind !== "model") return;
          const g = selected.value.group;
          if (g.variants.length > 1) {
            const cur = variantState.get(g.key) ?? 0;
            const next = Math.max(0, Math.min(g.variants.length - 1, cur + delta));
            variantState.set(g.key, next);
          } else {
            const levels = getEffortLevelsForGroup(g);
            const cur = effortState.get(g.key) ?? "medium";
            const curIdx = Math.max(0, levels.indexOf(cur));
            const nextIdx = Math.max(0, Math.min(levels.length - 1, curIdx + delta));
            effortState.set(g.key, levels[nextIdx]);
          }
          return { options: buildModelOptions() };
        },
        renderFooterPanel: renderEffortPanel,
        onTab: () => {
          pinToAgent = !pinToAgent;
          return {
            subtitle: buildSubtitle(),
            options: buildModelOptions(),
          };
        },
        onKey: (_str, key, selected) => {
          // Ctrl+F: cycle provider filter (All -> Anthropic -> OpenAI -> ...)
          if (key.ctrl && key.name === "f") {
            const curIdx = filterOrder.indexOf(providerFilter);
            providerFilter = filterOrder[(curIdx + 1) % filterOrder.length] ?? "all";
            return {
              subtitle: buildSubtitle(),
              options: buildModelOptions(),
              selectedIndex: 0,
            };
          }
          // Ctrl+S: star / unstar favorite model (synced with WebUI)
          if (key.ctrl && key.name === "s") {
            if (selected?.value.kind === "model") {
              this.engine.toggleFavoriteModel(selected.value.group.key);
              return { options: buildModelOptions() };
            }
            return true;
          }
          // Ctrl+R: trigger live model refresh
          if (key.ctrl && key.name === "r") {
            return {
              closeWith: {
                action: "select",
                value: { kind: "action", action: "refresh" },
                option: { value: { kind: "action", action: "refresh" }, label: "Refresh" },
              },
            };
          }
          // Ctrl+A: open providers / connectors manager
          if (key.ctrl && key.name === "a") {
            return {
              closeWith: {
                action: "select",
                value: { kind: "action", action: "providers" },
                option: { value: { kind: "action", action: "providers" }, label: "Providers" },
              },
            };
          }
          return false;
        },
      });

      if (res.action !== "select") return;

      if (res.value.kind === "action") {
        if (res.value.action === "refresh") {
          await runRefreshWithSpinner("Refreshing live models from connected providers");
          continue;
        }
        if (res.value.action === "providers") {
          await this.openProviderManager();
          continue;
        }
        return;
      }

      const chosenGroup = res.value.group;
      const chosenIdx = Math.max(
        0,
        Math.min(variantState.get(chosenGroup.key) ?? 0, chosenGroup.variants.length - 1),
      );
      const chosenVariant = chosenGroup.variants[chosenIdx];
      const normalized = this.engine.setModel(chosenVariant.spec, pinToAgent ? activeAgent : undefined);
      let appliedEffort: string | undefined;
      if (chosenGroup.variants.length <= 1) {
        const chosenEff = effortState.get(chosenGroup.key);
        if (chosenEff) {
          appliedEffort = this.engine.setReasoningEffort(chosenEff);
        }
      }
      if (!this.recentModels.includes(normalized)) {
        this.recentModels.unshift(normalized);
        if (this.recentModels.length > 8) this.recentModels.pop();
      }
      const effortNote =
        chosenGroup.variants.length > 1
          ? ` ${c(PALETTE.muted, `(${chosenVariant.label})`)}`
          : appliedEffort
            ? ` ${c(PALETTE.muted, `(effort: ${appliedEffort})`)}`
            : "";
      process.stdout.write(
        `\n  ${c(PALETTE.success, "✓")} ${pinToAgent ? `Pinned ${c(PALETTE.accent + PALETTE.bold, `@${activeAgent}`)}` : "Default model"} → ${c(PALETTE.text + PALETTE.bold, chosenGroup.displayName)}${effortNote} ${c(PALETTE.muted, `[${normalized}]`)}\n`,
      );
      return;
    }
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
      badge: renderThemeSwatch(t),
      badgeRaw: true,
      active: t.id === current.id,
      checked: t.id === current.id,
      keywords: `${t.id} ${t.name} ${t.vibe}`,
    }));

    const res = await this.runSelectModal({
      title: "Themes",
      subtitle: `${themes.length} themes`,
      placeholder: "Search",
      options,
      onHover: (opt) => {
        if (opt?.value) setActiveTheme(opt.value);
      },
    });
    if (res.action !== "select") {
      setActiveTheme(current.id);
      if (this.fullScreenActive) this.render();
      return;
    }

    this.applyThemeAndRedraw(res.value);
  }

  private applyThemeAndRedraw(themeId: string): void {
    const applied = setActiveTheme(themeId);
    this.engine.setTheme(applied.id);
    if (this.fullScreenActive) {
      this.render();
      return;
    }
    console.clear();
    process.stdout.write(
      renderBanner(
        this.engine.session,
        this.engine.getAgent(),
        this.engine.getProviders(),
        this.daemon.url,
        this.engine.channels.getPublicViews(),
        { sidebarMode: this.sidebarMode },
      ),
    );
    process.stdout.write(
      `  ${c(PALETTE.success, "✓")} Theme switched to ${c(PALETTE.accent + PALETTE.bold, applied.name)} ${renderThemeSwatch(applied)}\n`,
    );
  }

  private async openProviderManager(): Promise<void> {
    const popularOrder = ["anthropic", "gemini", "openai", "codex"];
    type PrvFilter = "all" | "connected" | "cloud" | "gateway" | "local" | "custom";
    const filterOrder: PrvFilter[] = ["all", "connected", "cloud", "gateway", "local", "custom"];
    const filterLabels: Record<PrvFilter, string> = {
      all: "All",
      connected: "Connected",
      cloud: "Cloud",
      gateway: "Gateways",
      local: "Local",
      custom: "Custom",
    };
    let activeFilter: PrvFilter = "all";

    const getCategory = (p: ProviderConfig): Exclude<PrvFilter, "all" | "connected"> => {
      if (p.custom) return "custom";
      if (p.local) return "local";
      if (p.id === "openrouter" || p.id === "groq") return "gateway";
      return "cloud";
    };

    type ProviderHubItem =
      | { kind: "provider"; provider: ProviderConfig }
      | { kind: "add_custom" }
      | { kind: "refresh_all" }
      | { kind: "agent_routing" };

    while (true) {
      const allProviders = [...this.engine.getProviders()].sort((a, b) => {
        const ac = isProviderConnected(a);
        const bc = isProviderConnected(b);
        if (ac !== bc) return ac ? -1 : 1;
        if (a.custom && !b.custom) return -1;
        if (!a.custom && b.custom) return 1;
        const ia = popularOrder.indexOf(a.id);
        const ib = popularOrder.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
      const connectedCount = allProviders.filter(isProviderConnected).length;
      const totalModels = allProviders
        .filter(isProviderConnected)
        .reduce((sum, p) => sum + p.models.length, 0);

      const buildOptions = (): SelectOption<ProviderHubItem>[] => {
        const filteredProviders = allProviders.filter((p) => {
          if (activeFilter === "all") return true;
          if (activeFilter === "connected") return isProviderConnected(p);
          return getCategory(p) === activeFilter;
        });

        return [
          {
            value: { kind: "add_custom" },
            label: "+ Add Custom Provider / Preset…",
            description: "OpenAI / Anthropic / Gemini compatible endpoint + auto-probe",
            badge: "Custom",
            badgeColor: PALETTE.accent,
            category: "Actions",
            keywords: "add custom provider url vllm litellm ollama together openrouter lmstudio azure",
          },
          {
            value: { kind: "refresh_all" },
            label: "↻ Refresh / Sync All Live Models",
            description: `${connectedCount} connected · ${totalModels} available models`,
            badge: "^R",
            badgeColor: PALETTE.info,
            category: "Actions",
            keywords: "refresh sync reload models live",
          },
          {
            value: { kind: "agent_routing" },
            label: "⇄ Per-Agent Model Routing",
            description: "Pin specific models to specialist @agents",
            badge: "Routing",
            badgeColor: PALETTE.accentSoft,
            category: "Actions",
            keywords: "agent routing pin model specialist commander recon reverser",
          },
          ...filteredProviders.map((p) => {
            const connected = isProviderConnected(p);
            const meta = this.engine.getProviderLiveMeta(p.id);
            const isPopular = popularOrder.includes(p.id);
            const modelNames = p.models.slice(0, 3).map((m) => m.name).join(", ");
            const badge = connected
              ? meta && !meta.live && meta.error
                ? "⚠ err"
                : `${p.authSource === "config" || p.authSource === "env" ? "API key" : p.authSource || "live"} · ${p.models.length}`
              : p.local
                ? "local"
                : "connect";
            return {
              value: { kind: "provider", provider: p } as ProviderHubItem,
              label: p.name,
              description: modelNames || `${p.protocol} · ${p.baseUrl}`,
              badge,
              badgeColor: connected
                ? meta && !meta.live && meta.error
                  ? PALETTE.danger
                  : PALETTE.success
                : PALETTE.muted,
              active: connected,
              checked: connected,
              category: connected
                ? "Connected"
                : p.custom
                  ? "Custom"
                  : isPopular
                    ? "Popular"
                    : getCategory(p) === "local"
                      ? "Local"
                      : getCategory(p) === "gateway"
                        ? "Gateways"
                        : "Cloud",
              keywords: `${p.id} ${p.name} ${p.protocol} ${p.defaultModel} ${getCategory(p)} ${p.models.map((m) => `${m.id} ${m.name}`).join(" ")}`,
            };
          }),
        ];
      };

      const renderFilterFooter = (): string[] => {
        const pills = filterOrder
          .map((f) =>
            f === activeFilter
              ? c(PALETTE.accent + PALETTE.bold, `[${filterLabels[f]}]`)
              : c(PALETTE.muted, filterLabels[f]),
          )
          .join("  ");
        return [`  ${c(PALETTE.muted, "Filter")}  ${pills}  ${c(PALETTE.muted, "(tab / ^F)")}`];
      };

      const res = await this.runSelectModal<ProviderHubItem>({
        title: "Providers & Integrations",
        subtitle: `${connectedCount}/${allProviders.length} connected · ${totalModels} models · ${filterLabels[activeFilter]}`,
        placeholder: "Search providers or models…",
        options: buildOptions(),
        width: 78,
        footerHints: "↑↓ move · tab/^F filter · ^R sync all · ↵ manage · esc close",
        renderFooterPanel: renderFilterFooter,
        onTab: () => {
          const idx = filterOrder.indexOf(activeFilter);
          activeFilter = filterOrder[(idx + 1) % filterOrder.length] ?? "all";
          return {
            subtitle: `${connectedCount}/${allProviders.length} connected · ${totalModels} models · ${filterLabels[activeFilter]}`,
            options: buildOptions(),
          };
        },
        onKey: (_str, key) => {
          if (key.ctrl && key.name === "f") {
            const idx = filterOrder.indexOf(activeFilter);
            activeFilter = filterOrder[(idx + 1) % filterOrder.length] ?? "all";
            return {
              subtitle: `${connectedCount}/${allProviders.length} connected · ${totalModels} models · ${filterLabels[activeFilter]}`,
              options: buildOptions(),
            };
          }
          if (key.ctrl && key.name === "r") {
            return {
              closeWith: {
                action: "select",
                value: { kind: "refresh_all" },
                option: { value: { kind: "refresh_all" }, label: "Refresh All" },
              },
            };
          }
          return false;
        },
      });
      if (res.action !== "select") return;
      if (res.value.kind === "add_custom") {
        await this.openCustomProviderFormModal();
        continue;
      }
      if (res.value.kind === "refresh_all") {
        if (this.fullScreenActive) {
          this.startSpinnerFs("Syncing live models for all connected providers");
          try {
            await this.engine.refreshProviderModels();
          } finally {
            this.stopSpinnerFs();
          }
        } else {
          const spin = new TerminalSpinner();
          spin.start("Syncing live models for all connected providers");
          try {
            await this.engine.refreshProviderModels();
          } finally {
            spin.stop();
          }
        }
        continue;
      }
      if (res.value.kind === "agent_routing") {
        await this.openAgentRoutingManager();
        continue;
      }
      const outcome = await this.openConnectKeyModal(res.value.provider, true);
      if (outcome !== "back") return;
    }
  }

  private async openAgentRoutingManager(): Promise<void> {
    while (true) {
      const agents = this.engine.getAgents();
      const options: SelectOption<string>[] = agents.map((a) => {
        const pinned = this.engine.session.agentModels[a.id];
        const effective = this.engine.getEffectiveModelForAgent(a.id);
        return {
          value: a.id,
          label: `@${a.id}`,
          description: a.title,
          badge: pinned ? `📌 ${truncatePlain(pinned, 24)}` : `default (${truncatePlain(effective, 18)})`,
          badgeColor: pinned ? PALETTE.accent : PALETTE.muted,
          active: Boolean(pinned),
          checked: Boolean(pinned),
          keywords: `${a.id} ${a.title} ${effective}`,
        };
      });

      const res = await this.runSelectModal({
        title: "Per-Agent Model Routing",
        subtitle: `${agents.length} specialist agents`,
        placeholder: "Pick an agent to pin or reset its model…",
        options,
        footerHints: "↑↓ pick agent · ↵ pin model · esc back",
      });
      if (res.action !== "select") return;

      const agentId = res.value;
      const connected = this.engine.getConnectedProviders();
      const groups = groupModelsForPicker(connected);
      const currentPin = this.engine.session.agentModels[agentId] || "";
      const modelOptions: SelectOption<string>[] = [
        {
          value: "__default__",
          label: `Use Global Default (${this.engine.session.activeModel})`,
          description: "Clear per-agent override",
          badge: !currentPin ? "active" : "reset",
          badgeColor: !currentPin ? PALETTE.success : PALETTE.muted,
          active: !currentPin,
          checked: !currentPin,
          category: "Default",
        },
        ...groups.flatMap((g) =>
          g.variants.map((v) => ({
            value: v.spec,
            label: g.variants.length > 1 ? `${g.displayName} (${v.label})` : g.displayName,
            description: v.spec,
            badge: v.spec === currentPin ? "pinned" : g.provider.id,
            badgeColor: v.spec === currentPin ? PALETTE.accent : PALETTE.muted,
            active: v.spec === currentPin,
            checked: v.spec === currentPin,
            category: g.provider.name,
            keywords: `${g.provider.id} ${g.provider.name} ${g.displayName} ${v.spec}`,
          })),
        ),
      ];

      const picked = await this.runSelectModal({
        title: `Pin Model → @${agentId}`,
        subtitle: currentPin || "Default",
        placeholder: "Search connected models…",
        options: modelOptions,
        footerHints: "↑↓ move · ↵ pin · esc back",
      });
      if (picked.action !== "select") continue;

      if (picked.value === "__default__") {
        this.engine.clearAgentModel(agentId);
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Reset ${c(PALETTE.accent, `@${agentId}`)} to global default model.\n`);
      } else {
        const normalized = this.engine.setModel(picked.value, agentId);
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Pinned ${c(PALETTE.accent, `@${agentId}`)} → ${c(PALETTE.text + PALETTE.bold, normalized)}\n`);
      }
    }
  }

  private async openCustomProviderFormModal(existing?: ProviderConfig): Promise<boolean> {
    let preset: {
      id: string;
      name: string;
      protocol: ProviderProtocol;
      baseUrl: string;
      model: string;
    } | undefined;

    if (!existing) {
      const presets: Array<{
        key: string;
        label: string;
        desc: string;
        data?: { id: string; name: string; protocol: ProviderProtocol; baseUrl: string; model: string };
      }> = [
        { key: "blank", label: "Custom Endpoint (Blank)", desc: "Enter any OpenAI / Anthropic / Gemini compatible URL" },
        {
          key: "openrouter",
          label: "Preset: OpenRouter Custom",
          desc: "https://openrouter.ai/api/v1 · anthropic/claude-sonnet-4-6",
          data: { id: "custom-openrouter", name: "OpenRouter Custom", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-sonnet-4-6" },
        },
        {
          key: "together",
          label: "Preset: Together AI",
          desc: "https://api.together.xyz/v1 · Llama 3.3 70B",
          data: { id: "together", name: "Together AI", protocol: "openai", baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
        },
        {
          key: "vllm",
          label: "Preset: vLLM Local",
          desc: "http://127.0.0.1:8000/v1 · auto-probe models",
          data: { id: "vllm", name: "vLLM Local", protocol: "openai", baseUrl: "http://127.0.0.1:8000/v1", model: "" },
        },
        {
          key: "litellm",
          label: "Preset: LiteLLM Proxy",
          desc: "http://127.0.0.1:4000/v1 · gpt-4o",
          data: { id: "litellm", name: "LiteLLM Proxy", protocol: "openai", baseUrl: "http://127.0.0.1:4000/v1", model: "gpt-4o" },
        },
        {
          key: "lmstudio",
          label: "Preset: LM Studio Custom",
          desc: "http://127.0.0.1:1234/v1 · auto-probe models",
          data: { id: "lmstudio-custom", name: "LM Studio Custom", protocol: "openai", baseUrl: "http://127.0.0.1:1234/v1", model: "" },
        },
      ];
      const pick = await this.runSelectModal({
        title: "Add Custom Provider",
        subtitle: "Choose a preset or blank",
        placeholder: "Filter presets…",
        options: presets.map((pr) => ({
          value: pr,
          label: pr.label,
          description: pr.desc,
          badge: pr.data ? pr.data.protocol : "custom",
          badgeColor: pr.data ? PALETTE.info : PALETTE.accent,
          keywords: `${pr.key} ${pr.label} ${pr.desc}`,
        })),
        footerHints: "↑↓ choose preset · ↵ continue · esc back",
      });
      if (pick.action !== "select") return false;
      preset = pick.value.data;
    }

    const existingExtra = existing
      ? existing.models
          .filter((m) => m.id !== existing.defaultModel)
          .map((m) => m.id)
          .join(", ")
      : "";
    const form = await this.runFormModal({
      title: existing ? `Edit Custom Provider (${existing.id})` : "Add Custom Provider",
      subtitle: "OpenAI / Anthropic / Gemini",
      steps: [
        "Enter a short provider ID (e.g. `litellm`, `vllm`, `together`) and protocol (`openai`, `anthropic`, or `gemini`)",
        "Provide Base URL and optional API Key — leave Default Model blank to auto-probe live models",
      ],
      callout: "API Key is optional for local endpoints (vLLM / LM Studio / Ollama). Models are auto-probed on save.",
      fields: existing
        ? [
            { id: "name", label: "Display Name", initialValue: existing.name, placeholder: "My Custom Provider", validate: (v) => (!v ? "Enter a name." : null) },
            { id: "protocol", label: "Protocol (openai | anthropic | gemini)", initialValue: existing.protocol, placeholder: "openai", validate: (v) => (!["openai", "anthropic", "gemini"].includes(v.toLowerCase()) ? "Must be openai, anthropic, or gemini." : null) },
            { id: "baseUrl", label: "Base URL", initialValue: existing.baseUrl, placeholder: "https://api.example.com/v1", validate: (v) => (!/^https?:\/\//i.test(v) ? "Enter a valid http(s) URL." : null) },
            { id: "apiKey", label: "API Key (leave blank to keep existing)", placeholder: "Optional", secret: true },
            { id: "defaultModel", label: "Default Model ID (leave blank to auto-probe)", initialValue: existing.defaultModel, placeholder: "Auto-probe or enter model ID" },
            { id: "models", label: "Additional Models (comma-separated, optional)", initialValue: existingExtra, placeholder: "model-a, model-b" },
          ]
        : [
            { id: "id", label: "Provider ID", initialValue: preset?.id ?? "", placeholder: "my-vllm", validate: (v) => (!/^[a-z0-9_-]{2,}$/i.test(v) ? "Use 2+ alphanumeric, dash, or underscore chars." : null) },
            { id: "name", label: "Display Name", initialValue: preset?.name ?? "", placeholder: "My Custom Endpoint", validate: (v) => (!v ? "Enter a display name." : null) },
            { id: "protocol", label: "Protocol (openai | anthropic | gemini)", initialValue: preset?.protocol ?? "openai", placeholder: "openai", validate: (v) => (!["openai", "anthropic", "gemini"].includes(v.toLowerCase()) ? "Must be openai, anthropic, or gemini." : null) },
            { id: "baseUrl", label: "Base URL", initialValue: preset?.baseUrl ?? "", placeholder: "https://api.example.com/v1", validate: (v) => (!/^https?:\/\//i.test(v) ? "Enter a valid http(s) URL." : null) },
            { id: "apiKey", label: "API Key (optional for local)", placeholder: "sk-... (leave blank if none)", secret: true },
            { id: "defaultModel", label: "Default Model ID (leave blank to auto-probe)", initialValue: preset?.model ?? "", placeholder: "Leave blank to probe /models automatically" },
            { id: "models", label: "Additional Models (comma-separated, optional)", placeholder: "model-a, model-b" },
          ],
    });
    if (form.action !== "submit") return false;
    const proto = form.values.protocol.toLowerCase() as ProviderProtocol;
    let defaultModel = (form.values.defaultModel || "").trim();
    const extraModels = (form.values.models || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Auto-probe endpoint when default model is blank (matches WebUI "Test & Fetch Models")
    if (!defaultModel) {
      let probed: { models: Array<{ id: string; name: string }>; live: boolean; error?: string };
      if (this.fullScreenActive) {
        this.startSpinnerFs(`Probing ${form.values.baseUrl} for live models`);
        try {
          probed = await probeCustomEndpointModels({
            protocol: proto,
            baseUrl: form.values.baseUrl,
            apiKey: form.values.apiKey || existing?.apiKey,
          });
        } finally {
          this.stopSpinnerFs();
        }
      } else {
        const spin = new TerminalSpinner();
        spin.start(`Probing ${form.values.baseUrl} for live models`);
        try {
          probed = await probeCustomEndpointModels({
            protocol: proto,
            baseUrl: form.values.baseUrl,
            apiKey: form.values.apiKey || existing?.apiKey,
          });
        } finally {
          spin.stop();
        }
      }

      if (probed.live && probed.models.length > 0) {
        const picked = await this.runSelectModal({
          title: "Select Default Model",
          subtitle: `${probed.models.length} live model(s) discovered`,
          placeholder: "Filter probed models…",
          options: probed.models.map((m) => ({
            value: m.id,
            label: m.name,
            description: m.id,
            badge: "live",
            badgeColor: PALETTE.success,
            keywords: `${m.id} ${m.name}`,
          })),
          footerHints: "↑↓ move · ↵ pick default model · esc use first",
        });
        defaultModel = picked.action === "select" ? picked.value : probed.models[0].id;
        for (const m of probed.models.slice(0, 12)) {
          if (m.id !== defaultModel && !extraModels.includes(m.id)) {
            extraModels.push(m.id);
          }
        }
      } else {
        defaultModel = "default";
      }
    }

    if (existing) {
      const updated = this.engine.updateCustomProvider(existing.id, {
        name: form.values.name,
        protocol: proto,
        baseUrl: form.values.baseUrl,
        apiKey: form.values.apiKey || undefined,
        defaultModel,
        models: extraModels,
      });
      await this.syncAndPrintConnectedProvider(updated);
      return true;
    }
    const created = this.engine.addCustomProvider({
      id: form.values.id,
      name: form.values.name,
      protocol: proto,
      baseUrl: form.values.baseUrl,
      apiKey: form.values.apiKey || undefined,
      defaultModel,
      models: extraModels,
    });
    this.engine.setModel(`${created.id}/${created.defaultModel}`);
    await this.syncAndPrintConnectedProvider(created);
    return true;
  }

  private async syncAndPrintConnectedProvider(provider: ProviderConfig): Promise<void> {
    let results: Array<{ providerId: string; count: number; live: boolean; error?: string }> = [];
    if (this.fullScreenActive) {
      this.startSpinnerFs(`Syncing live models for ${provider.name}`);
      try {
        results = await this.engine.refreshProviderModels(provider.id);
      } finally {
        this.stopSpinnerFs();
      }
    } else {
      const spin = new TerminalSpinner();
      spin.start(`Syncing live models for ${provider.name}`);
      try {
        results = await this.engine.refreshProviderModels(provider.id);
      } finally {
        spin.stop();
      }
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
      let agyProbe: { models: unknown[]; ok: boolean; error?: string };
      if (this.fullScreenActive) {
        this.startSpinnerFs("Checking Google Antigravity (agy) session");
        try {
          agyProbe = await probeAgyModels(15000);
        } finally {
          this.stopSpinnerFs();
        }
      } else {
        const spin = new TerminalSpinner();
        spin.start("Checking Google Antigravity (agy) session");
        try {
          agyProbe = await probeAgyModels(15000);
        } finally {
          spin.stop();
        }
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
      const envHint = current.envKeys.length ? `Or set env var: ${current.envKeys[0]}` : "Local or custom endpoint";
      const formRes = await this.runFormModal({
        title: isProviderConnected(current) ? `Configure ${current.name}` : `Connect ${current.name}`,
        subtitle: `${current.id} · ${backLabel}`,
        callout: `Default model: ${current.id}/${current.defaultModel} · ${envHint}`,
        fields: [
          {
            id: "apiKey",
            label: current.local ? "API Key (optional for local)" : "API Key",
            placeholder: isProviderConnected(current)
              ? "Paste new key to replace (or leave blank to keep)"
              : current.local
                ? "Optional token or press Enter"
                : "Paste API key…",
            secret: !current.local,
            validate: (val) =>
              !current.local && !isProviderConnected(current) && val.length < 4
                ? "API key looks too short."
                : null,
          },
          {
            id: "baseUrl",
            label: "Base URL Override (optional)",
            initialValue: current.baseUrl,
            placeholder: current.baseUrl || "https://api.example.com/v1",
            validate: (val) => (val && !/^https?:\/\//i.test(val) ? "Enter a valid http(s) URL." : null),
          },
        ],
      });
      if (formRes.action !== "submit") return "back";
      const effectiveKey =
        formRes.values.apiKey ||
        (isProviderConnected(current) ? current.apiKey || "local-no-key-required" : "local-no-key-required");
      const effectiveBaseUrl =
        formRes.values.baseUrl && formRes.values.baseUrl !== current.baseUrl
          ? formRes.values.baseUrl
          : formRes.values.baseUrl || undefined;
      const updated = this.engine.connectProvider(current.id, effectiveKey, effectiveBaseUrl);
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
      if (connected && current.models.length > 0) {
        actionOptions.push({
          value: "browse-models",
          label: `Browse & Select Models (${current.models.length} available)`,
          description: current.models.slice(0, 3).map((m) => m.name).join(", "),
          badge: "Models",
          badgeColor: PALETTE.accent,
          keywords: "models select switch pick browse",
        });
      }
      if (connected) {
        actionOptions.push({
          value: "sync",
          label: "↻ Sync / Refresh Live Models",
          description: `Fetch latest models from ${current.baseUrl}`,
          badge: "Sync",
          badgeColor: PALETTE.info,
          keywords: "refresh sync reload models live",
        });
      }
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
        label: connected ? "Configure API Key & Base URL" : "Connect with API Key / Base URL",
        description: cliSpec
          ? `Direct API key & endpoint (${cliSpec.keyUrl})`
          : `Save API key or custom Base URL for ${current.name}`,
        badge: "Key",
        badgeColor: PALETTE.success,
        keywords: "api key token paste update base url endpoint configure",
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
      if (current.custom) {
        actionOptions.push({
          value: "edit-custom",
          label: "Edit Custom Provider Settings",
          description: `${current.protocol} · ${current.baseUrl}`,
          badge: "Edit",
          badgeColor: PALETTE.info,
          keywords: "edit custom url protocol models",
        });
        actionOptions.push({
          value: "delete-custom",
          label: "Delete Custom Provider",
          description: `Remove custom provider "${current.id}"`,
          badge: "Remove",
          badgeColor: PALETTE.danger,
          keywords: "delete remove custom provider",
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

      if (methodRes.value === "browse-models") {
        await this.openModelPicker(current.id);
        return "done";
      }

      if (methodRes.value === "sync") {
        await this.syncAndPrintConnectedProvider(current);
        continue;
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

      if (methodRes.value === "edit-custom") {
        const edited = await this.openCustomProviderFormModal(current);
        if (edited) return "done";
        continue;
      }

      if (methodRes.value === "delete-custom") {
        const conf = await this.runConfirmModal({
          title: `Delete ${current.name}?`,
          message: `Remove custom provider "${current.id}" and its credentials?`,
          confirmLabel: "Delete",
          danger: true,
        });
        if (!conf.confirmed) continue;
        this.engine.deleteCustomProvider(current.id);
        this.emitOut(`\n  ${c(PALETTE.success, "✓")} Deleted custom provider ${c(PALETTE.text + PALETTE.bold, current.id)}\n`);
        return canGoBack ? "back" : "done";
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
            {
              id: "callbackUrl",
              label: "Outbound Callback URL (optional)",
              placeholder: "https://bridge.example.com/reply (optional)",
              validate: (v) => (v && !/^https?:\/\//i.test(v) ? "Enter a valid http(s) URL." : null),
            },
          ],
        });
        if (form.action !== "submit") continue;
        await this.connectNewChannelFromTui({
          platform: "webhook",
          name: form.values.name || "Webhook Bridge",
          token: form.values.token || undefined,
          callbackUrl: form.values.callbackUrl || undefined,
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
    callbackUrl?: string;
    defaultAgent?: string;
    name: string;
  }): Promise<void> {
    const created = this.engine.channels.upsertChannel({
      platform: input.platform,
      token: input.token,
      appToken: input.appToken,
      callbackUrl: input.callbackUrl,
      defaultAgent: input.defaultAgent,
      name: input.name,
      autoStart: true,
    });
    const rawCfg = this.engine.channels.getConfig(created.id);

    this.startSpinnerFs(`Connecting ${input.platform} bot…`);
    try {
      const live = await this.engine.channels.startChannel(created.id);
      this.stopSpinnerFs();
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
      this.stopSpinnerFs();
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
        label: "Generate / Rotate One-Time Pairing Code",
        description: ch.pairingCode ? `Current: /pair ${ch.pairingCode}` : "Let a user self-authorize via /pair <CODE>",
        badge: "pair",
        badgeColor: PALETTE.accent,
      },
      {
        value: "pin-agent",
        label: "Pin Default Specialist @Agent",
        description: ch.defaultAgent ? `Currently pinned to @${ch.defaultAgent}` : "Currently uses active session agent",
        badge: ch.defaultAgent ? `@${ch.defaultAgent}` : "active",
        badgeColor: PALETTE.accentSoft,
      },
      {
        value: "allow-user",
        label: "+ Allow User ID…",
        description: `Allowed users: ${ch.allowedUsers.length ? ch.allowedUsers.join(", ") : "(none)"}`,
        badge: "allow",
        badgeColor: PALETTE.success,
      },
      ...(ch.allowedUsers.length > 0
        ? [
            {
              value: "remove-user",
              label: "− Remove Allowed User ID…",
              description: `${ch.allowedUsers.length} authorized user(s)`,
              badge: "revoke",
              badgeColor: PALETTE.warning,
            },
          ]
        : []),
      {
        value: "allow-chat",
        label: "+ Allow Chat / Channel ID…",
        description: `Allowed chats: ${ch.allowedChats.length ? ch.allowedChats.join(", ") : "(none)"}`,
        badge: "chat",
        badgeColor: PALETTE.info,
      },
      ...(ch.allowedChats.length > 0
        ? [
            {
              value: "remove-chat",
              label: "− Remove Allowed Chat ID…",
              description: `${ch.allowedChats.length} authorized chat(s)`,
              badge: "revoke",
              badgeColor: PALETTE.warning,
            },
          ]
        : []),
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
      this.startSpinnerFs(`Connecting ${ch.name}…`);
      try {
        const live = await this.engine.channels.startChannel(ch.id);
        this.stopSpinnerFs();
        process.stdout.write(
          `\n  ${c(PALETTE.success, "✓")} Connected ${c(PALETTE.text + PALETTE.bold, live.name)} ${c(PALETTE.info, live.status.botUsername || "")}\n`,
        );
      } catch (err) {
        this.stopSpinnerFs();
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
    } else if (res.value === "pin-agent") {
      const agents = this.engine.getAgents();
      const pick = await this.runSelectModal({
        title: `Pin Agent for ${ch.name}`,
        subtitle: ch.defaultAgent ? `Current: @${ch.defaultAgent}` : "Active session agent",
        options: [
          {
            value: "",
            label: "Use Active Session Agent",
            description: "Follow whichever agent is active in YEDOGU",
            badge: !ch.defaultAgent ? "active" : "auto",
            active: !ch.defaultAgent,
            checked: !ch.defaultAgent,
          },
          ...agents.map((a) => ({
            value: a.id,
            label: `@${a.id}`,
            description: a.title,
            badge: ch.defaultAgent === a.id ? "pinned" : undefined,
            badgeColor: PALETTE.accent,
            active: ch.defaultAgent === a.id,
            checked: ch.defaultAgent === a.id,
          })),
        ],
        footerHints: "↑↓ move · ↵ set agent · esc back",
      });
      if (pick.action === "select") {
        this.engine.channels.updateAccessControl(ch.id, { defaultAgent: pick.value });
        process.stdout.write(
          `\n  ${c(PALETTE.success, "✓")} Channel ${c(PALETTE.text, ch.name)} default agent → ${c(PALETTE.accent, pick.value ? `@${pick.value}` : "active session agent")}\n`,
        );
      }
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
    } else if (res.value === "remove-user") {
      const pick = await this.runSelectModal({
        title: "Remove Allowed User ID",
        subtitle: ch.name,
        options: ch.allowedUsers.map((u) => ({ value: u, label: u, badge: "remove", badgeColor: PALETTE.danger })),
        footerHints: "↑↓ move · ↵ remove · esc back",
      });
      if (pick.action === "select") {
        this.engine.channels.updateAccessControl(ch.id, { removeUser: pick.value });
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Removed user ${c(PALETTE.info, pick.value)} from ${ch.name}\n`);
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
    } else if (res.value === "remove-chat") {
      const pick = await this.runSelectModal({
        title: "Remove Allowed Chat ID",
        subtitle: ch.name,
        options: ch.allowedChats.map((cid) => ({ value: cid, label: cid, badge: "remove", badgeColor: PALETTE.danger })),
        footerHints: "↑↓ move · ↵ remove · esc back",
      });
      if (pick.action === "select") {
        this.engine.channels.updateAccessControl(ch.id, { removeChat: pick.value });
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Removed chat ${c(PALETTE.info, pick.value)} from ${ch.name}\n`);
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
    if (this.fullScreenActive) {
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: any, ...rest: any[]) => {
        if (typeof chunk === "string") {
          if (chunk.startsWith("\x1b]52;") || chunk.startsWith("\x1b[?")) {
            return origWrite(chunk, ...rest);
          }
          this.appendTranscript(chunk);
          return true;
        }
        return origWrite(chunk, ...rest);
      }) as typeof process.stdout.write;
      try {
        return await this.handleSlashCommandInner(line);
      } finally {
        process.stdout.write = origWrite;
        if (this.fullScreenActive) this.render();
      }
    }
    return this.handleSlashCommandInner(line);
  }

  private async handleSlashCommandInner(line: string): Promise<boolean> {
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

      case "/effort":
      case "/reasoning": {
        const level = (args[0] || "").toLowerCase() as ReasoningEffort;
        if (["none", "low", "medium", "high", "xhigh"].includes(level)) {
          const applied = this.engine.setReasoningEffort(level);
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Reasoning effort → ${c(PALETTE.reasoning + PALETTE.bold, applied)}\n`);
          return true;
        }
        if (process.stdout.isTTY) {
          await this.openReasoningPicker();
        } else {
          process.stdout.write(
            `\n  ${c(PALETTE.muted, `Current effort: ${this.engine.session.reasoningEffort || "medium"} · Usage: /effort <none|low|medium|high|xhigh>`)}\n`,
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
          let results: Array<{ providerId: string; count: number; live: boolean; error?: string }> = [];
          if (this.fullScreenActive) {
            this.startSpinnerFs("Refreshing live models from connected providers");
            try {
              results = await this.engine.refreshProviderModels();
            } finally {
              this.stopSpinnerFs();
            }
          } else {
            const spin = new TerminalSpinner();
            spin.start("Refreshing live models from connected providers");
            try {
              results = await this.engine.refreshProviderModels();
            } finally {
              spin.stop();
            }
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

      case "/sidebar": {
        const sub = (args[0] || "").toLowerCase();
        if (sub === "auto" || sub === "show" || sub === "hide") {
          this.sidebarMode = sub;
        } else {
          this.sidebarMode = this.sidebarMode === "hide" ? "show" : this.sidebarMode === "show" ? "hide" : "show";
        }
        const sideLines = renderSidebarPanel(
          this.engine.session,
          this.engine.getAgent(),
          this.engine.getProviders(),
          this.daemon.url,
          this.engine.channels.getPublicViews(),
        );
        process.stdout.write(
          `\n  ${c(PALETTE.success, "✓")} Sidebar mode → ${c(PALETTE.text + PALETTE.bold, this.sidebarMode)}\n` +
            sideLines.map((l) => `  ${c(PALETTE.border, "│")} ${l}`).join("\n") +
            "\n",
        );
        return true;
      }

      case "/timeline":
        if (process.stdout.isTTY) {
          await this.openTimelinePicker();
        } else {
          process.stdout.write(`\n  ${c(PALETTE.muted, `${this.engine.session.messages.length} messages in timeline`)}\n`);
        }
        return true;

      case "/undo": {
        if (this.undoStack.length === 0) {
          process.stdout.write(`\n  ${c(PALETTE.muted, "· Nothing to undo.")}\n`);
          return true;
        }
        this.redoStack.push(structuredClone(this.engine.session.messages));
        this.engine.session.messages = this.undoStack.pop()!;
        process.stdout.write(
          `\n  ${c(PALETTE.success, "✓")} Undid last turn (${this.engine.session.messages.length} messages remaining · /redo to restore)\n`,
        );
        return true;
      }

      case "/redo": {
        if (this.redoStack.length === 0) {
          process.stdout.write(`\n  ${c(PALETTE.muted, "· Nothing to redo.")}\n`);
          return true;
        }
        this.undoStack.push(structuredClone(this.engine.session.messages));
        this.engine.session.messages = this.redoStack.pop()!;
        process.stdout.write(
          `\n  ${c(PALETTE.success, "✓")} Restored turn (${this.engine.session.messages.length} messages)\n`,
        );
        return true;
      }

      case "/yank":
      case "/copy": {
        const lastAssistant = [...this.engine.session.messages].reverse().find((m) => m.role === "assistant" && m.content.trim());
        if (!lastAssistant) {
          process.stdout.write(`\n  ${c(PALETTE.muted, "· No assistant response to copy.")}\n`);
          return true;
        }
        this.copyTextToClipboard(lastAssistant.content);
        return true;
      }

      case "/export": {
        const lines = [
          `# ${this.engine.session.name || "YEDOGU Session"} (${this.engine.session.id})`,
          `- Workspace: \`${this.engine.session.workspace}\``,
          `- Model: \`${this.engine.session.activeModel}\``,
          `- Exported: ${new Date().toISOString()}`,
          "",
          ...this.engine.session.messages.map((m) =>
            `## ${m.role === "user" ? "User" : `Assistant (@${m.agentId || "commander"})`} — ${m.timestamp}\n\n${m.content}\n`,
          ),
        ];
        const md = lines.join("\n");
        const outFile = rest
          ? path.resolve(this.engine.session.workspace, rest)
          : path.resolve(this.engine.session.workspace, `yedogu-session-${this.engine.session.id}.md`);
        fs.writeFileSync(outFile, md, "utf8");
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Exported session transcript to ${c(PALETTE.info, outFile)}\n`);
        return true;
      }

      case "/editor": {
        const editorCmd = process.env.VISUAL || process.env.EDITOR || (process.platform === "win32" ? "notepad" : "vi");
        const tmpFile = path.join(os.tmpdir(), `yedogu-prompt-${Date.now()}.md`);
        fs.writeFileSync(tmpFile, "", "utf8");
        const wasRaw = Boolean(process.stdin.isTTY && (process.stdin as any).isRaw);
        this.rl?.pause();
        if (wasRaw && typeof process.stdin.setRawMode === "function") {
          try { process.stdin.setRawMode(false); } catch { /* ignore */ }
        }
        try {
          spawnSync(editorCmd, [tmpFile], { stdio: "inherit", shell: true });
        } finally {
          if (wasRaw && typeof process.stdin.setRawMode === "function") {
            try { process.stdin.setRawMode(true); } catch { /* ignore */ }
          }
          this.rl?.resume();
        }
        const edited = fs.existsSync(tmpFile) ? fs.readFileSync(tmpFile, "utf8").trim() : "";
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        if (!edited) {
          process.stdout.write(`\n  ${c(PALETTE.muted, "· Empty editor buffer; cancelled.")}\n`);
          return true;
        }
        process.stdout.write(`\n  ${c(PALETTE.accent, "❯")} ${c(PALETTE.text, truncatePlain(edited, 80))}\n`);
        await this.engine.sendPrompt(this.expandAtFileReferences(edited));
        return true;
      }

      case "/diff": {
        const sub = (args[0] || "").toLowerCase();
        if (sub === "split" || sub === "unified" || sub === "auto") {
          this.diffViewMode = sub;
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Diff view mode → ${c(PALETTE.text + PALETTE.bold, sub)}\n`);
        }
        const mods = this.engine.session.modifiedFiles ?? [];
        if (mods.length === 0) {
          process.stdout.write(`\n  ${c(PALETTE.muted, "· No modified files recorded in this session yet.")}\n`);
          return true;
        }
        for (const mf of mods.slice(0, 6)) {
          process.stdout.write("\n" + renderDiffView(mf.patch, { filePath: mf.path, view: this.diffViewMode }).join("\n") + "\n");
        }
        return true;
      }

      case "/todos": {
        process.stdout.write("\n" + renderTodoListCard(this.engine.session.todos ?? []).join("\n") + "\n\n");
        return true;
      }

      case "/stash": {
        const sub = (args[0] || "").toLowerCase();
        this.engine.session.stashedPrompts ??= [];
        if (sub === "clear") {
          this.engine.session.stashedPrompts = [];
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Cleared stashed prompts.\n`);
          return true;
        }
        if (sub === "pop") {
          const popped = this.engine.session.stashedPrompts.shift();
          process.stdout.write(popped ? `\n  ${c(PALETTE.info, "→")} ${popped}\n` : `\n  ${c(PALETTE.muted, "· Stash is empty.")}\n`);
          return true;
        }
        if (process.stdout.isTTY) {
          await this.openStashPicker();
        } else {
          process.stdout.write(`\n  ${c(PALETTE.muted, `${this.engine.session.stashedPrompts.length} stashed prompts`)}\n`);
        }
        return true;
      }

      case "/settings":
        if (process.stdout.isTTY) {
          await this.openSettingsModal();
        } else {
          process.stdout.write(`\n  ${c(PALETTE.muted, `sidebar=${this.sidebarMode} · diff=${this.diffViewMode} · theme=${getActiveTheme().id}`)}\n`);
        }
        return true;

      case "/mouse":
        this.toggleMouseCapture();
        return true;

      case "/rename":
        if (rest) {
          this.engine.updateSession(this.engine.session.id, { name: rest });
          process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Session renamed to ${c(PALETTE.text + PALETTE.bold, rest)}\n`);
        } else if (process.stdout.isTTY) {
          await this.renameCurrentSession();
        }
        return true;

      case "/fork": {
        const forkedName = rest || `${this.engine.session.name || "Session"} (fork)`;
        const snapshot = structuredClone(this.engine.session.messages);
        const newSess = this.engine.newSession(forkedName);
        newSess.parentSessionId = this.engine.session.id;
        newSess.messages = snapshot;
        process.stdout.write(`\n  ${c(PALETTE.success, "✓")} Forked session into ${c(PALETTE.info, newSess.id)} (${snapshot.length} msgs)\n`);
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
        if (this.fullScreenActive) {
          this.transcriptLines = [""];
          this.scrollOffset = 0;
          this.screenMode = "home";
          return true;
        }
        console.clear();
        process.stdout.write(
          renderBanner(
            this.engine.session,
            this.engine.getAgent(),
            this.engine.getProviders(),
            this.daemon.url,
            this.engine.channels.getPublicViews(),
            { sidebarMode: this.sidebarMode },
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
    this.leader.disarm();
    this.stopSpinnerFs();
    this.activeModal?.close();
    if (this.fullScreenActive) {
      this.fullScreenActive = false;
      if (this.mouseDataListener) process.stdin.off("data", this.mouseDataListener);
      if (this.keypressListener && this.keyStream) this.keyStream.off("keypress", this.keypressListener);
      this.keyStream?.end();
      this.keyStream = null;
      if (this.resizeListener) process.stdout.off("resize", this.resizeListener);
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
        try { process.stdin.setRawMode(false); } catch { /* ignore */ }
      }
      this.screen.leave();
    } else {
      this.clearDecorations();
    }
    this.spinner.stop(true);
    process.stdout.write(c(PALETTE.muted, "\n  Shutting down YEDOGU…\n"));
    this.rl?.close();
    await this.engine.channels.stopAll();
    this.engine.mcpManager.shutdown();
    await this.daemon.stop();
    process.exit(0);
  }
}
