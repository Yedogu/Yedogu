import {
  PALETTE,
  SYNC_END,
  SYNC_START,
  c,
  clipVisible,
  padVisible,
  truncatePlain,
  visibleLength,
} from "./theme.js";

const NO_COLOR = Boolean(process.env.NO_COLOR);

/**
 * Re-applies `bgSeq` after any `\x1b[0m` reset inside `str`, and pads to `width`
 * so elevated panels (Prompt Box, Modals, Popovers, Sidebar) have a seamless solid background.
 */
export function paintSurfaceLine(str: string, width: number, bgSeq: string): string {
  const clipped = visibleLength(str) > width ? clipVisible(str, width) : str;
  const vis = visibleLength(clipped);
  const pad = " ".repeat(Math.max(0, width - vis));
  if (NO_COLOR || !bgSeq) return `${clipped}${pad}`;
  const rehydrated = clipped.replace(/\x1b\[0m/g, `\x1b[0m${bgSeq}`);
  return `${bgSeq}${rehydrated}${pad}\x1b[0m`;
}

/**
 * Takes the first `count` visible columns of `str` while preserving ANSI styling.
 */
export function takeVisiblePrefix(str: string, count: number): string {
  if (count <= 0) return "";
  let out = "";
  let vis = 0;
  let i = 0;
  while (i < str.length && vis < count) {
    if (str[i] === "\x1b" && str[i + 1] === "[") {
      const m = /^\x1b\[[0-9;?]*[a-zA-Z]/.exec(str.slice(i));
      if (m) {
        if (m[0].endsWith("m")) out += m[0];
        i += m[0].length;
        continue;
      }
    }
    out += str[i];
    vis++;
    i++;
  }
  return out + (vis < count ? " ".repeat(count - vis) : "") + (NO_COLOR ? "" : "\x1b[0m");
}

/**
 * Skips the first `skip` visible columns of `str` and returns the remainder with active ANSI state.
 */
export function takeVisibleSuffix(str: string, skip: number): string {
  let vis = 0;
  let i = 0;
  let activeSgr = "";
  while (i < str.length && vis < skip) {
    if (str[i] === "\x1b" && str[i + 1] === "[") {
      const m = /^\x1b\[[0-9;?]*[a-zA-Z]/.exec(str.slice(i));
      if (m) {
        const seq = m[0];
        if (seq.endsWith("m")) {
          activeSgr = seq === "\x1b[0m" ? "" : activeSgr + seq;
        }
        i += seq.length;
        continue;
      }
    }
    vis++;
    i++;
  }
  return `${activeSgr}${str.slice(i)}`;
}

/**
 * Splices an elevated floating overlay block onto `baseRows` at `(topRow, leftCol)`.
 */
export function compositeOverlay(
  baseRows: string[],
  overlayLines: string[],
  topRow: number,
  leftCol: number,
  boxWidth: number,
  totalCols: number,
): string[] {
  const out = [...baseRows];
  for (let i = 0; i < overlayLines.length; i++) {
    const r = topRow + i;
    if (r < 0 || r >= out.length) continue;
    const base = out[r] ?? "";
    const leftPart = takeVisiblePrefix(base, leftCol);
    const rightStart = leftCol + boxWidth;
    const rightPart = rightStart < totalCols ? takeVisibleSuffix(base, rightStart) : "";
    out[r] = `${leftPart}${overlayLines[i]}${rightPart}`;
  }
  return out;
}

export interface OpenCodePromptBoxOptions {
  width: number;
  input: string;
  cursorPos: number;
  placeholder: string;
  agentId: string;
  agentTitle?: string;
  modelDisplay: string;
  providerDisplay: string;
  effort?: string;
  shellMode?: boolean;
}

export interface OpenCodePromptBoxResult {
  lines: string[];
  cursorRowOffset: number;
  cursorColOffset: number;
}

/**
 * Renders OpenCode's exact elevated borderless prompt box (`#181818` surface + left accent rail `┃`).
 */
export function renderOpenCodePromptBox(opts: OpenCodePromptBoxOptions): OpenCodePromptBoxResult {
  const width = Math.max(36, opts.width);
  const innerW = Math.max(20, width - 4);
  const railColor = opts.shellMode ? PALETTE.warning : PALETTE.accent;
  const rail = c(railColor, "┃");
  const panelBg = PALETTE.pillBg;

  const emptyLine = `${rail} ${paintSurfaceLine("", innerW + 2, panelBg)}`;

  let inputDisplay: string;
  let cursorColOffset = 3;
  if (!opts.input) {
    inputDisplay = c(PALETTE.muted, truncatePlain(opts.placeholder, innerW));
    cursorColOffset = 3;
  } else {
    const prefix = opts.shellMode ? `${c(PALETTE.warning + PALETTE.bold, "!")} ` : "";
    const prefixLen = opts.shellMode ? 2 : 0;
    const raw = opts.shellMode && opts.input.startsWith("!") ? opts.input.slice(1) : opts.input;
    const adjCursor = opts.shellMode && opts.input.startsWith("!") ? Math.max(0, opts.cursorPos - 1) : opts.cursorPos;
    const maxInputW = Math.max(10, innerW - prefixLen);
    const viewStart = Math.max(0, adjCursor - maxInputW + 1);
    const visibleText = raw.slice(viewStart, viewStart + maxInputW);
    inputDisplay = `${prefix}${c(PALETTE.text, visibleText)}`;
    cursorColOffset = 3 + prefixLen + (adjCursor - viewStart);
  }
  const inputLine = `${rail} ${paintSurfaceLine(` ${inputDisplay}`, innerW + 2, panelBg)}`;

  // Bottom metadata row inside prompt box: `Agent · Model  Provider · effort: medium`
  const agentName = opts.shellMode ? "Shell" : opts.agentId.charAt(0).toUpperCase() + opts.agentId.slice(1);
  const effortStr = opts.effort ? ` · effort: ${opts.effort}` : "";
  const metaText = opts.shellMode
    ? `${c(PALETTE.warning + PALETTE.bold, "Shell Mode")} ${c(PALETTE.muted, "· runs directly in workspace")}`
    : `${c(PALETTE.accent + PALETTE.bold, agentName)}  ${c(PALETTE.text + PALETTE.bold, truncatePlain(opts.modelDisplay, 32))} ${c(PALETTE.muted, `${opts.providerDisplay}${effortStr}`)}`;
  const metaLine = `${rail} ${paintSurfaceLine(` ${metaText}`, innerW + 2, panelBg)}`;

  return {
    lines: [emptyLine, inputLine, emptyLine, metaLine, emptyLine],
    cursorRowOffset: 1,
    cursorColOffset,
  };
}

/**
 * Parses SGR mouse wheel events (`\x1b[<64;col;rowM` = up, `\x1b[<65;col;rowM` = down).
 */
export function parseSgrMouseWheel(seq: string): "up" | "down" | null {
  const m = seq.match(/\x1b\[<(\d+);\d+;\d+[Mm]/);
  if (!m) return null;
  const code = Number(m[1]);
  if (code === 64) return "up";
  if (code === 65) return "down";
  return null;
}

export interface SgrMouseEvent {
  kind: "down" | "drag" | "up" | "wheel-up" | "wheel-down";
  col: number;
  row: number;
}

/**
 * Extracts all SGR mouse events (wheel, press, drag, release) from a raw stdin chunk
 * and strips all SGR / X10 mouse sequences so `readline.emitKeypressEvents` never emits
 * `64;...M` as printable characters.
 */
export function extractAndStripMouseSequences(chunk: string): {
  cleaned: string;
  wheels: Array<"up" | "down">;
  events: SgrMouseEvent[];
} {
  const wheels: Array<"up" | "down"> = [];
  const events: SgrMouseEvent[] = [];
  const sgrRx = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
  let m: RegExpExecArray | null;
  while ((m = sgrRx.exec(chunk)) !== null) {
    const code = Number(m[1]);
    const col = Number(m[2]);
    const row = Number(m[3]);
    const term = m[4];
    if (code === 64) {
      wheels.push("up");
      events.push({ kind: "wheel-up", col, row });
    } else if (code === 65) {
      wheels.push("down");
      events.push({ kind: "wheel-down", col, row });
    } else if (code === 0 && term === "M") {
      events.push({ kind: "down", col, row });
    } else if ((code === 32 || code === 33 || code === 34) && term === "M") {
      events.push({ kind: "drag", col, row });
    } else if ((code === 0 || code === 3) && term === "m") {
      events.push({ kind: "up", col, row });
    }
  }
  const cleaned = chunk
    .replace(/\x1b\[<[\d;]*[Mm]/g, "")
    .replace(/\x1b\[M[\s\S]{3}/g, "");
  return { cleaned, wheels, events };
}

/**
 * Renders a crisp 1-column vertical scrollbar (`┃` thumb, `│` track).
 */
export function renderScrollbarColumn(
  viewportHeight: number,
  totalItems: number,
  topIndex: number,
): string[] {
  const h = Math.max(1, viewportHeight);
  if (totalItems <= h) {
    return new Array<string>(h).fill(c(PALETTE.borderSubtle, "│"));
  }
  const thumbSize = Math.max(1, Math.min(h, Math.round((h / totalItems) * h)));
  const maxTop = Math.max(1, totalItems - h);
  const ratio = Math.max(0, Math.min(1, topIndex / maxTop));
  const thumbStart = Math.round(ratio * (h - thumbSize));
  const out: string[] = [];
  for (let i = 0; i < h; i++) {
    if (i >= thumbStart && i < thumbStart + thumbSize) {
      out.push(c(PALETTE.accent, "┃"));
    } else {
      out.push(c(PALETTE.borderSubtle, "│"));
    }
  }
  return out;
}

export interface OpenCodeModalOption<T = string> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  badgeColor?: string;
  badgeRaw?: boolean;
  checked?: boolean;
  category?: string;
  keywords?: string;
}

export interface OpenCodeModalOptions<T = string> {
  title: string;
  width: number;
  maxRows?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  query?: string;
  options: readonly OpenCodeModalOption<T>[];
  selectedIndex: number;
  footerPanel?: string[];
  footerHint?: string;
}

/**
 * Renders OpenCode's exact floating borderless modal (`Connect an integration`, `Select model`, etc.)
 * with elevated `#161616` surface, category headers, green `✓` checkmarks, and full-width highlight bar.
 */
export function renderOpenCodeModal<T>(opts: OpenCodeModalOptions<T>): {
  lines: string[];
  cursorRowOffset?: number;
  cursorColOffset?: number;
  scrollbarRowOffset?: number;
  scrollbarHeight?: number;
} {
  const width = Math.max(44, opts.width);
  const innerW = width - 4;
  const modalBg = PALETTE.pillBg;
  const activeBg = PALETTE.surfaceActiveBg;
  const lines: string[] = [];

  // Top padding
  lines.push(paintSurfaceLine("", width, modalBg));

  // Header: Title on left, `esc` on right
  const titleStr = c(PALETTE.text + PALETTE.bold, truncatePlain(opts.title, innerW - 6));
  const escStr = c(PALETTE.muted, "esc");
  const hdrGap = Math.max(1, innerW - visibleLength(titleStr) - visibleLength(escStr));
  lines.push(paintSurfaceLine(`  ${titleStr}${" ".repeat(hdrGap)}${escStr}  `, width, modalBg));

  let cursorRowOffset: number | undefined;
  let cursorColOffset: number | undefined;

  if (opts.searchable !== false) {
    lines.push(paintSurfaceLine("", width, modalBg));
    const q = opts.query ?? "";
    const searchStr = q
      ? c(PALETTE.text, truncatePlain(q, innerW - 2))
      : c(PALETTE.muted, opts.searchPlaceholder ?? "Search");
    cursorRowOffset = lines.length;
    cursorColOffset = 2 + (q ? Math.min(q.length, innerW - 2) : 0);
    lines.push(paintSurfaceLine(`  ${searchStr}`, width, modalBg));
  }

  lines.push(paintSurfaceLine("", width, modalBg));

  const maxVisible = Math.max(4, opts.maxRows ?? 12);
  const total = opts.options.length;
  let start = 0;
  if (total > maxVisible) {
    start = Math.max(0, Math.min(opts.selectedIndex - Math.floor(maxVisible / 2), total - maxVisible));
  }
  const slice = opts.options.slice(start, start + maxVisible);
  const showScrollbar = total > maxVisible;
  const scrollbar = showScrollbar ? renderScrollbarColumn(slice.length, total, start) : [];
  let scrollbarRowOffset: number | undefined;
  let scrollbarHeight: number | undefined;

  if (slice.length === 0) {
    lines.push(paintSurfaceLine(`  ${c(PALETTE.muted, "No matching items")}`, width, modalBg));
  } else {
    let lastCategory: string | undefined;
    for (let i = 0; i < slice.length; i++) {
      const opt = slice[i];
      const globalIdx = start + i;
      const isSel = globalIdx === opts.selectedIndex;

      if (opt.category && opt.category !== lastCategory) {
        if (lastCategory !== undefined) {
          lines.push(paintSurfaceLine("", width, modalBg));
        }
        lastCategory = opt.category;
        lines.push(paintSurfaceLine(`  ${c(PALETTE.muted + PALETTE.bold, opt.category)}`, width, modalBg));
      }

      if (showScrollbar && scrollbarRowOffset === undefined) {
        scrollbarRowOffset = lines.length;
        scrollbarHeight = slice.length;
      }

      const sbChar = showScrollbar ? scrollbar[i] : " ";
      const checkGlyph = opt.checked
        ? `${c(PALETTE.success + PALETTE.bold, "✓")} `
        : "  ";
      const rightText = opt.badge
        ? opt.badgeRaw
          ? opt.badge
          : c(opt.badgeColor || PALETTE.muted, truncatePlain(opt.badge, 24))
        : opt.description
          ? c(PALETTE.muted, truncatePlain(opt.description, 26))
          : "";
      const rightLen = visibleLength(rightText);
      const labelBudget = Math.max(12, innerW - 6 - (rightLen ? rightLen + 2 : 0));
      const labelStr = c(isSel ? PALETTE.text + PALETTE.bold : PALETTE.text, truncatePlain(opt.label, labelBudget));
      const gap = Math.max(1, innerW - 3 - visibleLength(labelStr) - rightLen);

      if (isSel) {
        const rail = c(PALETTE.accent, "┃");
        const content = `${checkGlyph}${labelStr}${" ".repeat(gap)}${rightText} ${sbChar}`;
        lines.push(`${rail}${paintSurfaceLine(` ${content}`, width - 1, activeBg)}`);
      } else {
        const content = `${checkGlyph}${labelStr}${" ".repeat(gap)}${rightText} ${sbChar}`;
        lines.push(paintSurfaceLine(`  ${content}`, width, modalBg));
      }
    }
  }

  if (opts.footerPanel && opts.footerPanel.length > 0) {
    lines.push(paintSurfaceLine("", width, modalBg));
    for (const fl of opts.footerPanel) {
      lines.push(paintSurfaceLine(`  ${fl}`, width, modalBg));
    }
  }

  if (opts.footerHint) {
    lines.push(paintSurfaceLine("", width, modalBg));
    lines.push(paintSurfaceLine(`  ${c(PALETTE.muted, truncatePlain(opts.footerHint, innerW))}`, width, modalBg));
  }

  lines.push(paintSurfaceLine("", width, modalBg));

  return { lines, cursorRowOffset, cursorColOffset, scrollbarRowOffset, scrollbarHeight };
}

/**
 * Full-screen alternate-buffer terminal canvas with synchronized DEC 2026 output.
 */
export class TerminalScreen {
  private entered = false;

  constructor(private readonly out: NodeJS.WriteStream = process.stdout) {}

  public enter(): void {
    if (!this.out.isTTY || this.entered) return;
    this.entered = true;
    this.out.write("\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?25l\x1b]0;Yedogu\x07");
  }

  public leave(): void {
    if (!this.out.isTTY || !this.entered) return;
    this.entered = false;
    this.out.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[0m\x1b[?25h\x1b[?1049l");
  }

  public setMouseEnabled(enabled: boolean): void {
    if (!this.out.isTTY || !this.entered) return;
    if (enabled) {
      this.out.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
    } else {
      this.out.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l");
    }
  }

  public get size(): { cols: number; rows: number } {
    return {
      cols: Math.max(40, this.out.columns || 100),
      rows: Math.max(14, this.out.rows || 30),
    };
  }

  public paint(frameRows: string[], cursor?: { row: number; col: number }): void {
    if (!this.out.isTTY) return;
    const { cols, rows } = this.size;
    const bgSeq = PALETTE.surfaceBg;
    let buf = `${SYNC_START}\x1b[?25l\x1b[H`;

    for (let r = 0; r < rows; r++) {
      const line = frameRows[r] ?? "";
      const painted = paintSurfaceLine(line, cols, bgSeq);
      buf += painted;
      if (r < rows - 1) buf += "\r\n";
    }

    if (cursor && cursor.row >= 0 && cursor.row < rows && cursor.col >= 0 && cursor.col < cols) {
      buf += `\x1b[${cursor.row + 1};${cursor.col + 1}H\x1b[?25h`;
    }

    buf += SYNC_END;
    this.out.write(buf);
  }
}
