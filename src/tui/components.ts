import type {
  AgentDefinition,
  ChannelPublicView,
  ModifiedFileRecord,
  ProviderConfig,
  SessionData,
  TodoItem,
} from "../types.js";
import { isProviderConnected } from "../providers/registry.js";
import {
  PALETTE,
  c,
  clipVisible,
  formatTokens,
  getActiveTheme,
  padVisible,
  renderMiniGauge,
  rule,
  shortenPath,
  termWidth,
  truncatePlain,
  visibleLength,
} from "./theme.js";

/**
 * Calm, clutter-free terminal UI primitives inspired by `mdxcn.dev` & `webtui.ironclad.sh`.
 * Every component is ANSI-width-safe, adapts cleanly to narrow terminals, and avoids heavy box-soup.
 */

export interface GraphFrameOptions {
  title?: string;
  rightMeta?: string;
  footer?: string;
  /** "box" draws `+` corners with dashed edges; "rule" draws top & bottom dashed rules only. */
  frame?: "box" | "rule";
  width?: number;
  indent?: string;
}

/**
 * mdxcn GraphFrame for Terminal:
 *   + ╌ [ TITLE ] ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ meta ╌ +
 *   ╎  content                             ╎
 *   + ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ +
 */
export function renderGraphFrame(lines: string[], opts: GraphFrameOptions = {}): string {
  const width = opts.width ?? termWidth(80, 56);
  const indent = opts.indent ?? "  ";
  const mode = opts.frame ?? "box";
  const bc = PALETTE.border;
  const corner = c(PALETTE.borderFocus, "+");

  const buildEdge = (leftLabel?: string, rightLabel?: string): string => {
    const innerSpan = Math.max(8, width - 2);
    const lText = leftLabel ? ` ${leftLabel} ` : "";
    const rText = rightLabel ? ` ${rightLabel} ` : "";
    const lLen = visibleLength(lText);
    const rLen = visibleLength(rText);

    if (mode === "rule") {
      const lead = leftLabel ? c(bc, "╌╌") : "";
      const trail = rightLabel ? c(bc, "╌╌") : "";
      const fill = Math.max(2, width - lLen - rLen - (leftLabel ? 2 : 0) - (rightLabel ? 2 : 0));
      return `${indent}${lead}${lText}${c(bc, "╌".repeat(fill))}${rText}${trail}`;
    }

    const lead = leftLabel ? c(bc, "╌") : "";
    const trail = rightLabel ? c(bc, "╌") : "";
    const fill = Math.max(
      1,
      innerSpan - lLen - rLen - (leftLabel ? 1 : 0) - (rightLabel ? 1 : 0),
    );
    return `${indent}${corner}${lead}${lText}${c(bc, "╌".repeat(fill))}${rText}${trail}${corner}`;
  };

  const titleBadge = opts.title ? `${c(PALETTE.accent + PALETTE.bold, `[ ${opts.title} ]`)}` : undefined;
  const top = buildEdge(titleBadge, opts.rightMeta);
  const bottom = buildEdge(opts.footer, undefined);

  if (mode === "rule") {
    const body = lines.map((line) => `${indent} ${clipVisible(line, Math.max(10, width - 2))}`);
    return [top, ...body, bottom].join("\n");
  }

  const innerMax = Math.max(12, width - 6);
  const body = lines.map((line) => {
    const clipped = visibleLength(line) > innerMax ? clipVisible(line, innerMax) : line;
    const padded = padVisible(clipped, innerMax);
    return `${indent}${c(bc, "╎")}  ${padded}  ${c(bc, "╎")}`;
  });

  return [top, ...body, bottom].join("\n");
}

export interface SpecRow {
  label: string;
  value: string;
  /** Optional raw/unstyled color override for value when value isn't pre-colored. */
  color?: string;
}

/**
 * mdxcn GraphSpec — crisp dotted-leader key-value rows:
 *   Agent ························ @commander
 */
export function renderSpecRows(rows: SpecRow[], width = termWidth(74, 52), indent = ""): string[] {
  return rows.map((r) => {
    const keyStr = c(PALETTE.muted, r.label);
    const valStr = r.color ? c(r.color, r.value) : r.value;
    const kLen = visibleLength(keyStr);
    const vLen = visibleLength(valStr);
    const availForVal = Math.max(10, width - kLen - 4);
    const safeVal = vLen > availForVal ? clipVisible(valStr, availForVal) : valStr;
    const dotCount = Math.max(2, width - kLen - visibleLength(safeVal) - 2);
    return `${indent}${keyStr} ${c(PALETTE.border, "·".repeat(dotCount))} ${safeVal}`;
  });
}

export interface StatCell {
  label: string;
  value: string;
  color?: string;
}

/**
 * mdxcn GraphStat — calm single-row KPI strip with vertical `╎` dividers.
 *   14 files  ╎  82.4 KB  ╎  0 secrets  ╎  19 endpoints
 */
export function renderStatRow(stats: StatCell[], indent = "  "): string {
  const sep = `  ${c(PALETTE.border, "╎")}  `;
  const parts = stats.map((s) =>
    s.label
      ? `${c((s.color || PALETTE.text) + PALETTE.bold, s.value)} ${c(PALETTE.muted, s.label)}`
      : c((s.color || PALETTE.text) + PALETTE.bold, s.value),
  );
  return `${indent}${parts.join(sep)}`;
}

export interface CheckItem {
  label: string;
  state: "pass" | "fail" | "warn" | "pending";
  note?: string;
}

/**
 * mdxcn GraphCheck — compact multi-column verification grid:
 *   ✓ ASLR           ✓ DEP/NX          × CFG
 */
export function renderCheckGrid(items: CheckItem[], width = termWidth(76, 54), indent = "  "): string[] {
  if (items.length === 0) return [];
  const cols = width >= 72 ? 3 : 2;
  const colW = Math.floor(width / cols);
  const glyphMap = {
    pass: c(PALETTE.success + PALETTE.bold, "✓"),
    fail: c(PALETTE.danger + PALETTE.bold, "×"),
    warn: c(PALETTE.warning + PALETTE.bold, "!"),
    pending: c(PALETTE.muted, "○"),
  };
  const labelColorMap = {
    pass: PALETTE.text,
    fail: PALETTE.danger,
    warn: PALETTE.warning,
    pending: PALETTE.muted,
  };

  const out: string[] = [];
  for (let i = 0; i < items.length; i += cols) {
    const slice = items.slice(i, i + cols);
    const cells = slice.map((it, idx) => {
      const note = it.note ? ` ${c(PALETTE.muted, it.note)}` : "";
      const maxLabel = Math.max(8, colW - 4 - (it.note ? it.note.length + 1 : 0));
      const cell = `${glyphMap[it.state]} ${c(labelColorMap[it.state], truncatePlain(it.label, maxLabel))}${note}`;
      return idx === slice.length - 1 ? cell : padVisible(cell, colW);
    });
    out.push(`${indent}${cells.join("")}`);
  }
  return out;
}

/**
 * mdxcn GraphMeter — compact horizontal progress/entropy bar:
 *   ▰▰▰▰▰▱▱▱ 6.28
 */
export function renderMeter(
  value: number,
  max: number,
  barWidth = 10,
  dangerThreshold?: number,
  warnThreshold?: number,
): string {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const filled = Math.round(ratio * barWidth);
  const empty = Math.max(0, barWidth - filled);
  const fillCol =
    dangerThreshold !== undefined && value >= dangerThreshold
      ? PALETTE.danger
      : warnThreshold !== undefined && value >= warnThreshold
        ? PALETTE.warning
        : PALETTE.accent;
  return `${c(fillCol, "▰".repeat(filled))}${c(PALETTE.border, "▱".repeat(empty))}`;
}

/**
 * mdxcn GraphScore — 10-dot CVSS 3.1 meter:
 *   ●●●●●●●●○○ 8.1
 */
export function renderScoreDots(score: number, max = 10, severity?: string): string {
  const filled = Math.max(0, Math.min(max, Math.round(score)));
  const empty = max - filled;
  const sevCol =
    severity === "critical" || score >= 9
      ? PALETTE.danger
      : severity === "high" || score >= 7
        ? PALETTE.warning
        : severity === "medium" || score >= 4
          ? PALETTE.accentSoft
          : PALETTE.info;
  return `${c(sevCol, "●".repeat(filled))}${c(PALETTE.border, "○".repeat(empty))} ${c(sevCol + PALETTE.bold, score.toFixed(1))}`;
}

/**
 * mdxcn GraphStack — single-line proportional severity breakdown bar.
 */
export function renderSeverityStack(
  counts: { critical: number; high: number; medium: number; low: number; info: number },
  barWidth = 28,
  indent = "  ",
): string {
  const total = counts.critical + counts.high + counts.medium + counts.low + counts.info;
  const segs: Array<{ key: string; count: number; color: string; glyph: string }> = [
    { key: "C", count: counts.critical, color: PALETTE.danger, glyph: "█" },
    { key: "H", count: counts.high, color: PALETTE.warning, glyph: "█" },
    { key: "M", count: counts.medium, color: PALETTE.accentSoft, glyph: "▓" },
    { key: "L", count: counts.low, color: PALETTE.info, glyph: "▒" },
    { key: "I", count: counts.info, color: PALETTE.muted, glyph: "░" },
  ];

  let bar = "";
  if (total === 0) {
    bar = c(PALETTE.border, "░".repeat(barWidth));
  } else {
    let used = 0;
    const active = segs.filter((s) => s.count > 0);
    active.forEach((s, idx) => {
      const cells =
        idx === active.length - 1
          ? Math.max(1, barWidth - used)
          : Math.max(1, Math.round((s.count / total) * barWidth));
      used += cells;
      bar += c(s.color, s.glyph.repeat(cells));
    });
  }

  const legend = segs
    .filter((s) => s.count > 0 || s.key === "C" || s.key === "H")
    .map((s) => `${c(s.color + PALETTE.bold, String(s.count))}${c(PALETTE.muted, s.key)}`)
    .join(" ");

  return `${indent}${bar}  ${legend}`;
}

/**
 * mdxcn GraphUptime — compact 1-line status pip strip:
 *   ▪▪▪▫▫▫▫▫▫▫▫  3/11 live
 */
export function renderUptimeStrip(states: Array<"ok" | "degraded" | "down" | "empty">): string {
  const pips = states
    .map((st) => {
      if (st === "ok") return c(PALETTE.success, "▪");
      if (st === "degraded") return c(PALETTE.warning, "▪");
      if (st === "down") return c(PALETTE.danger, "▪");
      return c(PALETTE.border, "▫");
    })
    .join("");
  const live = states.filter((s) => s === "ok").length;
  return `${pips} ${c(PALETTE.muted, `${live}/${states.length} live`)}`;
}

export interface TreeGroup {
  label: string;
  tag?: string;
  color?: string;
  children: string[];
}

/**
 * mdxcn GraphTree — crisp branch-line hierarchy:
 *   scope://roe
 *   ├─ allow/ (2)
 *   │  ├─ *.target.com
 *   │  └─ 10.10.0.0/16
 *   └─ deny/ (1)
 *      └─ admin.target.com
 */
export function renderTree(root: string, groups: TreeGroup[], indent = "  "): string[] {
  const out: string[] = [`${indent}${c(PALETTE.accent + PALETTE.bold, root)}`];
  groups.forEach((g, gi) => {
    const isLastG = gi === groups.length - 1;
    const branch = c(PALETTE.border, isLastG ? "└─ " : "├─ ");
    const tag = g.tag ? ` ${c(PALETTE.muted, g.tag)}` : "";
    out.push(`${indent}${branch}${c((g.color || PALETTE.info) + PALETTE.bold, g.label)}${tag}`);

    g.children.forEach((leaf, li) => {
      const isLastL = li === g.children.length - 1;
      const prefix = c(PALETTE.border, (isLastG ? "   " : "│  ") + (isLastL ? "└─ " : "├─ "));
      out.push(`${indent}${prefix}${leaf}`);
    });
  });
  return out;
}

export interface RankItem {
  label: string;
  count: number;
}

/**
 * mdxcn GraphRank — ranked horizontal bar rows:
 *   #1  innerHTML (app.js)      ▰▰▰▰▰▰▰▱▱▱  x14
 */
export function renderRankList(items: RankItem[], width = termWidth(76, 56), indent = "  "): string[] {
  if (items.length === 0) return [];
  const maxVal = Math.max(1, ...items.map((i) => i.count));
  const barW = 10;
  const labelW = Math.max(18, width - barW - 14);

  return items.map((it, idx) => {
    const rank = padVisible(c(PALETTE.muted, `#${idx + 1}`), 4);
    const lbl = padVisible(c(PALETTE.text, truncatePlain(it.label, labelW - 1)), labelW);
    const bar = renderMeter(it.count, maxVal, barW, maxVal + 1, Math.ceil(maxVal * 0.6));
    const cnt = padVisible(c(PALETTE.warning + PALETTE.bold, `x${it.count}`), 5, "right");
    return `${indent}${rank}${lbl} ${bar} ${cnt}`;
  });
}

/**
 * mdxcn Callout — quiet left-rail notice with zero heavy box borders.
 */
export function renderCallout(
  type: "note" | "tip" | "warning" | "danger",
  title: string,
  bodyLines: string[],
  indent = "  ",
): string[] {
  const styles = {
    note: { glyph: "i", color: PALETTE.info },
    tip: { glyph: "+", color: PALETTE.success },
    warning: { glyph: "!", color: PALETTE.warning },
    danger: { glyph: "×", color: PALETTE.danger },
  };
  const s = styles[type];
  const out = [`${indent}${c(s.color, "┃")} ${c(s.color + PALETTE.bold, `${s.glyph} ${title}`)}`];
  for (const line of bodyLines) {
    out.push(`${indent}${c(s.color, "┃")} ${c(PALETTE.secondary, line)}`);
  }
  return out;
}

/**
 * mdxcn Endpoint — color-coded HTTP method + URL + optional status pill.
 */
export function renderEndpointLine(
  method: string,
  url: string,
  statusText?: string,
  statusColor?: string,
  indent = "  ",
): string {
  const m = method.toUpperCase();
  const mCol =
    m === "GET"
      ? PALETTE.success
      : m === "POST"
        ? PALETTE.warning
        : m === "DELETE"
          ? PALETTE.danger
          : PALETTE.info;
  const methodTag = `${PALETTE.pillBg}${mCol}${PALETTE.bold} ${m} ${PALETTE.reset}`;
  const statusPart = statusText ? ` ${c(PALETTE.muted, "→")} ${c((statusColor || PALETTE.text) + PALETTE.bold, statusText)}` : "";
  return `${indent}${methodTag} ${c(PALETTE.text, url)}${statusPart}`;
}

/**
 * Clean section header with right-aligned optional telemetry + dashed hairline.
 */
export function renderSectionHeader(title: string, rightMeta?: string, width = termWidth(80, 58), indent = "  "): string[] {
  const left = c(PALETTE.text + PALETTE.bold, title);
  if (!rightMeta) {
    return [`${indent}${left}`, `${indent}${rule(width, undefined, true)}`];
  }
  const gap = Math.max(2, width - visibleLength(left) - visibleLength(rightMeta));
  return [
    `${indent}${left}${" ".repeat(gap)}${rightMeta}`,
    `${indent}${rule(width, undefined, true)}`,
  ];
}

/**
 * OpenCode-style Diff Viewer (`Wd`): renders unified or split diff with
 * line-number gutters and colored added/removed backgrounds.
 * Automatically uses split mode when `width > 120` unless overridden.
 */
export function renderDiffView(
  patch: string,
  opts: { filePath?: string; view?: "auto" | "unified" | "split"; width?: number; indent?: string } = {},
): string[] {
  const width = opts.width ?? termWidth(116, 56);
  const indent = opts.indent ?? "  ";
  const mode = opts.view === "split" || (opts.view !== "unified" && width > 120) ? "split" : "unified";
  const rawLines = patch.split(/\r?\n/);

  const headerPath = opts.filePath || rawLines.find((l) => l.startsWith("+++ b/"))?.slice(6) || "file";
  const out: string[] = [
    `${indent}${c(PALETTE.accent + PALETTE.bold, "← Edit")} ${c(PALETTE.text + PALETTE.bold, headerPath)} ${c(PALETTE.muted, `[${mode}]`)}`,
  ];

  const bodyLines = rawLines.filter((l) => !l.startsWith("--- ") && !l.startsWith("+++ "));
  let oldLn = 1;
  let newLn = 1;

  if (mode === "split") {
    const colW = Math.max(24, Math.floor((width - 5) / 2));
    const innerCol = colW - 6;
    const removedQueue: Array<{ ln: number; text: string }> = [];
    const addedQueue: Array<{ ln: number; text: string }> = [];

    const flushQueues = () => {
      const n = Math.max(removedQueue.length, addedQueue.length);
      for (let i = 0; i < n; i++) {
        const rem = removedQueue[i];
        const add = addedQueue[i];
        const leftCell = rem
          ? `${PALETTE.diffRemovedBg}${c(PALETTE.muted, String(rem.ln).padStart(4, " "))} ${c(PALETTE.diffRemoved, "-")} ${padVisible(c(PALETTE.text, truncatePlain(rem.text, innerCol)), innerCol)}${PALETTE.reset}`
          : padVisible("", colW);
        const rightCell = add
          ? `${PALETTE.diffAddedBg}${c(PALETTE.muted, String(add.ln).padStart(4, " "))} ${c(PALETTE.diffAdded, "+")} ${padVisible(c(PALETTE.text, truncatePlain(add.text, innerCol)), innerCol)}${PALETTE.reset}`
          : padVisible("", colW);
        out.push(`${indent}${leftCell} ${c(PALETTE.border, "│")} ${rightCell}`);
      }
      removedQueue.length = 0;
      addedQueue.length = 0;
    };

    for (const line of bodyLines.slice(0, 48)) {
      const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        flushQueues();
        oldLn = Number(hunk[1]);
        newLn = Number(hunk[2]);
        out.push(`${indent}${c(PALETTE.diffHunkHeader, truncatePlain(line, width))}`);
        continue;
      }
      if (line.startsWith("-")) {
        removedQueue.push({ ln: oldLn++, text: line.slice(1) });
      } else if (line.startsWith("+")) {
        addedQueue.push({ ln: newLn++, text: line.slice(1) });
      } else {
        flushQueues();
        const txt = line.startsWith(" ") ? line.slice(1) : line;
        const cell = `${c(PALETTE.muted, String(oldLn).padStart(4, " "))}   ${padVisible(c(PALETTE.secondary, truncatePlain(txt, innerCol)), innerCol)}`;
        const right = `${c(PALETTE.muted, String(newLn).padStart(4, " "))}   ${padVisible(c(PALETTE.secondary, truncatePlain(txt, innerCol)), innerCol)}`;
        out.push(`${indent}${cell} ${c(PALETTE.border, "│")} ${right}`);
        oldLn++;
        newLn++;
      }
    }
    flushQueues();
  } else {
    const innerW = Math.max(20, width - 9);
    for (const line of bodyLines.slice(0, 48)) {
      const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        oldLn = Number(hunk[1]);
        newLn = Number(hunk[2]);
        out.push(`${indent}${c(PALETTE.diffHunkHeader, truncatePlain(line, width))}`);
        continue;
      }
      if (line.startsWith("-")) {
        const ln = String(oldLn++).padStart(4, " ");
        out.push(
          `${indent}${PALETTE.diffRemovedBg}${c(PALETTE.muted, ln)} ${c(PALETTE.diffRemoved, "-")} ${padVisible(c(PALETTE.text, truncatePlain(line.slice(1), innerW)), innerW)}${PALETTE.reset}`,
        );
      } else if (line.startsWith("+")) {
        const ln = String(newLn++).padStart(4, " ");
        out.push(
          `${indent}${PALETTE.diffAddedBg}${c(PALETTE.muted, ln)} ${c(PALETTE.diffAdded, "+")} ${padVisible(c(PALETTE.text, truncatePlain(line.slice(1), innerW)), innerW)}${PALETTE.reset}`,
        );
      } else {
        const txt = line.startsWith(" ") ? line.slice(1) : line;
        const ln = String(newLn).padStart(4, " ");
        oldLn++;
        newLn++;
        out.push(`${indent}${c(PALETTE.muted, ln)}   ${c(PALETTE.secondary, truncatePlain(txt, innerW))}`);
      }
    }
  }

  if (bodyLines.length > 48) {
    out.push(`${indent}${c(PALETTE.muted, `… ${bodyLines.length - 48} more diff lines`)}`);
  }
  return out;
}

/**
 * OpenCode `# Todos` card (`Vd`).
 */
export function renderTodoListCard(todos: TodoItem[], width = termWidth(76, 48), indent = "  "): string[] {
  if (!todos || todos.length === 0) {
    return [`${indent}${c(PALETTE.muted, "# Todos (empty)")}`];
  }
  const done = todos.filter((t) => t.status === "completed").length;
  const lines = todos.map((t) => {
    if (t.status === "completed") {
      return `${c(PALETTE.success, "✓")} ${c(PALETTE.muted, truncatePlain(t.content, width - 10))}`;
    }
    if (t.status === "in_progress") {
      return `${c(PALETTE.accent + PALETTE.bold, "◐")} ${c(PALETTE.text + PALETTE.bold, truncatePlain(t.content, width - 10))}`;
    }
    return `${c(PALETTE.muted, "○")} ${c(PALETTE.secondary, truncatePlain(t.content, width - 10))}`;
  });
  return renderGraphFrame(lines, {
    title: "# Todos",
    rightMeta: c(PALETTE.muted, `${done}/${todos.length} done`),
    frame: "rule",
    width,
    indent,
  }).split("\n");
}

/**
 * OpenCode 42-column right Sidebar (`J$ = 42`).
 */
export function renderSidebarPanel(
  session: SessionData,
  agent: AgentDefinition,
  providers: ProviderConfig[],
  daemonUrl: string,
  channels: ChannelPublicView[] = [],
  sidebarWidth = 42,
): string[] {
  const inner = Math.max(24, sidebarWidth - 2);
  const totalTok = session.totalInputTokens + session.totalOutputTokens;
  const connected = providers.filter(isProviderConnected);
  const theme = getActiveTheme();

  const lines: string[] = [
    c(PALETTE.text + PALETTE.bold, truncatePlain(session.name || "New session", inner)),
    `${c(PALETTE.muted, session.id)} ${c(PALETTE.border, "·")} ${c(PALETTE.accent, `@${agent.id}`)}`,
    rule(inner, undefined, true),
    c(PALETTE.secondary + PALETTE.bold, "Context"),
    `  ${renderMiniGauge(totalTok || 1, 200_000, 6)} ${c(PALETTE.muted, `${formatTokens(totalTok)} tok`)}`,
    `  ${c(PALETTE.muted, "Model:")} ${c(PALETTE.text, truncatePlain(session.agentModels[agent.id] || session.activeModel, inner - 9))}`,
    `  ${c(PALETTE.muted, "Theme:")} ${c(PALETTE.text, theme.id)}`,
  ];

  // Todos section
  const todos = session.todos ?? [];
  if (todos.length > 0) {
    const done = todos.filter((t) => t.status === "completed").length;
    lines.push("");
    lines.push(`${c(PALETTE.secondary + PALETTE.bold, "Todos")} ${c(PALETTE.muted, `(${done}/${todos.length})`)}`);
    for (const t of todos.slice(0, 5)) {
      const icon =
        t.status === "completed"
          ? c(PALETTE.success, "✓")
          : t.status === "in_progress"
            ? c(PALETTE.accent, "◐")
            : c(PALETTE.muted, "○");
      lines.push(`  ${icon} ${c(t.status === "completed" ? PALETTE.muted : PALETTE.text, truncatePlain(t.content, inner - 4))}`);
    }
  }

  // Modified files section
  const modFiles: ModifiedFileRecord[] = session.modifiedFiles ?? [];
  if (modFiles.length > 0) {
    lines.push("");
    lines.push(`${c(PALETTE.secondary + PALETTE.bold, "Modified Files")} ${c(PALETTE.muted, `(${modFiles.length})`)}`);
    for (const mf of modFiles.slice(0, 5)) {
      const stats = `${c(PALETTE.diffAdded, `+${mf.added}`)} ${c(PALETTE.diffRemoved, `-${mf.removed}`)}`;
      const nameMax = Math.max(10, inner - visibleLength(stats) - 4);
      lines.push(`  ${padVisible(c(PALETTE.text, truncatePlain(mf.path, nameMax)), nameMax)} ${stats}`);
    }
  }

  // Findings section
  lines.push("");
  lines.push(`${c(PALETTE.secondary + PALETTE.bold, "Findings")} ${c(PALETTE.muted, `(${session.findings.length})`)}`);
  if (session.findings.length > 0) {
    const counts = {
      critical: session.findings.filter((f) => f.severity === "critical").length,
      high: session.findings.filter((f) => f.severity === "high").length,
      medium: session.findings.filter((f) => f.severity === "medium").length,
      low: session.findings.filter((f) => f.severity === "low").length,
      info: session.findings.filter((f) => f.severity === "info").length,
    };
    lines.push(renderSeverityStack(counts, Math.min(18, inner - 14), "  "));
  } else {
    lines.push(`  ${c(PALETTE.muted, "No findings yet")}`);
  }

  // Providers & Channels
  lines.push("");
  lines.push(`${c(PALETTE.secondary + PALETTE.bold, "Connections")}`);
  lines.push(
    `  ${c(connected.length ? PALETTE.success : PALETTE.warning, "●")} ${c(PALETTE.text, `${connected.length}`)} ${c(PALETTE.muted, "providers")} ${c(PALETTE.border, "·")} ${c(PALETTE.info, truncatePlain(daemonUrl.replace(/^https?:\/\//, ""), 16))}`,
  );
  if (channels.length > 0) {
    const live = channels.filter((ch) => ch.status.state === "connected").length;
    lines.push(`  ${c(live ? PALETTE.success : PALETTE.muted, "●")} ${c(PALETTE.text, `${live}/${channels.length}`)} ${c(PALETTE.muted, "channels live")}`);
  }

  // Footer
  lines.push(rule(inner, undefined, true));
  lines.push(c(PALETTE.muted, shortenPath(session.workspace, inner)));

  return lines.map((l) => padVisible(clipVisible(l, inner), inner));
}

/**
 * Joins a main canvas column and a 42-col OpenCode sidebar side-by-side when terminal width > 120.
 */
export function renderSplitScreen(
  mainLines: string[],
  sidebarLines: string[],
  totalWidth = process.stdout.columns || 128,
  sidebarWidth = 42,
): string {
  const mainWidth = Math.max(40, totalWidth - sidebarWidth - 3);
  const rows = Math.max(mainLines.length, sidebarLines.length);
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    const left = padVisible(clipVisible(mainLines[i] ?? "", mainWidth), mainWidth);
    const right = sidebarLines[i] ?? " ".repeat(sidebarWidth - 2);
    out.push(`${left} ${c(PALETTE.border, "│")} ${right}`);
  }
  return out.join("\n");
}
