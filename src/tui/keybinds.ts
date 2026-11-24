import type readline from "node:readline";
import { PALETTE, c } from "./theme.js";

export type KeybindActionId =
  | "command_list"
  | "app_exit"
  | "sidebar_toggle"
  | "model_list"
  | "model_cycle_recent"
  | "agent_list"
  | "agent_cycle"
  | "theme_list"
  | "session_new"
  | "session_list"
  | "session_timeline"
  | "session_compact"
  | "session_export"
  | "session_rename"
  | "session_fork"
  | "status_view"
  | "editor_open"
  | "messages_undo"
  | "messages_redo"
  | "messages_copy"
  | "prompt_stash"
  | "diff_open"
  | "todos_view"
  | "browser_open"
  | "settings_open"
  | "help_show";

export interface KeybindSpec {
  id: KeybindActionId;
  chord: string;
  description: string;
  leaderKey?: string;
}

export const LEADER_KEY = "ctrl+x";

export const KEYBIND_SPECS: readonly KeybindSpec[] = [
  { id: "command_list", chord: "ctrl+p / ctrl+k", description: "Open Command Palette" },
  { id: "sidebar_toggle", chord: "<leader>b", leaderKey: "b", description: "Toggle right sidebar panel" },
  { id: "model_list", chord: "<leader>m", leaderKey: "m", description: "List & switch models" },
  { id: "model_cycle_recent", chord: "f2", description: "Cycle recently used model" },
  { id: "agent_list", chord: "<leader>a / ctrl+g", leaderKey: "a", description: "List & switch specialist agents" },
  { id: "agent_cycle", chord: "shift+tab", description: "Cycle to next specialist agent" },
  { id: "theme_list", chord: "<leader>t / ctrl+t", leaderKey: "t", description: "List & switch 37 themes" },
  { id: "session_new", chord: "<leader>n", leaderKey: "n", description: "Create a new session" },
  { id: "session_list", chord: "<leader>l / ctrl+o", leaderKey: "l", description: "List & switch sessions" },
  { id: "session_timeline", chord: "<leader>g", leaderKey: "g", description: "Open session timeline (jump/revert/fork)" },
  { id: "session_compact", chord: "<leader>c", leaderKey: "c", description: "Compact session context" },
  { id: "session_export", chord: "<leader>x", leaderKey: "x", description: "Export session transcript to Markdown" },
  { id: "session_rename", chord: "ctrl+r", description: "Rename current session" },
  { id: "session_fork", chord: "<leader>f", leaderKey: "f", description: "Fork current session" },
  { id: "status_view", chord: "<leader>s", leaderKey: "s", description: "View session telemetry & status" },
  { id: "editor_open", chord: "<leader>e", leaderKey: "e", description: "Compose prompt in external $EDITOR" },
  { id: "messages_undo", chord: "<leader>u", leaderKey: "u", description: "Undo last message turn" },
  { id: "messages_redo", chord: "<leader>r", leaderKey: "r", description: "Redo last undone turn" },
  { id: "messages_copy", chord: "<leader>y", leaderKey: "y", description: "Copy last assistant response" },
  { id: "prompt_stash", chord: "<leader>z", leaderKey: "z", description: "Stash or pop draft prompt" },
  { id: "diff_open", chord: "<leader>d", leaderKey: "d", description: "View modified files & split/unified diff" },
  { id: "todos_view", chord: "<leader>v", leaderKey: "v", description: "View session # Todos checklist" },
  { id: "browser_open", chord: "ctrl+b", description: "Open Browser War-Room UI" },
  { id: "settings_open", chord: "<leader>,", leaderKey: ",", description: "Open TUI Settings" },
  { id: "help_show", chord: "<leader>h / ?", leaderKey: "h", description: "Show keybinds & commands" },
  { id: "app_exit", chord: "<leader>q / ctrl+c×2", leaderKey: "q", description: "Exit YEDOGU" },
];

const LEADER_MAP = new Map<string, KeybindActionId>();
for (const spec of KEYBIND_SPECS) {
  if (spec.leaderKey) {
    LEADER_MAP.set(spec.leaderKey.toLowerCase(), spec.id);
  }
}

/**
 * OpenCode-style `<leader>` (`Ctrl+X`) chord state machine with automatic timeout.
 */
export class LeaderKeyController {
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly timeoutMs = 1500,
    private readonly onTimeout?: () => void,
  ) {}

  public get isArmed(): boolean {
    return this.active;
  }

  public arm(): void {
    this.disarm();
    this.active = true;
    this.timer = setTimeout(() => {
      this.active = false;
      this.timer = null;
      this.onTimeout?.();
    }, this.timeoutMs);
  }

  public disarm(): void {
    this.active = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public resolveChord(str: string, key: readline.Key = {}): KeybindActionId | "cancel" | null {
    if (!this.active) return null;
    this.disarm();
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      return "cancel";
    }
    const ch = (key.name || str || "").toLowerCase();
    return LEADER_MAP.get(ch) ?? null;
  }

  public renderHintBar(): string {
    return (
      `  ${PALETTE.pillBg}${c(PALETTE.accent + PALETTE.bold, " LEADER ^X ")}${PALETTE.reset} ` +
      c(
        PALETTE.muted,
        "b:sidebar · m:model · a:agent · t:theme · n:new · l:sessions · g:timeline · d:diff · u:undo · y:copy · x:export · q:quit",
      )
    );
  }
}
