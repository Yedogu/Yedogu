import {
  PALETTE,
  SYNC_END,
  SYNC_START,
  c,
  clipVisible,
  padVisible,
  termWidth,
  truncatePlain,
  visibleLength,
} from "./theme.js";

export interface SlashCommandSpec {
  name: string;
  usage?: string;
  description: string;
  category?: "ui" | "agent" | "model" | "security" | "session";
  takesArgs?: boolean;
  /** Opens an interactive pop-up modal when invoked with no arguments. */
  interactivePopup?: boolean;
}

export interface AgentMentionItem {
  id: string;
  title: string;
  model: string;
  active?: boolean;
}

export const SLASH_COMMAND_SPECS: readonly SlashCommandSpec[] = [
  { name: "/browser", description: "Open live-synced WebTUI Browser War-Room", category: "ui", interactivePopup: false },
  { name: "/channels", usage: "[add|start|stop|allow]", description: "Connect Telegram, Discord, Slack & Webhook bots (pop-up)", category: "ui", takesArgs: true, interactivePopup: true },
  { name: "/agent", usage: "[id]", description: "Switch specialist security agent (pop-up)", category: "agent", takesArgs: true, interactivePopup: true },
  { name: "/model", usage: "[p/m] [--agent id]", description: "Switch model or pin per agent (pop-up)", category: "model", takesArgs: true, interactivePopup: true },
  { name: "/theme", usage: "[name]", description: "Live terminal & War-Room color theme (pop-up)", category: "ui", takesArgs: true, interactivePopup: true },
  { name: "/providers", description: "Manage & connect LLM providers (pop-up)", category: "model", interactivePopup: true },
  { name: "/login", usage: "[gemini|codex|claude]", description: "Sign in via Google/Codex/Claude CLI or API key (pop-up)", category: "model", takesArgs: true, interactivePopup: true },
  { name: "/connect", usage: "<provider> <key>", description: "Save API key or token for a provider (pop-up)", category: "model", takesArgs: true, interactivePopup: true },
  { name: "/disconnect", usage: "[provider]", description: "Delete saved API key or CLI login for a provider", category: "model", takesArgs: true, interactivePopup: true },
  { name: "/scope", usage: "[add|deny|enforced]", description: "Configure target scope & ROE rules (pop-up)", category: "security", takesArgs: true, interactivePopup: true },
  { name: "/swarm", usage: "<objective>", description: "Run parallel @recon + @web-hunter + @reverser", category: "agent", takesArgs: true },
  { name: "/re", usage: "<filePath>", description: "Static binary / APK / IPA / ASAR triage", category: "security", takesArgs: true },
  { name: "/js", usage: "[path]", description: "Scan JS bundles for endpoints, sinks & secrets", category: "security", takesArgs: true },
  { name: "/http", usage: "[METHOD] <URL>", description: "Send scope-checked HTTP Forge request", category: "security", takesArgs: true },
  { name: "/findings", description: "Inspect recorded findings ledger (pop-up)", category: "security", interactivePopup: true },
  { name: "/report", usage: "[format] [file]", description: "Export sanitized report (pop-up)", category: "security", takesArgs: true, interactivePopup: true },
  { name: "/mcp", usage: "[list|connect|add]", description: "Manage REA & external MCP servers", category: "security", takesArgs: true },
  { name: "/sessions", description: "Switch or create sessions (pop-up)", category: "session", interactivePopup: true },
  { name: "/new", usage: "[name]", description: "Start a new session", category: "session", takesArgs: true },
  { name: "/compact", description: "Compact conversation context", category: "session" },
  { name: "/clear", description: "Clear messages & redraw header", category: "session" },
  { name: "/status", description: "Show current session telemetry", category: "session" },
  { name: "/help", description: "Show commands & keyboard shortcuts", category: "ui" },
  { name: "/exit", description: "Exit YEDOGU", category: "session" },
];

export const SLASH_COMMANDS: readonly string[] = SLASH_COMMAND_SPECS.map((s) => s.name);

/**
 * Filter slash commands for the current prompt input.
 * Returns `null` when the slash menu should not be shown (e.g. input doesn't start with `/` or already has a space).
 */
export function filterSlashCommands(input: string): SlashCommandSpec[] | null {
  if (!input.startsWith("/") || /\s/.test(input)) {
    return null;
  }
  const query = input.slice(1).toLowerCase();
  if (!query) {
    return [...SLASH_COMMAND_SPECS];
  }

  const prefixMatches: SlashCommandSpec[] = [];
  const substringMatches: SlashCommandSpec[] = [];

  for (const spec of SLASH_COMMAND_SPECS) {
    const bare = spec.name.slice(1).toLowerCase();
    if (bare.startsWith(query)) {
      prefixMatches.push(spec);
    } else if (bare.includes(query)) {
      substringMatches.push(spec);
    }
  }

  const combined = [...prefixMatches, ...substringMatches];
  if (combined.length > 0 || query.length < 3) {
    return combined;
  }

  // Fallback: match against description for 3+ char queries when no command name matched
  return SLASH_COMMAND_SPECS.filter((spec) => spec.description.toLowerCase().includes(query));
}

/**
 * Filter `@agent` mentions for inline one-shot routing popover.
 */
export function filterAgentMentions(
  input: string,
  agents: readonly AgentMentionItem[],
): AgentMentionItem[] | null {
  if (!input.startsWith("@") || /\s/.test(input)) {
    return null;
  }
  const query = input.slice(1).toLowerCase();
  if (!query) return [...agents];

  const prefix: AgentMentionItem[] = [];
  const sub: AgentMentionItem[] = [];
  for (const a of agents) {
    const id = a.id.toLowerCase();
    if (id.startsWith(query)) prefix.push(a);
    else if (id.includes(query)) sub.push(a);
  }
  const combined = [...prefix, ...sub];
  if (combined.length > 0 || query.length < 3) {
    return combined;
  }
  return agents.filter((a) => a.title.toLowerCase().includes(query));
}

export function formatSlashCompletion(spec: SlashCommandSpec): string {
  return spec.takesArgs ? `${spec.name} ` : spec.name;
}

type PopoverMode = "none" | "slash" | "mention";

/**
 * Scroll-safe, flicker-free floating inline popover rendered directly below the prompt.
 * Supports both `/` slash commands and `@` specialist agent mentions with
 * `tooey.design` rounded focus borders and `termcn.dev` active-row highlighting.
 */
export class SlashMenuController {
  private mode: PopoverMode = "none";
  private matches: SlashCommandSpec[] = [];
  private mentionMatches: AgentMentionItem[] = [];
  private selectedIndex = 0;
  private renderedLines = 0;
  private lastInput = "";
  private dismissedForInput: string | null = null;
  private active = false;
  private agentsProvider: () => AgentMentionItem[];

  constructor(
    private readonly out: NodeJS.WriteStream = process.stdout,
    agentsProvider: () => AgentMentionItem[] = () => [],
  ) {
    this.agentsProvider = agentsProvider;
  }

  public setAgentsProvider(provider: () => AgentMentionItem[]): void {
    this.agentsProvider = provider;
  }

  public get isOpen(): boolean {
    return this.active && this.renderedLines > 0;
  }

  public get currentMode(): PopoverMode {
    return this.mode;
  }

  public get currentMatches(): readonly SlashCommandSpec[] {
    return this.matches;
  }

  public get currentMentionMatches(): readonly AgentMentionItem[] {
    return this.mentionMatches;
  }

  public get currentSelectedIndex(): number {
    return this.selectedIndex;
  }

  public reset(): void {
    this.mode = "none";
    this.matches = [];
    this.mentionMatches = [];
    this.selectedIndex = 0;
    this.lastInput = "";
    this.dismissedForInput = null;
    this.active = false;
  }

  public dismiss(currentInput: string): void {
    this.dismissedForInput = currentInput;
    this.active = false;
  }

  public move(delta: number, cursorCol: number): void {
    const len = this.mode === "mention" ? this.mentionMatches.length : this.matches.length;
    if (!this.active || len === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + len) % len;
    this.render(cursorCol);
  }

  public getSelectedSlashSpec(): SlashCommandSpec | null {
    if (this.mode !== "slash" || this.matches.length === 0) return null;
    return this.matches[this.selectedIndex] ?? this.matches[0] ?? null;
  }

  public getSelectedCompletion(): string | null {
    if (this.mode === "mention") {
      const a = this.mentionMatches[this.selectedIndex] ?? this.mentionMatches[0];
      return a ? `@${a.id} ` : null;
    }
    if (this.matches.length === 0) return null;
    const spec = this.matches[this.selectedIndex] ?? this.matches[0];
    return spec ? formatSlashCompletion(spec) : null;
  }

  /**
   * Synchronize the popover with the current readline buffer and redraw in place.
   */
  public sync(input: string, cursorCol: number): void {
    if (!this.out.isTTY) return;

    if (this.dismissedForInput !== null && input === this.dismissedForInput) {
      this.clear(cursorCol);
      return;
    }
    this.dismissedForInput = null;

    // 1. Check `/` slash commands
    const filteredSlash = filterSlashCommands(input);
    if (filteredSlash !== null) {
      const inputChanged = input !== this.lastInput || this.mode !== "slash";
      this.mode = "slash";
      this.lastInput = input;
      this.matches = filteredSlash;
      this.mentionMatches = [];
      if (inputChanged || this.selectedIndex >= filteredSlash.length) {
        this.selectedIndex = 0;
      }
      this.active = true;
      this.render(cursorCol);
      return;
    }

    // 2. Check `@` agent mentions
    const agents = this.agentsProvider();
    const filteredMentions = agents.length > 0 ? filterAgentMentions(input, agents) : null;
    if (filteredMentions !== null) {
      const inputChanged = input !== this.lastInput || this.mode !== "mention";
      this.mode = "mention";
      this.lastInput = input;
      this.matches = [];
      this.mentionMatches = filteredMentions;
      if (inputChanged || this.selectedIndex >= filteredMentions.length) {
        this.selectedIndex = 0;
      }
      this.active = true;
      this.render(cursorCol);
      return;
    }

    // Neither active → close popover
    this.mode = "none";
    this.active = false;
    this.matches = [];
    this.mentionMatches = [];
    this.selectedIndex = 0;
    this.clear(cursorCol);
  }

  /**
   * Erase any popover rows currently drawn below the prompt and restore the cursor to `cursorCol`.
   */
  public clear(cursorCol?: number): void {
    if (!this.out.isTTY || this.renderedLines === 0) {
      this.renderedLines = 0;
      return;
    }
    let seq = `${SYNC_START}\x1b[1B\r\x1b[J\x1b[1A`;
    if (cursorCol !== undefined) {
      seq += `\x1b[${Math.max(1, cursorCol)}G`;
    }
    seq += SYNC_END;
    this.out.write(seq);
    this.renderedLines = 0;
  }

  private render(cursorCol: number): void {
    if (!this.out.isTTY) return;

    const cols = this.out.columns || 88;
    const rows = this.out.rows || 24;
    const width = Math.max(46, Math.min(termWidth(84, 52), cols - 4));
    const innerWidth = width - 4;
    const indent = "  ";
    const bColor = PALETTE.borderFocus;
    const maxVisibleItems = Math.max(4, Math.min(9, rows - 7));

    const lines: string[] = [];
    const total = this.mode === "mention" ? this.mentionMatches.length : this.matches.length;
    const visibleCount = Math.min(total, maxVisibleItems);
    let start = 0;
    if (total > visibleCount) {
      start = Math.max(0, Math.min(this.selectedIndex - Math.floor(visibleCount / 2), total - visibleCount));
    }

    // Top border
    const headerTitle =
      this.mode === "mention"
        ? ` ${c(PALETTE.accent + PALETTE.bold, "@")} ${c(PALETTE.text + PALETTE.bold, "Route to Agent")} `
        : ` ${c(PALETTE.accent + PALETTE.bold, "/")} ${c(PALETTE.text + PALETTE.bold, "Commands")} `;
    const rangeTag =
      total > visibleCount
        ? ` ${c(PALETTE.muted, `${start + 1}–${start + visibleCount} of ${total}`)} `
        : total > 0
          ? ` ${c(PALETTE.muted, `${total}`)} `
          : "";
    const topFill = Math.max(
      1,
      width - 3 - visibleLength(headerTitle) - visibleLength(rangeTag) - (rangeTag ? 1 : 0),
    );
    lines.push(
      `${indent}${c(bColor, "╭─")}${headerTitle}${c(bColor, "─".repeat(topFill))}${rangeTag}${c(bColor, rangeTag ? "─╮" : "╮")}`,
    );

    if (total === 0) {
      const emptyMsg = this.mode === "mention" ? "  No matching agents" : "  No matching commands";
      lines.push(`${indent}${c(bColor, "│")} ${padVisible(c(PALETTE.muted, emptyMsg), innerWidth)} ${c(bColor, "│")}`);
    } else if (this.mode === "mention") {
      const slice = this.mentionMatches.slice(start, start + visibleCount);
      for (let i = 0; i < slice.length; i++) {
        const a = slice[i];
        const isSel = start + i === this.selectedIndex;
        const ptr = isSel ? c(PALETTE.accent + PALETTE.bold, "›") : a.active ? c(PALETTE.success, "●") : " ";
        const name = `@${a.id}`;
        const styledName = isSel
          ? c(PALETTE.accent + PALETTE.bold, name)
          : c(PALETTE.text + PALETTE.bold, name);
        const modelBadge = c(PALETTE.muted, truncatePlain(a.model, 24));
        const badgeLen = visibleLength(modelBadge) + 2;
        const descBudget = Math.max(8, innerWidth - 18 - badgeLen);
        const titleStr = truncatePlain(a.title, descBudget);
        const styledTitle = isSel ? c(PALETTE.secondary, titleStr) : c(PALETTE.muted, titleStr);
        const left = `${ptr} ${padVisible(styledName, 16)} ${styledTitle}`;
        const clippedLeft = clipVisible(left, innerWidth - badgeLen);
        const gap = Math.max(1, innerWidth - visibleLength(clippedLeft) - visibleLength(modelBadge));
        const rowContent = `${clippedLeft}${" ".repeat(gap)}${modelBadge}`;
        lines.push(this.wrapRow(indent, bColor, rowContent, innerWidth, isSel));
      }
    } else {
      const slice = this.matches.slice(start, start + visibleCount);
      const cmdColWidth = Math.min(28, Math.max(18, Math.floor(innerWidth * 0.36)));

      for (let i = 0; i < slice.length; i++) {
        const spec = slice[i];
        const isSel = start + i === this.selectedIndex;
        const ptr = isSel ? c(PALETTE.accent + PALETTE.bold, "›") : " ";
        const rawCmd = spec.usage ? `${spec.name} ${spec.usage}` : spec.name;
        const truncCmd = truncatePlain(rawCmd, cmdColWidth - 1);

        let styledCmd: string;
        if (spec.usage && truncCmd.startsWith(spec.name)) {
          const rest = truncCmd.slice(spec.name.length);
          styledCmd = isSel
            ? `${c(PALETTE.accent + PALETTE.bold, spec.name)}${c(PALETTE.accentSoft, rest)}`
            : `${c(PALETTE.text, spec.name)}${c(PALETTE.muted, rest)}`;
        } else {
          styledCmd = isSel
            ? c(PALETTE.accent + PALETTE.bold, truncCmd)
            : c(PALETTE.text, truncCmd);
        }

        const pill = spec.interactivePopup ? c(PALETTE.info, "⊞") : "";
        const pillSpace = pill ? 2 : 0;
        const descBudget = Math.max(10, innerWidth - cmdColWidth - 4 - pillSpace);
        const desc = truncatePlain(spec.description, descBudget);
        const styledDesc = isSel ? c(PALETTE.secondary, desc) : c(PALETTE.muted, desc);

        const left = `${ptr} ${padVisible(styledCmd, cmdColWidth)} ${styledDesc}`;
        const clippedLeft = clipVisible(left, innerWidth - pillSpace);
        const gap = Math.max(0, innerWidth - visibleLength(clippedLeft) - visibleLength(pill));
        const rowContent = `${clippedLeft}${" ".repeat(gap)}${pill}`;
        lines.push(this.wrapRow(indent, bColor, rowContent, innerWidth, isSel));
      }
    }

    // Bottom border with crisp hints
    const hintText =
      this.mode === "mention"
        ? "↑↓ move · tab/↵ insert @agent · esc close"
        : "↑↓ move · tab fill · ↵ select · ⊞ pop-up · esc close";
    const leftFooter = ` ${c(PALETTE.muted, truncatePlain(hintText, width - 6))} `;
    const botFill = Math.max(1, width - 3 - visibleLength(leftFooter));
    lines.push(`${indent}${c(bColor, "╰─")}${leftFooter}${c(bColor, "─".repeat(botFill))}${c(bColor, "╯")}`);

    let buf = SYNC_START;
    for (const line of lines) {
      buf += `\r\n${line}\x1b[K`;
    }
    buf += `\x1b[J\x1b[${lines.length}A\x1b[${Math.max(1, cursorCol)}G${SYNC_END}`;
    this.out.write(buf);
    this.renderedLines = lines.length;
  }

  private wrapRow(
    indent: string,
    bColor: string,
    rowContent: string,
    innerWidth: number,
    isSel: boolean,
  ): string {
    if (isSel && !process.env.NO_COLOR) {
      const tinted = `${PALETTE.surfaceActiveBg}${rowContent.replace(/\x1b\[0m/g, `${PALETTE.reset}${PALETTE.surfaceActiveBg}`)}${PALETTE.reset}`;
      return `${indent}${c(bColor, "│")}${PALETTE.surfaceActiveBg} ${tinted} ${PALETTE.reset}${c(bColor, "│")}`;
    }
    return `${indent}${c(bColor, "│")} ${padVisible(rowContent, innerWidth)} ${c(bColor, "│")}`;
  }
}
