import os from "node:os";

const NO_COLOR = Boolean(process.env.NO_COLOR);

type RGB = readonly [number, number, number];

function fg([r, g, b]: RGB): string {
  return NO_COLOR ? "" : `\x1b[38;2;${r};${g};${b}m`;
}

function bg([r, g, b]: RGB): string {
  return NO_COLOR ? "" : `\x1b[48;2;${r};${g};${b}m`;
}

export interface ThemeSpec {
  id: string;
  name: string;
  vibe: string;
  accent: RGB;
  accentSoft: RGB;
  text: RGB;
  secondary: RGB;
  muted: RGB;
  border: RGB;
  borderFocus: RGB;
  success: RGB;
  warning: RGB;
  danger: RGB;
  info: RGB;
  reasoning: RGB;
  surfaceBg: RGB;
  surfaceActiveBg: RGB;
  pillBg: RGB;
}

/**
 * Curated termcn.dev + WebTUI terminal color themes.
 * Switchable live via `/theme` or `Ctrl+T` without restarting.
 */
export const THEMES: Record<string, ThemeSpec> = {
  claude: {
    id: "claude",
    name: "Claude Warm",
    vibe: "Warm terracotta editorial minimalism",
    accent: [217, 119, 87],
    accentSoft: [232, 160, 134],
    text: [236, 234, 228],
    secondary: [168, 164, 156],
    muted: [118, 114, 108],
    border: [68, 65, 60],
    borderFocus: [122, 106, 94],
    success: [110, 194, 148],
    warning: [229, 181, 103],
    danger: [224, 108, 117],
    info: [122, 162, 247],
    reasoning: [180, 151, 214],
    surfaceBg: [30, 29, 27],
    surfaceActiveBg: [48, 44, 40],
    pillBg: [42, 40, 37],
  },
  catppuccin: {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    vibe: "Soothing pastel mauve & peach",
    accent: [203, 166, 247],
    accentSoft: [245, 194, 231],
    text: [205, 214, 244],
    secondary: [166, 173, 200],
    muted: [127, 132, 156],
    border: [69, 71, 90],
    borderFocus: [137, 180, 250],
    success: [166, 227, 161],
    warning: [249, 226, 175],
    danger: [243, 139, 168],
    info: [137, 220, 235],
    reasoning: [180, 190, 254],
    surfaceBg: [30, 30, 46],
    surfaceActiveBg: [49, 50, 68],
    pillBg: [39, 40, 58],
  },
  tokyonight: {
    id: "tokyonight",
    name: "Tokyo Night",
    vibe: "Crisp neon indigo & electric sky",
    accent: [122, 162, 247],
    accentSoft: [125, 207, 255],
    text: [192, 202, 245],
    secondary: [169, 177, 214],
    muted: [86, 95, 137],
    border: [59, 66, 97],
    borderFocus: [122, 162, 247],
    success: [158, 206, 106],
    warning: [224, 175, 104],
    danger: [247, 118, 142],
    info: [125, 207, 255],
    reasoning: [187, 154, 247],
    surfaceBg: [26, 27, 38],
    surfaceActiveBg: [41, 46, 66],
    pillBg: [36, 40, 59],
  },
  gruvbox: {
    id: "gruvbox",
    name: "Gruvbox Dark",
    vibe: "Retro groove amber, aqua & cream",
    accent: [254, 128, 25],
    accentSoft: [250, 189, 47],
    text: [235, 219, 178],
    secondary: [189, 174, 147],
    muted: [146, 131, 116],
    border: [80, 73, 69],
    borderFocus: [214, 93, 14],
    success: [184, 187, 38],
    warning: [250, 189, 47],
    danger: [251, 73, 52],
    info: [131, 165, 152],
    reasoning: [211, 134, 155],
    surfaceBg: [40, 40, 40],
    surfaceActiveBg: [60, 56, 54],
    pillBg: [50, 48, 47],
  },
  nord: {
    id: "nord",
    name: "Nord",
    vibe: "Arctic frost blues & calm snow",
    accent: [136, 192, 208],
    accentSoft: [143, 188, 187],
    text: [236, 239, 244],
    secondary: [216, 222, 233],
    muted: [129, 143, 168],
    border: [67, 76, 94],
    borderFocus: [129, 161, 193],
    success: [163, 190, 140],
    warning: [235, 203, 139],
    danger: [191, 97, 106],
    info: [129, 161, 193],
    reasoning: [180, 142, 173],
    surfaceBg: [46, 52, 64],
    surfaceActiveBg: [59, 66, 82],
    pillBg: [52, 59, 73],
  },
  vitesse: {
    id: "vitesse",
    name: "Vitesse Dark",
    vibe: "Minimalist botanical sage & sand",
    accent: [77, 147, 117],
    accentSoft: [128, 166, 101],
    text: [219, 215, 202],
    secondary: [165, 162, 152],
    muted: [117, 113, 104],
    border: [57, 58, 52],
    borderFocus: [77, 147, 117],
    success: [77, 147, 117],
    warning: [230, 204, 119],
    danger: [203, 118, 118],
    info: [99, 148, 191],
    reasoning: [217, 115, 159],
    surfaceBg: [24, 24, 24],
    surfaceActiveBg: [41, 41, 41],
    pillBg: [34, 34, 34],
  },
  dracula: {
    id: "dracula",
    name: "Dracula",
    vibe: "High-contrast violet, cyan & green",
    accent: [189, 147, 249],
    accentSoft: [255, 121, 198],
    text: [248, 248, 242],
    secondary: [189, 194, 214],
    muted: [98, 114, 164],
    border: [68, 71, 90],
    borderFocus: [189, 147, 249],
    success: [80, 250, 123],
    warning: [241, 250, 140],
    danger: [255, 85, 85],
    info: [139, 233, 253],
    reasoning: [255, 121, 198],
    surfaceBg: [40, 42, 54],
    surfaceActiveBg: [68, 71, 90],
    pillBg: [52, 55, 70],
  },
  everforest: {
    id: "everforest",
    name: "Everforest Dark",
    vibe: "Warm forest moss, clay & pine",
    accent: [167, 192, 128],
    accentSoft: [131, 192, 146],
    text: [211, 198, 170],
    secondary: [157, 169, 160],
    muted: [122, 132, 120],
    border: [71, 82, 88],
    borderFocus: [167, 192, 128],
    success: [167, 192, 128],
    warning: [219, 188, 127],
    danger: [230, 126, 128],
    info: [127, 187, 179],
    reasoning: [214, 153, 182],
    surfaceBg: [45, 53, 59],
    surfaceActiveBg: [61, 72, 77],
    pillBg: [52, 63, 68],
  },
  osmium: {
    id: "osmium",
    name: "WebTUI Osmium",
    vibe: "Metallic slate, electric azure & lilac",
    accent: [154, 191, 232],
    accentSoft: [176, 168, 235],
    text: [230, 235, 244],
    secondary: [156, 170, 192],
    muted: [106, 118, 138],
    border: [64, 73, 95],
    borderFocus: [154, 191, 232],
    success: [201, 222, 150],
    warning: [235, 177, 123],
    danger: [229, 83, 118],
    info: [154, 191, 232],
    reasoning: [217, 161, 232],
    surfaceBg: [27, 30, 39],
    surfaceActiveBg: [48, 56, 73],
    pillBg: [36, 41, 54],
  },
};

const LEGACY_THEME_MAP: Record<string, string> = {
  obsidian: "claude",
  emerald: "vitesse",
  amber: "gruvbox",
};

let activeTheme: ThemeSpec = THEMES.claude;

export function listThemes(): ThemeSpec[] {
  return Object.values(THEMES);
}

export function getActiveTheme(): ThemeSpec {
  return activeTheme;
}

export function setActiveTheme(themeId: string): ThemeSpec {
  const key = (themeId || "claude").trim().toLowerCase();
  const resolved = LEGACY_THEME_MAP[key] || key;
  if (THEMES[resolved]) {
    activeTheme = THEMES[resolved];
  }
  return activeTheme;
}

/**
 * Renders a compact 4-block TrueColor swatch preview for the `/theme` picker pop-up.
 */
export function renderThemeSwatch(spec: ThemeSpec): string {
  if (NO_COLOR) return "[theme]";
  return (
    `${fg(spec.accent)}█` +
    `${fg(spec.info)}█` +
    `${fg(spec.success)}█` +
    `${fg(spec.warning)}█` +
    `${fg(spec.danger)}█\x1b[0m`
  );
}

/**
 * Dynamic PALETTE backed by getters so switching themes via `/theme`
 * re-skins every component across the terminal instantaneously.
 */
export const PALETTE = {
  get reset() { return NO_COLOR ? "" : "\x1b[0m"; },
  get bold() { return NO_COLOR ? "" : "\x1b[1m"; },
  get dim() { return NO_COLOR ? "" : "\x1b[2m"; },
  get italic() { return NO_COLOR ? "" : "\x1b[3m"; },
  get underline() { return NO_COLOR ? "" : "\x1b[4m"; },

  get accent() { return fg(activeTheme.accent); },
  get accentSoft() { return fg(activeTheme.accentSoft); },
  get text() { return fg(activeTheme.text); },
  get secondary() { return fg(activeTheme.secondary); },
  get muted() { return fg(activeTheme.muted); },
  get border() { return fg(activeTheme.border); },
  get borderFocus() { return fg(activeTheme.borderFocus); },

  get success() { return fg(activeTheme.success); },
  get warning() { return fg(activeTheme.warning); },
  get danger() { return fg(activeTheme.danger); },
  get info() { return fg(activeTheme.info); },
  get reasoning() { return fg(activeTheme.reasoning); },

  get surfaceBg() { return bg(activeTheme.surfaceBg); },
  get surfaceActiveBg() { return bg(activeTheme.surfaceActiveBg); },
  get pillBg() { return bg(activeTheme.pillBg); },
};

/**
 * Synchronized terminal output (DEC Mode 2026) prevents flicker during interactive redraws.
 * Safely ignored by terminals that do not support it.
 */
export const SYNC_START = "\x1b[?2026h";
export const SYNC_END = "\x1b[?2026l";

/**
 * Backwards-compatible ANSI export mapped dynamically to the active theme.
 */
export const ANSI = {
  get reset() { return PALETTE.reset; },
  get bold() { return PALETTE.bold; },
  get dim() { return PALETTE.dim; },
  get italic() { return PALETTE.italic; },
  get underline() { return PALETTE.underline; },
  get accent() { return PALETTE.accent; },
  get cyan() { return PALETTE.info; },
  get emerald() { return PALETTE.success; },
  get amber() { return PALETTE.warning; },
  get rose() { return PALETTE.danger; },
  get purple() { return PALETTE.reasoning; },
  get blue() { return PALETTE.info; },
  get gray() { return PALETTE.secondary; },
  get darkGray() { return PALETTE.border; },
  get muted() { return PALETTE.muted; },
  get white() { return PALETTE.text; },
};

export function c(color: string, text: string): string {
  if (!color || NO_COLOR) return text;
  return `${color}${text}${PALETTE.reset}`;
}

export function kbd(label: string): string {
  if (NO_COLOR) return `[${label}]`;
  return `${PALETTE.pillBg}${PALETTE.secondary} ${label} ${PALETTE.reset}`;
}

export function badge(label: string, color = PALETTE.secondary): string {
  if (NO_COLOR) return `[${label}]`;
  return `${PALETTE.pillBg}${color} ${label} ${PALETTE.reset}`;
}

/**
 * Compact termcn-style mini context gauge (e.g., `▰▰▱▱▱ 18%`).
 */
export function renderMiniGauge(used: number, max = 200_000, width = 5): string {
  if (used <= 0) return "";
  const ratio = Math.max(0, Math.min(1, used / max));
  const filled = Math.max(used > 0 ? 1 : 0, Math.round(ratio * width));
  const empty = Math.max(0, width - filled);
  const fillCol = ratio > 0.8 ? PALETTE.danger : ratio > 0.55 ? PALETTE.warning : PALETTE.accent;
  const pct = Math.min(99, Math.max(1, Math.round(ratio * 100)));
  return `${c(fillCol, "▰".repeat(filled))}${c(PALETTE.border, "▱".repeat(empty))} ${c(PALETTE.muted, `${pct}%`)}`;
}

const ANSI_REGEX = /\x1b\[[0-9;?]*[a-zA-Z]/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}

export function padVisible(str: string, width: number, align: "left" | "right" = "left"): string {
  const len = visibleLength(str);
  if (len >= width) return str;
  const pad = " ".repeat(width - len);
  return align === "right" ? pad + str : str + pad;
}

/**
 * ANSI-safe truncation that preserves styling and appends an ellipsis if needed.
 */
export function clipVisible(str: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (visibleLength(str) <= maxLen) return str;
  const target = Math.max(1, maxLen - 1);
  let out = "";
  let vis = 0;
  let i = 0;
  let sawAnsi = false;
  while (i < str.length && vis < target) {
    if (str[i] === "\x1b" && str[i + 1] === "[") {
      const end = str.indexOf("m", i);
      if (end !== -1) {
        out += str.slice(i, end + 1);
        sawAnsi = true;
        i = end + 1;
        continue;
      }
    }
    out += str[i];
    vis++;
    i++;
  }
  return out + "…" + (sawAnsi && !NO_COLOR ? PALETTE.reset : "");
}

export function truncatePlain(str: string, maxLen: number): string {
  if (maxLen <= 3) return str.slice(0, Math.max(0, maxLen));
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 1)}…`;
}

export function termWidth(max = 92, min = 56): number {
  const cols = process.stdout.columns || 88;
  return Math.max(min, Math.min(max, cols - 4));
}

export function rule(width = termWidth(), label?: string, dashed = false): string {
  const ch = dashed ? "╌" : "─";
  if (!label) {
    return c(PALETTE.border, ch.repeat(Math.max(4, width)));
  }
  const cleanLabel = ` ${label} `;
  const rem = Math.max(4, width - visibleLength(cleanLabel) - 2);
  return `${c(PALETTE.border, ch.repeat(2))}${c(PALETTE.muted, cleanLabel)}${c(PALETTE.border, ch.repeat(rem))}`;
}

export function shortenPath(fullPath: string, maxLen = 46): string {
  const home = os.homedir();
  let display = fullPath;
  if (home && fullPath.toLowerCase().startsWith(home.toLowerCase())) {
    display = `~${fullPath.slice(home.length)}`;
  }
  if (display.length <= maxLen) return display;
  const parts = display.split(/[\\/]/);
  if (parts.length <= 2) return truncatePlain(display, maxLen);
  return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export type BoxBorderStyle = "round" | "square" | "double" | "dashed";

const BOX_GLYPHS: Record<
  BoxBorderStyle,
  { tl: string; tr: string; bl: string; br: string; h: string; v: string }
> = {
  round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  square: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
  dashed: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "╌", v: "╎" },
};

export interface BoxOptions {
  title?: string;
  rightTitle?: string;
  footer?: string;
  rightFooter?: string;
  width?: number;
  indent?: string;
  borderColor?: string;
  borderStyle?: BoxBorderStyle;
}

/**
 * Renders a crisp box-drawn card (inspired by tooey.design, mdxcn.dev & WebTUI)
 * with exact ANSI-aware alignment and sheared title/footer badges embedded in the borders.
 */
export function renderCard(lines: string[], opts: BoxOptions = {}): string {
  const width = opts.width ?? termWidth(84, 56);
  const indent = opts.indent ?? "  ";
  const bColor = opts.borderColor ?? PALETTE.border;
  const g = BOX_GLYPHS[opts.borderStyle ?? "round"];
  const innerWidth = Math.max(10, width - 4); // "│ " + content + " │"

  // Top border
  let topLine: string;
  if (opts.title || opts.rightTitle) {
    const leftPart = opts.title ? ` ${opts.title} ` : "";
    const rightPart = opts.rightTitle ? ` ${opts.rightTitle} ` : "";
    const fill = Math.max(
      1,
      width - 3 - visibleLength(leftPart) - visibleLength(rightPart) - (rightPart ? 1 : 0),
    );
    topLine =
      `${indent}${c(bColor, `${g.tl}${g.h}`)}${leftPart}${c(bColor, g.h.repeat(fill))}` +
      `${rightPart}${c(bColor, rightPart ? `${g.h}${g.tr}` : g.tr)}`;
  } else {
    topLine = `${indent}${c(bColor, `${g.tl}${g.h.repeat(width - 2)}${g.tr}`)}`;
  }

  const body = lines.map((line) => {
    const clipped = visibleLength(line) > innerWidth ? clipVisible(line, innerWidth) : line;
    const content = padVisible(clipped, innerWidth);
    return `${indent}${c(bColor, g.v)} ${content} ${c(bColor, g.v)}`;
  });

  // Bottom border
  let bottomLine: string;
  if (opts.footer || opts.rightFooter) {
    const leftPart = opts.footer ? ` ${opts.footer} ` : "";
    const rightPart = opts.rightFooter ? ` ${opts.rightFooter} ` : "";
    const fill = Math.max(
      1,
      width - 3 - visibleLength(leftPart) - visibleLength(rightPart) - (rightPart ? 1 : 0),
    );
    bottomLine =
      `${indent}${c(bColor, `${g.bl}${g.h}`)}${leftPart}${c(bColor, g.h.repeat(fill))}` +
      `${rightPart}${c(bColor, rightPart ? `${g.h}${g.br}` : g.br)}`;
  } else {
    bottomLine = `${indent}${c(bColor, `${g.bl}${g.h.repeat(width - 2)}${g.br}`)}`;
  }

  return [topLine, ...body, bottomLine].join("\n");
}
