import type readline from "node:readline";
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

export interface SelectOption<T = string> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  badgeColor?: string;
  /** When true, `badge` already carries its own ANSI styling (e.g. theme color swatches). */
  badgeRaw?: boolean;
  active?: boolean;
  keywords?: string;
}

export interface SelectModalConfig<T = string> {
  title: string;
  subtitle?: string;
  placeholder?: string;
  options: SelectOption<T>[];
  initialIndex?: number;
  searchable?: boolean;
  maxVisible?: number;
  width?: number;
  footerHints?: string;
  /**
   * Optional Tab handler for in-modal mode toggling (e.g., Default vs Pin to @agent).
   * Returning partial updates refreshes the modal immediately in place.
   */
  onTab?: () => {
    subtitle?: string;
    footerHints?: string;
    options?: SelectOption<T>[];
  } | void;
  /**
   * Optional Left/Right arrow handler (e.g., adjusting model reasoning effort).
   */
  onLeftRight?: (delta: -1 | 1, selected: SelectOption<T> | undefined) => void;
  /**
   * Optional multi-line panel rendered below the option list (e.g., effort slider).
   */
  renderFooterPanel?: (selected: SelectOption<T> | undefined, innerWidth: number) => string[];
}

export interface InputModalConfig {
  title: string;
  subtitle?: string;
  steps?: string[];
  fieldLabel?: string;
  placeholder?: string;
  initialValue?: string;
  secret?: boolean;
  width?: number;
  hint?: string;
  footerHints?: string;
  validate?: (value: string) => string | null;
}

export interface FormFieldSpec {
  id: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  secret?: boolean;
  validate?: (value: string) => string | null;
}

export interface FormModalConfig {
  title: string;
  subtitle?: string;
  steps?: string[];
  callout?: string;
  fields: FormFieldSpec[];
  width?: number;
  footerHints?: string;
}

export type FormOutcome =
  | { action: "submit"; values: Record<string, string> }
  | { action: "cancel" };

export type ModalOutcome<T> =
  | { action: "select"; value: T; option: SelectOption<T> }
  | { action: "cancel" };

export type InputOutcome =
  | { action: "submit"; value: string }
  | { action: "cancel" };

export interface ActiveModal {
  handleKey(str: string, key: readline.Key): void;
  close(): void;
}

const STEP_GLYPHS = ["①", "②", "③", "④", "⑤", "⑥"];

function renderInlineCodeText(raw: string, baseColor: string): string {
  const parts = raw.split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return c(PALETTE.info + PALETTE.bold, part.slice(1, -1));
      }
      return c(baseColor, part);
    })
    .join("");
}

/**
 * Lightweight fuzzy scoring for instant interactive filtering.
 * Returns -1 when not matched, or a positive relevance score.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = target.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - (t.length - q.length) * 0.1;

  const idx = t.indexOf(q);
  if (idx !== -1) {
    const boundaryBonus = idx === 0 || /[\s/._@-]/.test(t[idx - 1]) ? 120 : 0;
    return 500 + boundaryBonus - idx * 2;
  }

  // Subsequence match
  let qi = 0;
  let score = 100;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (lastMatch === ti - 1) score += 25;
      else if (ti === 0 || /[\s/._@-]/.test(t[ti - 1])) score += 15;
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}

export function filterSelectOptions<T>(
  options: readonly SelectOption<T>[],
  query: string,
): SelectOption<T>[] {
  const q = query.trim();
  if (!q) return [...options];

  const scored: Array<{ opt: SelectOption<T>; score: number }> = [];
  for (const opt of options) {
    const labelScore = fuzzyScore(q, opt.label) * 1.5;
    const descScore = opt.description ? fuzzyScore(q, opt.description) * 0.8 : -1;
    const kwScore = opt.keywords ? fuzzyScore(q, opt.keywords) : -1;
    const badgeScore = opt.badge ? fuzzyScore(q, opt.badge) * 0.6 : -1;
    const best = Math.max(labelScore, descScore, kwScore, badgeScore);
    if (best > 0) {
      scored.push({ opt, score: best });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.opt);
}

/**
 * Scroll-safe, flicker-free floating interactive select modal.
 * Preserves terminal scrollback (never traps the user in alt-screen).
 */
export class SelectModal<T = string> implements ActiveModal {
  private query = "";
  private options: SelectOption<T>[];
  private filtered: SelectOption<T>[];
  private selectedIndex = 0;
  private renderedLines = 0;
  private subtitle: string;
  private footerHints: string;
  private closed = false;

  constructor(
    private readonly config: SelectModalConfig<T>,
    private readonly onDone: (outcome: ModalOutcome<T>) => void,
    private readonly out: NodeJS.WriteStream = process.stdout,
  ) {
    this.options = [...config.options];
    this.filtered = [...config.options];
    this.subtitle = config.subtitle ?? "";
    this.footerHints =
      config.footerHints ??
      (config.onTab
        ? "↑↓ move · ↵ select · tab mode · esc close"
        : "↑↓ move · ↵ select · esc close");

    if (
      config.initialIndex !== undefined &&
      config.initialIndex >= 0 &&
      config.initialIndex < this.filtered.length
    ) {
      this.selectedIndex = config.initialIndex;
    } else {
      const activeIdx = this.filtered.findIndex((o) => o.active);
      if (activeIdx !== -1) this.selectedIndex = activeIdx;
    }
  }

  public get currentQuery(): string {
    return this.query;
  }

  public get currentSelectedIndex(): number {
    return this.selectedIndex;
  }

  public get currentFiltered(): readonly SelectOption<T>[] {
    return this.filtered;
  }

  public open(): void {
    this.render();
  }

  public handleKey(str: string, key: readline.Key = {}): void {
    if (this.closed) return;

    if (key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d"))) {
      this.close();
      this.onDone({ action: "cancel" });
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      const chosen = this.filtered[this.selectedIndex];
      if (!chosen) return;
      this.close();
      this.onDone({ action: "select", value: chosen.value, option: chosen });
      return;
    }

    if (key.name === "up" || (key.ctrl && key.name === "p")) {
      if (this.filtered.length > 0) {
        this.selectedIndex = (this.selectedIndex - 1 + this.filtered.length) % this.filtered.length;
        this.render();
      }
      return;
    }

    if (key.name === "down" || (key.ctrl && key.name === "n")) {
      if (this.filtered.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % this.filtered.length;
        this.render();
      }
      return;
    }

    if (key.name === "pageup") {
      if (this.filtered.length > 0) {
        this.selectedIndex = Math.max(0, this.selectedIndex - 6);
        this.render();
      }
      return;
    }

    if (key.name === "pagedown") {
      if (this.filtered.length > 0) {
        this.selectedIndex = Math.min(this.filtered.length - 1, this.selectedIndex + 6);
        this.render();
      }
      return;
    }

    if (key.name === "left" && this.config.onLeftRight) {
      this.config.onLeftRight(-1, this.filtered[this.selectedIndex]);
      this.render();
      return;
    }

    if (key.name === "right" && this.config.onLeftRight) {
      this.config.onLeftRight(1, this.filtered[this.selectedIndex]);
      this.render();
      return;
    }

    if (key.name === "tab" && this.config.onTab) {
      const patch = this.config.onTab();
      if (patch) {
        if (patch.subtitle !== undefined) this.subtitle = patch.subtitle;
        if (patch.footerHints !== undefined) this.footerHints = patch.footerHints;
        if (patch.options) {
          this.options = [...patch.options];
          this.applyFilter();
        }
      }
      this.render();
      return;
    }

    if (this.config.searchable === false) return;

    if (key.name === "backspace") {
      if (this.query.length > 0) {
        this.query = this.query.slice(0, -1);
        this.applyFilter();
        this.render();
      }
      return;
    }

    if (key.ctrl && key.name === "u") {
      if (this.query.length > 0) {
        this.query = "";
        this.applyFilter();
        this.render();
      }
      return;
    }

    // Printable character(s)
    if (str && !key.ctrl && !key.meta && /^[\x20-\x7e]+$/.test(str)) {
      this.query += str;
      this.applyFilter();
      this.render();
    }
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.out.isTTY || this.renderedLines === 0) {
      this.renderedLines = 0;
      return;
    }
    const moveUp = this.renderedLines > 1 ? `\x1b[${this.renderedLines - 1}A` : "";
    this.out.write(`${SYNC_START}${moveUp}\r\x1b[J\x1b[1A\r\x1b[K${SYNC_END}`);
    this.renderedLines = 0;
  }

  private applyFilter(): void {
    this.filtered = filterSelectOptions(this.options, this.query);
    if (this.filtered.length === 0) {
      this.selectedIndex = 0;
    } else if (this.selectedIndex >= this.filtered.length) {
      this.selectedIndex = 0;
    }
  }

  private buildLines(): string[] {
    const cols = this.out.columns || 88;
    const rows = this.out.rows || 24;
    const width = Math.min(this.config.width ?? termWidth(82, 54), Math.max(44, cols - 4));
    const innerWidth = width - 4;
    const indent = "  ";
    const bColor = PALETTE.borderFocus;
    const searchable = this.config.searchable !== false;

    const footerPanelLines = this.config.renderFooterPanel
      ? this.config.renderFooterPanel(this.filtered[this.selectedIndex], innerWidth)
      : [];
    const extraFooterRows = footerPanelLines.length > 0 ? footerPanelLines.length + 1 : 0;
    const maxVisible = Math.max(
      4,
      Math.min(this.config.maxVisible ?? 10, rows - (searchable ? 8 : 6) - extraFooterRows),
    );

    const lines: string[] = [];

    // Top border with title & subtitle
    const leftTitle = ` ${c(PALETTE.accent + PALETTE.bold, "✦")} ${c(PALETTE.text + PALETTE.bold, this.config.title)} `;
    const rightTitle = this.subtitle ? ` ${c(PALETTE.info, this.subtitle)} ` : "";
    const topFill = Math.max(
      1,
      width - 3 - visibleLength(leftTitle) - visibleLength(rightTitle) - (rightTitle ? 1 : 0),
    );
    lines.push(
      `${indent}${c(bColor, "╭─")}${leftTitle}${c(bColor, "─".repeat(topFill))}${rightTitle}${c(bColor, rightTitle ? "─╮" : "╮")}`,
    );

    // Search bar row
    if (searchable) {
      const searchPrompt = c(PALETTE.accent, "›");
      const queryDisplay = this.query
        ? `${c(PALETTE.text, truncatePlain(this.query, innerWidth - 14))}${c(PALETTE.accent, "▎")}`
        : `${c(PALETTE.muted, this.config.placeholder ?? "Type to filter…")}`;
      const countBadge = c(PALETTE.muted, `${this.filtered.length}/${this.options.length}`);
      const leftLen = 2 + visibleLength(queryDisplay);
      const rightLen = visibleLength(countBadge);
      const gap = Math.max(1, innerWidth - leftLen - rightLen);
      lines.push(
        `${indent}${c(bColor, "│")} ${searchPrompt} ${queryDisplay}${" ".repeat(gap)}${countBadge} ${c(bColor, "│")}`,
      );
      lines.push(`${indent}${c(PALETTE.border, `├${"─".repeat(width - 2)}┤`)}`);
    }

    // List items
    const total = this.filtered.length;
    if (total === 0) {
      const empty = padVisible(c(PALETTE.muted, "  No matching items"), innerWidth);
      lines.push(`${indent}${c(bColor, "│")} ${empty} ${c(bColor, "│")}`);
    } else {
      const visibleCount = Math.min(total, maxVisible);
      let start = 0;
      if (total > visibleCount) {
        start = Math.max(
          0,
          Math.min(this.selectedIndex - Math.floor(visibleCount / 2), total - visibleCount),
        );
      }
      const slice = this.filtered.slice(start, start + visibleCount);
      const anyDesc = slice.some((o) => Boolean(o.description));
      const longestLabel = slice.reduce((max, o) => Math.max(max, o.label.length), 0);

      for (let i = 0; i < slice.length; i++) {
        const opt = slice[i];
        const isSel = start + i === this.selectedIndex;
        const pointer = isSel ? c(PALETTE.accent + PALETTE.bold, "›") : opt.active ? c(PALETTE.success, "●") : " ";

        const badgeStr = opt.badge
          ? opt.badgeRaw
            ? opt.badge
            : c(opt.badgeColor ?? (isSel ? PALETTE.accentSoft : PALETTE.muted), opt.badge)
          : "";
        const badgeLen = badgeStr ? visibleLength(badgeStr) + 2 : 0;

        const leftBudget = Math.max(12, innerWidth - 2 - badgeLen);
        const labelColMax = anyDesc
          ? Math.min(28, Math.max(14, Math.min(longestLabel, Math.floor(leftBudget * 0.48))))
          : leftBudget;
        const rawLabel = truncatePlain(opt.label, labelColMax);
        const styledLabel = isSel
          ? c(PALETTE.text + PALETTE.bold, rawLabel)
          : opt.active
            ? c(PALETTE.accentSoft + PALETTE.bold, rawLabel)
            : c(PALETTE.text, rawLabel);

        let leftPart = anyDesc
          ? `${pointer} ${padVisible(styledLabel, labelColMax)}`
          : `${pointer} ${styledLabel}`;
        if (opt.description) {
          const descBudget = Math.max(6, leftBudget - labelColMax - 2);
          if (descBudget >= 6) {
            const desc = truncatePlain(opt.description, descBudget);
            const styledDesc = isSel ? c(PALETTE.secondary, desc) : c(PALETTE.muted, desc);
            leftPart += `  ${styledDesc}`;
          }
        }

        const clippedLeft = clipVisible(leftPart, innerWidth - badgeLen);
        const gap = Math.max(0, innerWidth - visibleLength(clippedLeft) - (badgeStr ? visibleLength(badgeStr) : 0));
        const rowContent = `${clippedLeft}${" ".repeat(gap)}${badgeStr}`;

        if (isSel && !process.env.NO_COLOR) {
          const tinted = `${PALETTE.surfaceActiveBg}${rowContent.replace(/\x1b\[0m/g, `${PALETTE.reset}${PALETTE.surfaceActiveBg}`)}${PALETTE.reset}`;
          lines.push(`${indent}${c(bColor, "│")}${PALETTE.surfaceActiveBg} ${tinted} ${PALETTE.reset}${c(bColor, "│")}`);
        } else {
          lines.push(`${indent}${c(bColor, "│")} ${padVisible(rowContent, innerWidth)} ${c(bColor, "│")}`);
        }
      }
    }

    // Optional footer panel (e.g., effort slider)
    if (footerPanelLines.length > 0) {
      lines.push(`${indent}${c(PALETTE.border, `├${"─".repeat(width - 2)}┤`)}`);
      for (const fl of footerPanelLines) {
        lines.push(`${indent}${c(bColor, "│")} ${padVisible(clipVisible(fl, innerWidth), innerWidth)} ${c(bColor, "│")}`);
      }
    }

    // Bottom border with shortcut hints + scroll counter
    const totalShown = Math.min(total, maxVisible);
    const scrollRange =
      total > totalShown
        ? (() => {
            const start = Math.max(
              0,
              Math.min(this.selectedIndex - Math.floor(totalShown / 2), total - totalShown),
            );
            return ` ${c(PALETTE.muted, `${start + 1}–${start + totalShown} of ${total}`)} `;
          })()
        : "";
    const leftFooter = ` ${c(PALETTE.muted, truncatePlain(this.footerHints, Math.max(16, width - visibleLength(scrollRange) - 8)))} `;
    const botFill = Math.max(
      1,
      width - 3 - visibleLength(leftFooter) - visibleLength(scrollRange) - (scrollRange ? 1 : 0),
    );
    lines.push(
      `${indent}${c(bColor, "╰─")}${leftFooter}${c(bColor, "─".repeat(botFill))}${scrollRange}${c(bColor, scrollRange ? "─╯" : "╯")}`,
    );

    return lines;
  }

  private render(): void {
    if (!this.out.isTTY) return;
    const lines = this.buildLines();

    let buf = SYNC_START;
    if (this.renderedLines === 0) {
      buf += `\r\n${lines.join("\x1b[K\r\n")}\x1b[K\x1b[J`;
    } else {
      const moveUp = this.renderedLines > 1 ? `\x1b[${this.renderedLines - 1}A` : "";
      buf += `${moveUp}\r${lines.join("\x1b[K\r\n")}\x1b[K\x1b[J`;
    }
    buf += SYNC_END;

    this.out.write(buf);
    this.renderedLines = lines.length;
  }
}

/**
 * Scroll-safe floating text / secret input modal (for API keys, scope rules, session names).
 */
export class InputModal implements ActiveModal {
  private value: string;
  private cursor: number;
  private errorMsg: string | null = null;
  private renderedLines = 0;
  private closed = false;

  constructor(
    private readonly config: InputModalConfig,
    private readonly onDone: (outcome: InputOutcome) => void,
    private readonly out: NodeJS.WriteStream = process.stdout,
  ) {
    this.value = config.initialValue ?? "";
    this.cursor = this.value.length;
  }

  public get currentValue(): string {
    return this.value;
  }

  public open(): void {
    this.render();
  }

  public handleKey(str: string, key: readline.Key = {}): void {
    if (this.closed) return;

    if (key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d"))) {
      this.close();
      this.onDone({ action: "cancel" });
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      const trimmed = this.value.trim();
      if (this.config.validate) {
        const err = this.config.validate(trimmed);
        if (err) {
          this.errorMsg = err;
          this.render();
          return;
        }
      }
      this.close();
      this.onDone({ action: "submit", value: trimmed });
      return;
    }

    this.errorMsg = null;

    if (key.name === "backspace") {
      if (this.cursor > 0) {
        this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
        this.cursor--;
        this.render();
      }
      return;
    }

    if (key.name === "delete") {
      if (this.cursor < this.value.length) {
        this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
        this.render();
      }
      return;
    }

    if (key.name === "left") {
      if (this.cursor > 0) {
        this.cursor--;
        this.render();
      }
      return;
    }

    if (key.name === "right") {
      if (this.cursor < this.value.length) {
        this.cursor++;
        this.render();
      }
      return;
    }

    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      this.cursor = 0;
      this.render();
      return;
    }

    if (key.name === "end" || (key.ctrl && key.name === "e")) {
      this.cursor = this.value.length;
      this.render();
      return;
    }

    if (key.ctrl && key.name === "u") {
      this.value = "";
      this.cursor = 0;
      this.render();
      return;
    }

    // Printable input (supports pasted chunks)
    if (str && !key.ctrl && !key.meta) {
      const clean = str.replace(/[\r\n]/g, "");
      if (clean && /^[\x20-\x7e]+$/.test(clean)) {
        this.value = this.value.slice(0, this.cursor) + clean + this.value.slice(this.cursor);
        this.cursor += clean.length;
        this.render();
      }
    }
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.out.isTTY || this.renderedLines === 0) {
      this.renderedLines = 0;
      return;
    }
    const moveUp = this.renderedLines > 1 ? `\x1b[${this.renderedLines - 1}A` : "";
    this.out.write(`${SYNC_START}${moveUp}\r\x1b[J\x1b[1A\r\x1b[K${SYNC_END}`);
    this.renderedLines = 0;
  }

  private render(): void {
    if (!this.out.isTTY) return;
    const cols = this.out.columns || 88;
    const width = Math.min(this.config.width ?? termWidth(76, 50), Math.max(44, cols - 4));
    const innerWidth = width - 4;
    const indent = "  ";
    const bColor = this.errorMsg ? PALETTE.danger : PALETTE.borderFocus;

    const lines: string[] = [];

    // Top border
    const leftTitle = ` ${c(PALETTE.accent + PALETTE.bold, "✦")} ${c(PALETTE.text + PALETTE.bold, this.config.title)} `;
    const rightTitle = this.config.subtitle ? ` ${c(PALETTE.muted, this.config.subtitle)} ` : "";
    const topFill = Math.max(
      1,
      width - 3 - visibleLength(leftTitle) - visibleLength(rightTitle) - (rightTitle ? 1 : 0),
    );
    lines.push(
      `${indent}${c(bColor, "╭─")}${leftTitle}${c(bColor, "─".repeat(topFill))}${rightTitle}${c(bColor, rightTitle ? "─╮" : "╮")}`,
    );

    if (this.config.steps && this.config.steps.length > 0) {
      for (let i = 0; i < this.config.steps.length; i++) {
        const glyph = c(PALETTE.accent + PALETTE.bold, STEP_GLYPHS[i] || `${i + 1}.`);
        const stepText = renderInlineCodeText(truncatePlain(this.config.steps[i], innerWidth - 4), PALETTE.secondary);
        lines.push(`${indent}${c(bColor, "│")} ${padVisible(`${glyph} ${stepText}`, innerWidth)} ${c(bColor, "│")}`);
      }
      lines.push(`${indent}${c(PALETTE.border, "├" + "─".repeat(width - 2) + "┤")}`);
    }

    if (this.config.fieldLabel) {
      const lbl = c(PALETTE.muted, truncatePlain(this.config.fieldLabel, innerWidth));
      lines.push(`${indent}${c(bColor, "│")} ${padVisible(lbl, innerWidth)} ${c(bColor, "│")}`);
    }

    // Input field row
    const maxFieldLen = innerWidth - 12;
    let displayStr: string;
    if (!this.value) {
      displayStr = `${c(PALETTE.accent, "▎")}${c(PALETTE.muted, truncatePlain(this.config.placeholder ?? "Enter value…", maxFieldLen))}`;
    } else if (this.config.secret) {
      const masked = "•".repeat(Math.min(this.value.length, Math.max(8, maxFieldLen - 10)));
      displayStr = `${c(PALETTE.text, masked)}${c(PALETTE.accent, "▎")} ${c(PALETTE.muted, `(${this.value.length} chars)`)}`;
    } else {
      const shown =
        this.value.length > maxFieldLen
          ? `…${this.value.slice(this.value.length - maxFieldLen + 1)}`
          : this.value;
      const before = shown.slice(0, Math.min(this.cursor, shown.length));
      const after = shown.slice(Math.min(this.cursor, shown.length));
      displayStr = `${c(PALETTE.text, before)}${c(PALETTE.accent, "▎")}${c(PALETTE.text, after)}`;
    }

    const fieldRow = `${c(PALETTE.accent + PALETTE.bold, "❯")} ${displayStr}`;
    lines.push(`${indent}${c(bColor, "│")} ${padVisible(clipVisible(fieldRow, innerWidth), innerWidth)} ${c(bColor, "│")}`);

    if (this.errorMsg) {
      const errRow = `${c(PALETTE.danger, "✗")} ${c(PALETTE.danger, truncatePlain(this.errorMsg, innerWidth - 3))}`;
      lines.push(`${indent}${c(bColor, "│")} ${padVisible(errRow, innerWidth)} ${c(bColor, "│")}`);
    } else if (this.config.hint) {
      const hintRow = c(PALETTE.muted, truncatePlain(this.config.hint, innerWidth));
      lines.push(`${indent}${c(bColor, "│")} ${padVisible(hintRow, innerWidth)} ${c(bColor, "│")}`);
    }

    // Bottom border
    const leftFooter = ` ${c(PALETTE.muted, this.config.footerHints ?? "↵ confirm · esc cancel")} `;
    const botFill = Math.max(1, width - 3 - visibleLength(leftFooter));
    lines.push(`${indent}${c(bColor, "╰─")}${leftFooter}${c(bColor, "─".repeat(botFill))}${c(bColor, "╯")}`);

    let buf = SYNC_START;
    if (this.renderedLines === 0) {
      buf += `\r\n${lines.join("\x1b[K\r\n")}\x1b[K\x1b[J`;
    } else {
      const moveUp = this.renderedLines > 1 ? `\x1b[${this.renderedLines - 1}A` : "";
      buf += `${moveUp}\r${lines.join("\x1b[K\r\n")}\x1b[K\x1b[J`;
    }
    buf += SYNC_END;

    this.out.write(buf);
    this.renderedLines = lines.length;
  }
}

export interface ConfirmModalConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  defaultConfirm?: boolean;
  width?: number;
}

export type ConfirmOutcome = { confirmed: boolean };

/**
 * Scroll-safe floating confirmation dialog (`termcn.dev` / `tooey.design` style).
 * Supports ←/→/Tab to toggle buttons, y/n shortcuts, Enter to confirm, Esc to cancel.
 */
export class ConfirmModal implements ActiveModal {
  private focusedConfirm: boolean;
  private renderedLines = 0;
  private closed = false;

  constructor(
    private readonly config: ConfirmModalConfig,
    private readonly onDone: (outcome: ConfirmOutcome) => void,
    private readonly out: NodeJS.WriteStream = process.stdout,
  ) {
    this.focusedConfirm = config.defaultConfirm ?? false;
  }

  public open(): void {
    this.render();
  }

  public handleKey(str: string, key: readline.Key = {}): void {
    if (this.closed) return;

    if (key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d"))) {
      this.close();
      this.onDone({ confirmed: false });
      return;
    }

    if (key.name === "left" || key.name === "right" || key.name === "tab") {
      this.focusedConfirm = !this.focusedConfirm;
      this.render();
      return;
    }

    if (str === "y" || str === "Y") {
      this.close();
      this.onDone({ confirmed: true });
      return;
    }

    if (str === "n" || str === "N") {
      this.close();
      this.onDone({ confirmed: false });
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      const ok = this.focusedConfirm;
      this.close();
      this.onDone({ confirmed: ok });
    }
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.out.isTTY || this.renderedLines === 0) {
      this.renderedLines = 0;
      return;
    }
    const moveUp = this.renderedLines > 1 ? `\x1b[${this.renderedLines - 1}A` : "";
    this.out.write(`${SYNC_START}${moveUp}\r\x1b[J\x1b[1A\r\x1b[K${SYNC_END}`);
    this.renderedLines = 0;
  }

  private render(): void {
    if (!this.out.isTTY) return;
    const cols = this.out.columns || 88;
    const width = Math.min(this.config.width ?? termWidth(68, 48), Math.max(44, cols - 4));
    const innerWidth = width - 4;
    const indent = "  ";
    const bColor = this.config.danger ? PALETTE.danger : PALETTE.borderFocus;

    const confirmText = this.config.confirmLabel ?? "Confirm";
    const cancelText = this.config.cancelLabel ?? "Cancel";
    const activeAccent = this.config.danger ? PALETTE.danger : PALETTE.accent;

    const confirmBtn = this.focusedConfirm
      ? `${PALETTE.surfaceActiveBg}${activeAccent}${PALETTE.bold} › ${confirmText} ${PALETTE.reset}`
      : c(PALETTE.muted, `  ${confirmText} `);
    const cancelBtn = !this.focusedConfirm
      ? `${PALETTE.surfaceActiveBg}${PALETTE.text}${PALETTE.bold} › ${cancelText} ${PALETTE.reset}`
      : c(PALETTE.muted, `  ${cancelText} `);

    const lines: string[] = [];

    const leftTitle = ` ${c(activeAccent + PALETTE.bold, "✦")} ${c(PALETTE.text + PALETTE.bold, this.config.title)} `;
    const topFill = Math.max(1, width - 3 - visibleLength(leftTitle));
    lines.push(`${indent}${c(bColor, "╭─")}${leftTitle}${c(bColor, "─".repeat(topFill))}${c(bColor, "╮")}`);

    const msgLine = c(PALETTE.secondary, truncatePlain(this.config.message, innerWidth));
    lines.push(`${indent}${c(bColor, "│")} ${padVisible(msgLine, innerWidth)} ${c(bColor, "│")}`);
    lines.push(`${indent}${c(bColor, "│")} ${" ".repeat(innerWidth)} ${c(bColor, "│")}`);

    const btnRow = `${confirmBtn}   ${cancelBtn}`;
    lines.push(`${indent}${c(bColor, "│")} ${padVisible(btnRow, innerWidth)} ${c(bColor, "│")}`);

    const leftFooter = ` ${c(PALETTE.muted, "←→ switch · y/n · ↵ confirm · esc cancel")} `;
    const botFill = Math.max(1, width - 3 - visibleLength(leftFooter));
    lines.push(`${indent}${c(bColor, "╰─")}${leftFooter}${c(bColor, "─".repeat(botFill))}${c(bColor, "╯")}`);

    let buf = SYNC_START;
    if (this.renderedLines === 0) {
      buf += `\r\n${lines.join("\x1b[K\r\n")}\x1b[K\x1b[J`;
    } else {
      const moveUp = this.renderedLines > 1 ? `\x1b[${this.renderedLines - 1}A` : "";
      buf += `${moveUp}\r${lines.join("\x1b[K\r\n")}\x1b[K\x1b[J`;
    }
    buf += SYNC_END;

    this.out.write(buf);
    this.renderedLines = lines.length;
  }
}

/**
 * Scroll-safe floating mdxcn-inspired guided setup modal:
 * renders minimal `① ② ③` Steps + optional Callout + 1 or more input fields inside one card.
 * Supports pasting, secret masking (^R toggle), Tab/↑/↓ field navigation, Enter to advance/submit, Esc to go back.
 */
export class FormModal implements ActiveModal {
  private values: string[];
  private cursors: number[];
  private activeIdx = 0;
  private revealSecrets = false;
  private errorMsg: string | null = null;
  private renderedLines = 0;
  private closed = false;

  constructor(
    private readonly config: FormModalConfig,
    private readonly onDone: (outcome: FormOutcome) => void,
    private readonly out: NodeJS.WriteStream = process.stdout,
  ) {
    this.values = config.fields.map((f) => f.initialValue ?? "");
    this.cursors = this.values.map((v) => v.length);
  }

  public get currentFieldIndex(): number {
    return this.activeIdx;
  }

  public open(): void {
    this.render();
  }

  public handleKey(str: string, key: readline.Key = {}): void {
    if (this.closed) return;

    if (key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d"))) {
      this.close();
      this.onDone({ action: "cancel" });
      return;
    }

    if (key.ctrl && key.name === "r") {
      this.revealSecrets = !this.revealSecrets;
      this.render();
      return;
    }

    const total = this.config.fields.length;
    if (total > 1 && (key.name === "tab" || key.name === "down" || key.name === "up")) {
      const delta = key.name === "up" || (key.name === "tab" && key.shift) ? -1 : 1;
      this.activeIdx = (this.activeIdx + delta + total) % total;
      this.errorMsg = null;
      this.render();
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      const field = this.config.fields[this.activeIdx];
      const curVal = this.values[this.activeIdx].trim();
      if (field.validate) {
        const err = field.validate(curVal);
        if (err) {
          this.errorMsg = err;
          this.render();
          return;
        }
      }

      if (this.activeIdx < total - 1) {
        this.activeIdx++;
        this.errorMsg = null;
        this.render();
        return;
      }

      const result: Record<string, string> = {};
      for (let i = 0; i < total; i++) {
        const f = this.config.fields[i];
        const v = this.values[i].trim();
        if (f.validate) {
          const err = f.validate(v);
          if (err) {
            this.activeIdx = i;
            this.errorMsg = err;
            this.render();
            return;
          }
        }
        result[f.id] = v;
      }

      this.close();
      this.onDone({ action: "submit", values: result });
      return;
    }

    this.errorMsg = null;
    const val = this.values[this.activeIdx];
    const cur = this.cursors[this.activeIdx];

    if (key.name === "backspace") {
      if (cur > 0) {
        this.values[this.activeIdx] = val.slice(0, cur - 1) + val.slice(cur);
        this.cursors[this.activeIdx] = cur - 1;
        this.render();
      }
      return;
    }

    if (key.name === "delete") {
      if (cur < val.length) {
        this.values[this.activeIdx] = val.slice(0, cur) + val.slice(cur + 1);
        this.render();
      }
      return;
    }

    if (key.name === "left") {
      if (cur > 0) {
        this.cursors[this.activeIdx] = cur - 1;
        this.render();
      }
      return;
    }

    if (key.name === "right") {
      if (cur < val.length) {
        this.cursors[this.activeIdx] = cur + 1;
        this.render();
      }
      return;
    }

    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      this.cursors[this.activeIdx] = 0;
      this.render();
      return;
    }

    if (key.name === "end" || (key.ctrl && key.name === "e")) {
      this.cursors[this.activeIdx] = val.length;
      this.render();
      return;
    }

    if (key.ctrl && key.name === "u") {
      this.values[this.activeIdx] = "";
      this.cursors[this.activeIdx] = 0;
      this.render();
      return;
    }

    if (str && !key.ctrl && !key.meta) {
      const clean = str.replace(/[\r\n\x00-\x1f\x7f]/g, "");
      if (clean) {
        this.values[this.activeIdx] = val.slice(0, cur) + clean + val.slice(cur);
        this.cursors[this.activeIdx] = cur + clean.length;
        this.render();
      }
    }
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.out.isTTY || this.renderedLines === 0) {
      this.renderedLines = 0;
      return;
    }
    const moveUp = this.renderedLines > 1 ? `\x1b[${this.renderedLines - 1}A` : "";
    this.out.write(`${SYNC_START}${moveUp}\r\x1b[J\x1b[1A\r\x1b[K${SYNC_END}`);
    this.renderedLines = 0;
  }

  private render(): void {
    if (!this.out.isTTY) return;
    const cols = this.out.columns || 88;
    const width = Math.min(this.config.width ?? termWidth(78, 54), Math.max(46, cols - 4));
    const innerWidth = width - 4;
    const indent = "  ";
    const bColor = this.errorMsg ? PALETTE.danger : PALETTE.borderFocus;

    const lines: string[] = [];

    // Top border
    const leftTitle = ` ${c(PALETTE.accent + PALETTE.bold, "✦")} ${c(PALETTE.text + PALETTE.bold, this.config.title)} `;
    const rightTitle = this.config.subtitle ? ` ${c(PALETTE.info, this.config.subtitle)} ` : "";
    const topFill = Math.max(
      1,
      width - 3 - visibleLength(leftTitle) - visibleLength(rightTitle) - (rightTitle ? 1 : 0),
    );
    lines.push(
      `${indent}${c(bColor, "╭─")}${leftTitle}${c(bColor, "─".repeat(topFill))}${rightTitle}${c(bColor, rightTitle ? "─╮" : "╮")}`,
    );

    // mdxcn-style minimal numbered Steps + optional Callout strip
    if (this.config.steps && this.config.steps.length > 0) {
      for (let i = 0; i < this.config.steps.length; i++) {
        const glyph = c(PALETTE.accent + PALETTE.bold, STEP_GLYPHS[i] || `${i + 1}.`);
        const stepLine = renderInlineCodeText(truncatePlain(this.config.steps[i], innerWidth - 3), PALETTE.secondary);
        lines.push(`${indent}${c(bColor, "│")} ${padVisible(clipVisible(`${glyph} ${stepLine}`, innerWidth), innerWidth)} ${c(bColor, "│")}`);
      }
      if (this.config.callout) {
        const callLine = renderInlineCodeText(truncatePlain(this.config.callout, innerWidth - 3), PALETTE.muted);
        lines.push(
          `${indent}${c(bColor, "│")} ${padVisible(clipVisible(`${c(PALETTE.info, "┃")} ${callLine}`, innerWidth), innerWidth)} ${c(bColor, "│")}`,
        );
      }
      lines.push(`${indent}${c(PALETTE.border, "├" + "─".repeat(width - 2) + "┤")}`);
    }

    // Input fields
    const maxFieldLen = innerWidth - 14;
    for (let i = 0; i < this.config.fields.length; i++) {
      const f = this.config.fields[i];
      const val = this.values[i];
      const cur = this.cursors[i];
      const focused = i === this.activeIdx;

      const lblColor = focused ? PALETTE.text + PALETTE.bold : PALETTE.muted;
      const secretTag = f.secret ? c(PALETTE.muted, this.revealSecrets ? " · visible" : " · masked") : "";
      lines.push(
        `${indent}${c(bColor, "│")} ${padVisible(`${c(lblColor, f.label)}${secretTag}`, innerWidth)} ${c(bColor, "│")}`,
      );

      let displayStr: string;
      if (!val) {
        const cursorGlyph = focused ? c(PALETTE.accent, "▎") : "";
        displayStr = `${cursorGlyph}${c(PALETTE.muted, truncatePlain(f.placeholder ?? "Enter value…", maxFieldLen))}`;
      } else if (f.secret && !this.revealSecrets) {
        const masked = "•".repeat(Math.min(val.length, Math.max(8, maxFieldLen - 10)));
        const cursorGlyph = focused ? c(PALETTE.accent, "▎") : "";
        displayStr = `${c(PALETTE.text, masked)}${cursorGlyph} ${c(PALETTE.muted, `(${val.length})`)}`;
      } else {
        const shown = val.length > maxFieldLen ? `…${val.slice(val.length - maxFieldLen + 1)}` : val;
        if (focused) {
          const pos = Math.min(cur, shown.length);
          displayStr = `${c(PALETTE.text, shown.slice(0, pos))}${c(PALETTE.accent, "▎")}${c(PALETTE.text, shown.slice(pos))}`;
        } else {
          displayStr = c(PALETTE.secondary, shown);
        }
      }

      const glyph = focused ? c(PALETTE.accent + PALETTE.bold, "❯") : c(PALETTE.border, "›");
      const fieldRow = `${glyph} ${displayStr}`;
      lines.push(
        `${indent}${c(bColor, "│")} ${padVisible(clipVisible(fieldRow, innerWidth), innerWidth)} ${c(bColor, "│")}`,
      );
      if (i < this.config.fields.length - 1) {
        lines.push(`${indent}${c(bColor, "│")} ${" ".repeat(innerWidth)} ${c(bColor, "│")}`);
      }
    }

    if (this.errorMsg) {
      const errRow = `${c(PALETTE.danger, "✗")} ${c(PALETTE.danger, truncatePlain(this.errorMsg, innerWidth - 3))}`;
      lines.push(`${indent}${c(bColor, "│")} ${padVisible(errRow, innerWidth)} ${c(bColor, "│")}`);
    }

    const hasSecret = this.config.fields.some((f) => f.secret);
    const defaultHints =
      this.config.fields.length > 1
        ? `tab/↑↓ field · ↵ next/connect${hasSecret ? " · ^R reveal" : ""} · esc back`
        : `↵ connect${hasSecret ? " · ^R reveal" : ""} · esc back`;
    const leftFooter = ` ${c(PALETTE.muted, truncatePlain(this.config.footerHints ?? defaultHints, width - 6))} `;
    const botFill = Math.max(1, width - 3 - visibleLength(leftFooter));
    lines.push(`${indent}${c(bColor, "╰─")}${leftFooter}${c(bColor, "─".repeat(botFill))}${c(bColor, "╯")}`);

    let buf = SYNC_START;
    if (this.renderedLines === 0) {
      buf += `\r\n${lines.join("\x1b[K\r\n")}\x1b[K\x1b[J`;
    } else {
      const moveUp = this.renderedLines > 1 ? `\x1b[${this.renderedLines - 1}A` : "";
      buf += `${moveUp}\r${lines.join("\x1b[K\r\n")}\x1b[K\x1b[J`;
    }
    buf += SYNC_END;

    this.out.write(buf);
    this.renderedLines = lines.length;
  }
}
