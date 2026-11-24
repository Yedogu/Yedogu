import { PALETTE, c } from "./theme.js";

const FRAMES = ["✻", "✶", "✳", "✢", "·", "✢", "✳", "✶"];

/**
 * Calm, Claude Code-style animated terminal status spinner.
 * Displays an organic pulsing glyph, label, and live elapsed timer,
 * and erases itself cleanly when output begins.
 */
export class TerminalSpinner {
  private timer: NodeJS.Timeout | null = null;
  private frameIdx = 0;
  private startedAt = 0;
  private label = "";
  private detail = "";
  private active = false;

  public start(label: string, detail = ""): void {
    this.stop(true);
    this.label = label;
    this.detail = detail;
    this.startedAt = Date.now();
    this.frameIdx = 0;
    this.active = true;

    if (!process.stdout.isTTY) {
      process.stdout.write(`  ${c(PALETTE.accent, "✻")} ${c(PALETTE.secondary, label)}\n`);
      return;
    }

    this.render();
    this.timer = setInterval(() => {
      this.frameIdx = (this.frameIdx + 1) % FRAMES.length;
      this.render();
    }, 110);
  }

  public update(label: string, detail?: string): void {
    this.label = label;
    if (detail !== undefined) this.detail = detail;
    if (this.active && process.stdout.isTTY) {
      this.render();
    }
  }

  public stop(clearLine = true): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.active && clearLine && process.stdout.isTTY) {
      process.stdout.write("\r\x1b[2K");
    }
    this.active = false;
  }

  public isActive(): boolean {
    return this.active;
  }

  private render(): void {
    const glyph = FRAMES[this.frameIdx];
    const elapsedSec = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    const detailText = this.detail ? ` ${c(PALETTE.muted, `· ${this.detail}`)}` : "";
    const line =
      `  ${c(PALETTE.accent, glyph)} ${c(PALETTE.text, this.label)}${detailText} ` +
      `${c(PALETTE.muted, `(${elapsedSec}s · ctrl+c to interrupt)`)}`;
    process.stdout.write(`\r\x1b[2K${line}`);
  }
}
