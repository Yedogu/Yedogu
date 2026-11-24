import { PALETTE, c, rule, termWidth } from "./theme.js";

/**
 * Zero-dependency streaming terminal Markdown formatter inspired by `mdxcn.dev`.
 * Buffers partial tokens until newline boundaries so headings, tables, callouts,
 * task lists, inline code, bold/italic text, blockquotes, and framed code blocks
 * render crisply in real time.
 */
export class StreamMarkdownWriter {
  private buffer = "";
  private inCodeBlock = false;
  private codeLang = "";
  private calloutAccent: string | null = null;
  private readonly indent: string;
  private readonly writeFn: (chunk: string) => void;

  constructor(
    writeFn: (chunk: string) => void = (chunk) => process.stdout.write(chunk),
    indent = "  ",
  ) {
    this.writeFn = writeFn;
    this.indent = indent;
  }

  public push(delta: string): void {
    this.buffer += delta;
    let nlIdx = this.buffer.indexOf("\n");
    while (nlIdx !== -1) {
      const line = this.buffer.slice(0, nlIdx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nlIdx + 1);
      this.writeFn(this.formatLine(line) + "\n");
      nlIdx = this.buffer.indexOf("\n");
    }
  }

  public flush(): void {
    if (this.buffer.length > 0) {
      const remaining = this.buffer.replace(/\r$/, "");
      this.buffer = "";
      this.writeFn(this.formatLine(remaining) + "\n");
    }
    if (this.inCodeBlock) {
      this.inCodeBlock = false;
      this.codeLang = "";
      this.writeFn(`${this.indent}${c(PALETTE.border, "╰" + "─".repeat(Math.min(58, termWidth() - 6)))}\n`);
    }
    this.calloutAccent = null;
  }

  public reset(): void {
    this.buffer = "";
    this.inCodeBlock = false;
    this.codeLang = "";
    this.calloutAccent = null;
  }

  private formatLine(line: string): string {
    const trimmed = line.trim();

    // Fenced code block toggle (mdxcn framed terminal/code box)
    if (trimmed.startsWith("```")) {
      this.calloutAccent = null;
      if (!this.inCodeBlock) {
        this.inCodeBlock = true;
        this.codeLang = trimmed.slice(3).trim();
        const header = this.codeLang ? ` ${this.codeLang} ` : "";
        const fill = Math.max(8, Math.min(58, termWidth() - 6) - header.length);
        return `${this.indent}${c(PALETTE.border, "╭─")}${c(PALETTE.accentSoft, header)}${c(PALETTE.border, "─".repeat(fill))}`;
      } else {
        this.inCodeBlock = false;
        this.codeLang = "";
        return `${this.indent}${c(PALETTE.border, "╰" + "─".repeat(Math.min(60, termWidth() - 6)))}`;
      }
    }

    // Inside code block: subtle gutter + crisp code text
    if (this.inCodeBlock) {
      return `${this.indent}${c(PALETTE.border, "│")} ${c(PALETTE.info, line)}`;
    }

    // Empty line ends active callout
    if (!trimmed) {
      this.calloutAccent = null;
      return "";
    }

    // Horizontal rule (mdxcn dashed line)
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      this.calloutAccent = null;
      return `${this.indent}${rule(Math.min(66, termWidth() - 4), undefined, true)}`;
    }

    // Markdown table separator row: | --- | --- |
    if (/^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(trimmed)) {
      const cells = trimmed
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => "─".repeat(Math.max(4, Math.min(18, cell.trim().length + 2))));
      return `${this.indent}${c(PALETTE.border, `├─${cells.join("─┼─")}─┤`)}`;
    }

    // Markdown table data/header row: | a | b |
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|")) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => this.formatInline(cell.trim()));
      const sep = c(PALETTE.border, " │ ");
      return `${this.indent}${c(PALETTE.border, "│")} ${cells.join(sep)} ${c(PALETTE.border, "│")}`;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      this.calloutAccent = null;
      const level = headingMatch[1].length;
      const text = this.formatInline(headingMatch[2]);
      if (level === 1) {
        return `${this.indent}${c(PALETTE.accent + PALETTE.bold, `▸ ${text}`)}`;
      }
      if (level === 2) {
        return `${this.indent}${c(PALETTE.text + PALETTE.bold, text)}`;
      }
      return `${this.indent}${c(PALETTE.accentSoft + PALETTE.bold, text)}`;
    }

    // Blockquote / mdxcn Callout (> [!NOTE], > [!WARNING], > [!TIP], > [!IMPORTANT], > [!CAUTION])
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      const body = quoteMatch[1];
      const calloutMatch = body.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (calloutMatch) {
        const kind = calloutMatch[1].toUpperCase();
        const extra = calloutMatch[2] ? ` ${this.formatInline(calloutMatch[2])}` : "";
        const meta: Record<string, { icon: string; color: string }> = {
          NOTE: { icon: "ℹ", color: PALETTE.info },
          TIP: { icon: "✦", color: PALETTE.success },
          IMPORTANT: { icon: "◈", color: PALETTE.reasoning },
          WARNING: { icon: "▲", color: PALETTE.warning },
          CAUTION: { icon: "⚑", color: PALETTE.danger },
        };
        const m = meta[kind] ?? meta.NOTE;
        this.calloutAccent = m.color;
        return `${this.indent}${c(m.color, "┃")} ${c(m.color + PALETTE.bold, `${m.icon} ${kind}`)}${extra}`;
      }
      const barCol = this.calloutAccent ?? PALETTE.border;
      const barChar = this.calloutAccent ? "┃" : "│";
      return `${this.indent}${c(barCol, barChar)} ${c(PALETTE.secondary + (this.calloutAccent ? "" : PALETTE.italic), this.formatInline(body))}`;
    }
    this.calloutAccent = null;

    // Task list items (- [x] / - [ ])
    const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      const subIndent = taskMatch[1];
      const done = taskMatch[2].toLowerCase() === "x";
      const icon = done ? c(PALETTE.success, "✓") : c(PALETTE.muted, "○");
      const text = done ? c(PALETTE.muted, this.formatInline(taskMatch[3])) : this.formatInline(taskMatch[3]);
      return `${this.indent}${subIndent}${icon} ${text}`;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      const subIndent = ulMatch[1];
      return `${this.indent}${subIndent}${c(PALETTE.accent, "•")} ${this.formatInline(ulMatch[2])}`;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (olMatch) {
      const subIndent = olMatch[1];
      return `${this.indent}${subIndent}${c(PALETTE.accent, `${olMatch[2]}.`)} ${this.formatInline(olMatch[3])}`;
    }

    // Standard prose line
    return `${this.indent}${this.formatInline(line)}`;
  }

  private formatInline(text: string): string {
    // 1. Protect inline code spans first so bold/italic don't mangle code
    const codeTokens: string[] = [];
    let out = text.replace(/`([^`]+)`/g, (_m, code: string) => {
      const idx = codeTokens.length;
      codeTokens.push(c(PALETTE.info, code));
      return `\x00CODE${idx}\x00`;
    });

    // 2. Markdown links [label](url)
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
      return `${c(PALETTE.info + PALETTE.underline, label)} ${c(PALETTE.muted, `(${url})`)}`;
    });

    // 3. Bold **text**
    out = out.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => {
      return c(PALETTE.text + PALETTE.bold, inner);
    });

    // 4. Italic *text*
    out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_m, inner: string) => {
      return c(PALETTE.secondary + PALETTE.italic, inner);
    });

    // 5. Restore inline code spans
    out = out.replace(/\x00CODE(\d+)\x00/g, (_m, idxStr: string) => {
      return codeTokens[Number(idxStr)] ?? "";
    });

    return out;
  }
}
