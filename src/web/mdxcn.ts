/**
 * Authentic mdxcn.dev component styles and client-side render helpers
 * for YEDOGU's Browser War-Room UI.
 *
 * Implements mdxcn's signature dashed GraphFrame (`+` corners, `[ TITLE ]` edge
 * figcaptions, dotted leader tracks) across Callout, Steps, Terminal, Chat,
 * Endpoint, Env, Keys, GraphKpi, GraphStat, GraphSpec, GraphCheck, GraphScore,
 * GraphMeter, GraphRank, GraphStack, GraphSpark, GraphTree, GraphTimeline,
 * GraphUptime, and GraphTimer.
 */

export const MDXCN_CSS = /* css */ `
/* ==========================================================================
   mdxcn.dev — Text-Drawn Editorial & Data-Viz Primitives
   ========================================================================== */

@layer components {
  /* --- GraphFrame (box / corners / rule / none) --- */
  .mdxcn-frame {
    position: relative;
    margin: 0;
    background: var(--graph-surface);
    font-family: var(--mono);
  }
  .mdxcn-frame[data-frame="box"] {
    background-image:
      repeating-linear-gradient(to right, var(--graph-frame) 0 2px, transparent 2px 7px),
      repeating-linear-gradient(to bottom, var(--graph-frame) 0 2px, transparent 2px 7px),
      repeating-linear-gradient(to right, var(--graph-frame) 0 2px, transparent 2px 7px),
      repeating-linear-gradient(to bottom, var(--graph-frame) 0 2px, transparent 2px 7px);
    background-repeat: repeat-x, repeat-y, repeat-x, repeat-y;
    background-position: 0 0, 100% 0, 0 100%, 0 0;
    background-size: 100% 1px, 1px 100%, 100% 1px, 1px 100%;
  }
  .mdxcn-frame[data-frame="rule"] {
    background-image:
      repeating-linear-gradient(to right, var(--graph-frame) 0 2px, transparent 2px 7px),
      repeating-linear-gradient(to right, var(--graph-frame) 0 2px, transparent 2px 7px);
    background-repeat: repeat-x, repeat-x;
    background-position: 0 0, 0 100%;
    background-size: 100% 1px, 100% 1px;
  }
  .mdxcn-frame[data-frame="corners"] {
    border: 1px solid color-mix(in srgb, var(--graph-frame) 22%, transparent);
  }
  .mdxcn-corner {
    pointer-events: none;
    position: absolute;
    z-index: 2;
    width: 12px;
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--graph-surface);
    color: var(--graph-frame);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1;
    user-select: none;
  }
  .mdxcn-corner.tl { top: 0; left: 0; transform: translate(-50%, -50%); }
  .mdxcn-corner.tr { top: 0; right: 0; transform: translate(50%, -50%); }
  .mdxcn-corner.bl { bottom: 0; left: 0; transform: translate(-50%, 50%); }
  .mdxcn-corner.br { bottom: 0; right: 0; transform: translate(50%, 50%); }

  .mdxcn-figcaption {
    position: absolute;
    top: 0;
    left: 16px;
    transform: translateY(-50%);
    z-index: 3;
    background: var(--graph-surface);
    padding: 0 7px;
    font-family: var(--mono);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    max-width: calc(100% - 136px);
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--graph-accent);
  }
  .mdxcn-figcaption.center {
    left: 50%;
    max-width: calc(100% - 40px);
    transform: translate(-50%, -50%);
  }
  .mdxcn-figmeta {
    position: absolute;
    top: 0;
    right: 16px;
    transform: translateY(-50%);
    z-index: 3;
    background: var(--graph-surface);
    padding: 0 7px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--graph-muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .mdxcn-body {
    padding: 16px 14px 13px;
    min-width: 0;
  }
  .mdxcn-body.compact {
    padding: 13px 12px 10px;
  }
  .mdxcn-rule {
    height: 1px;
    width: 100%;
    background-image: repeating-linear-gradient(to right, var(--graph-frame) 0 2px, transparent 2px 7px);
    margin: 10px 0;
  }
  .mdxcn-rule-y {
    width: 1px;
    align-self: stretch;
    background-image: repeating-linear-gradient(to bottom, var(--graph-frame) 0 2px, transparent 2px 7px);
  }

  /* --- GraphKpi (Big Number + Label + Hint + Unicode Sparkline) --- */
  .mdxcn-kpi-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .mdxcn-kpi-val {
    font-size: 20px;
    font-weight: 700;
    color: var(--foreground0);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .mdxcn-kpi-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    margin-top: 3px;
    font-size: 10.5px;
    color: var(--graph-muted);
  }
  .mdxcn-kpi-hint {
    color: var(--graph-accent);
    font-weight: 600;
    white-space: nowrap;
  }
  .mdxcn-spark-chars {
    margin-top: 6px;
    font-size: 13px;
    line-height: 1;
    letter-spacing: 1px;
    color: var(--graph-accent);
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 16px;
  }
  .mdxcn-spark-bar {
    flex: 1;
    min-width: 4px;
    background: var(--graph-accent);
    opacity: 0.85;
    transition: opacity 0.15s ease;
  }
  .mdxcn-spark-bar.dim { background: var(--graph-faint); opacity: 0.55; }
  .mdxcn-spark-bar.hi { background: var(--graph-accent-2); opacity: 1; }

  /* --- GraphStat --- */
  .mdxcn-stat-row {
    display: flex;
    align-items: stretch;
    gap: 12px;
    flex-wrap: wrap;
  }
  .mdxcn-stat-cell {
    flex: 1;
    min-width: 72px;
  }
  .mdxcn-stat-num {
    font-size: 16px;
    font-weight: 700;
    color: var(--foreground0);
    font-variant-numeric: tabular-nums;
  }
  .mdxcn-stat-num.accent { color: var(--graph-accent); }
  .mdxcn-stat-num.danger { color: var(--rose); }
  .mdxcn-stat-num.warn { color: var(--amber); }
  .mdxcn-stat-lbl {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--graph-muted);
    margin-top: 2px;
  }

  /* --- GraphSpec (Key · · · · Value) --- */
  .mdxcn-spec-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 11.5px;
  }
  .mdxcn-spec-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .mdxcn-spec-k {
    color: var(--graph-muted);
    flex-shrink: 0;
    font-size: 11px;
  }
  .mdxcn-spec-dots {
    flex: 1;
    min-width: 14px;
    border-bottom: 1px dotted var(--graph-faint);
    transform: translateY(-3px);
  }
  .mdxcn-spec-v {
    color: var(--foreground0);
    font-weight: 600;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 65%;
  }
  .mdxcn-spec-v.accent { color: var(--graph-accent); }
  .mdxcn-spec-v.cyan { color: var(--cyan); }
  .mdxcn-spec-v.danger { color: var(--rose); }
  .mdxcn-spec-v.success { color: var(--success); }

  /* --- GraphCheck (Verification Checklist) --- */
  .mdxcn-check-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 5px 12px;
    font-size: 11px;
  }
  .mdxcn-check-item {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .mdxcn-check-glyph {
    width: 16px;
    text-align: center;
    font-weight: 700;
    flex-shrink: 0;
  }
  .mdxcn-check-item[data-state="pass"] .mdxcn-check-glyph { color: var(--success); }
  .mdxcn-check-item[data-state="fail"] .mdxcn-check-glyph { color: var(--rose); }
  .mdxcn-check-item[data-state="warn"] .mdxcn-check-glyph { color: var(--amber); }
  .mdxcn-check-item[data-state="pending"] .mdxcn-check-glyph { color: var(--graph-muted); }
  .mdxcn-check-label {
    color: var(--foreground1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mdxcn-check-item[data-state="fail"] .mdxcn-check-label { color: var(--rose); }
  .mdxcn-check-note {
    margin-left: auto;
    font-size: 10px;
    color: var(--graph-muted);
    flex-shrink: 0;
  }

  /* --- GraphScore (CVSS Dot Meter) --- */
  .mdxcn-score {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .mdxcn-score-dots {
    display: inline-flex;
    gap: 2px;
    letter-spacing: 0;
  }
  .mdxcn-score-dot {
    width: 7px;
    height: 7px;
    display: inline-block;
    background: var(--graph-faint);
  }
  .mdxcn-score-dot.on.critical { background: #ff4d6d; }
  .mdxcn-score-dot.on.high { background: #fb923c; }
  .mdxcn-score-dot.on.medium { background: var(--amber); }
  .mdxcn-score-dot.on.low { background: var(--cyan); }
  .mdxcn-score-dot.on.info { background: var(--graph-muted); }

  /* --- GraphMeter / GraphBars --- */
  .mdxcn-meter {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }
  .mdxcn-meter-track {
    flex: 1;
    height: 7px;
    background: var(--background0);
    border: 1px solid var(--graph-faint);
    position: relative;
    overflow: hidden;
    min-width: 60px;
  }
  .mdxcn-meter-fill {
    height: 100%;
    background: var(--graph-accent);
    transition: width 0.25s ease;
  }
  .mdxcn-meter-fill.danger { background: var(--rose); }
  .mdxcn-meter-fill.warn { background: var(--amber); }
  .mdxcn-meter-fill.success { background: var(--success); }

  /* --- GraphStack (Proportional Severity Bar) --- */
  .mdxcn-stack-bar {
    display: flex;
    height: 10px;
    gap: 2px;
    width: 100%;
    background: var(--background0);
    padding: 1px;
    border: 1px solid var(--graph-faint);
    margin-bottom: 8px;
  }
  .mdxcn-stack-seg { height: 100%; min-width: 4px; transition: width 0.25s ease; }
  .mdxcn-stack-seg.critical { background: #ff4d6d; }
  .mdxcn-stack-seg.high { background: #fb923c; }
  .mdxcn-stack-seg.medium { background: var(--amber); }
  .mdxcn-stack-seg.low { background: var(--cyan); }
  .mdxcn-stack-seg.info { background: var(--graph-muted); }
  .mdxcn-stack-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 10.5px;
    color: var(--foreground1);
  }
  .mdxcn-legend-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 4px;
    vertical-align: middle;
  }

  /* --- GraphRank --- */
  .mdxcn-rank-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
  }
  .mdxcn-rank-row {
    display: grid;
    grid-template-columns: 24px minmax(90px, 1fr) 90px 36px;
    align-items: center;
    gap: 8px;
  }
  .mdxcn-rank-idx { color: var(--graph-muted); font-size: 10px; }
  .mdxcn-rank-lbl { color: var(--foreground0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mdxcn-rank-cnt { color: var(--amber); text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }

  /* --- GraphTree (Branch-line hierarchy) --- */
  .mdxcn-tree {
    font-family: var(--mono);
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--foreground1);
  }
  .mdxcn-tree-root { color: var(--graph-accent); font-weight: 700; margin-bottom: 2px; }
  .mdxcn-tree-branch { color: var(--graph-frame); user-select: none; white-space: pre; }
  .mdxcn-tree-node { display: flex; align-items: baseline; gap: 4px; }
  .mdxcn-tree-key { color: var(--cyan); font-weight: 600; }
  .mdxcn-tree-leaf { color: var(--foreground0); word-break: break-all; }
  .mdxcn-tree-tag { color: var(--graph-muted); font-size: 10px; margin-left: 6px; }

  /* --- GraphTimeline (Swarm & Event Feed) --- */
  .mdxcn-timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .mdxcn-tl-item {
    display: grid;
    grid-template-columns: 18px 1fr;
    gap: 8px;
    padding-bottom: 10px;
    position: relative;
  }
  .mdxcn-tl-item:last-child { padding-bottom: 0; }
  .mdxcn-tl-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .mdxcn-tl-dot {
    font-size: 11px;
    line-height: 1.2;
    font-weight: 700;
  }
  .mdxcn-tl-line {
    flex: 1;
    width: 1px;
    margin-top: 2px;
    background-image: repeating-linear-gradient(to bottom, var(--graph-frame) 0 2px, transparent 2px 5px);
  }
  .mdxcn-tl-item:last-child .mdxcn-tl-line { display: none; }
  .mdxcn-tl-item[data-state="running"] .mdxcn-tl-dot { color: var(--amber); }
  .mdxcn-tl-item[data-state="completed"] .mdxcn-tl-dot { color: var(--success); }
  .mdxcn-tl-item[data-state="failed"] .mdxcn-tl-dot { color: var(--rose); }
  .mdxcn-tl-item[data-state="queued"] .mdxcn-tl-dot { color: var(--graph-muted); }

  /* --- GraphUptime (Status Cell Strip) --- */
  .mdxcn-uptime-strip {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-wrap: wrap;
  }
  .mdxcn-uptime-cell {
    width: 10px;
    height: 16px;
    background: var(--graph-faint);
    transition: transform 0.12s ease;
    cursor: default;
  }
  .mdxcn-uptime-cell:hover { transform: scaleY(1.2); }
  .mdxcn-uptime-cell.ok { background: var(--success); }
  .mdxcn-uptime-cell.degraded { background: var(--amber); }
  .mdxcn-uptime-cell.down { background: var(--rose); }
  .mdxcn-uptime-cell.empty { background: var(--background2); opacity: 0.45; }

  /* --- Callout (note / tip / warning / danger) --- */
  .mdxcn-callout {
    display: grid;
    grid-template-columns: 18px 1fr;
    gap: 8px;
    padding: 9px 12px;
    background: var(--background0);
    border: 1px dashed var(--graph-frame);
    border-left: 2px solid var(--cyan);
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--foreground1);
    line-height: 1.5;
  }
  .mdxcn-callout[data-type="tip"] { border-left-color: var(--success); }
  .mdxcn-callout[data-type="warning"] { border-left-color: var(--amber); }
  .mdxcn-callout[data-type="danger"] { border-left-color: var(--rose); }
  .mdxcn-callout-glyph {
    font-weight: 700;
    color: var(--cyan);
    text-align: center;
  }
  .mdxcn-callout[data-type="tip"] .mdxcn-callout-glyph { color: var(--success); }
  .mdxcn-callout[data-type="warning"] .mdxcn-callout-glyph { color: var(--amber); }
  .mdxcn-callout[data-type="danger"] .mdxcn-callout-glyph { color: var(--rose); }
  .mdxcn-callout-title {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10px;
    margin-bottom: 2px;
    color: var(--foreground0);
  }

  /* --- Endpoint Pill --- */
  .mdxcn-endpoint {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    background: var(--background0);
    border: 1px dashed var(--graph-frame);
    font-family: var(--mono);
    font-size: 11px;
    max-width: 100%;
    overflow: hidden;
  }
  .mdxcn-method {
    font-weight: 700;
    font-size: 10px;
    padding: 1px 5px;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }
  .mdxcn-method.GET { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); }
  .mdxcn-method.POST { background: color-mix(in srgb, var(--amber) 18%, transparent); color: var(--amber); }
  .mdxcn-method.PUT, .mdxcn-method.PATCH { background: color-mix(in srgb, var(--cyan) 18%, transparent); color: var(--cyan); }
  .mdxcn-method.DELETE { background: color-mix(in srgb, var(--rose) 20%, transparent); color: var(--rose); }
  .mdxcn-method.OPTIONS, .mdxcn-method.HEAD { background: color-mix(in srgb, var(--purple) 18%, transparent); color: var(--purple); }
  .mdxcn-endpoint-url {
    color: var(--foreground0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* --- Keys (Keyboard Shortcut Table) --- */
  .mdxcn-keys {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 11px;
  }
  .mdxcn-key-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mdxcn-kbd {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    background: var(--background0);
    border: 1px solid var(--graph-frame);
    color: var(--graph-accent);
    font-family: var(--mono);
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  /* --- mdxcn Tabs / Steps / Terminal (Channels & Tool Output) --- */
  .mdxcn-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 14px;
  }
  .mdxcn-tab-title {
    font-size: 12px;
    font-weight: 700;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3px;
  }
  .mdxcn-tab-sub {
    font-size: 10.5px;
    color: var(--graph-muted);
  }

  .mdxcn-steps {
    position: relative;
    border-left: 1px dashed var(--graph-frame);
    margin: 6px 0 12px 10px;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .mdxcn-step {
    position: relative;
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--foreground1);
    line-height: 1.5;
  }
  .mdxcn-step::before {
    content: attr(data-step);
    position: absolute;
    left: -28px;
    top: 0;
    width: 19px;
    height: 19px;
    background: var(--graph-surface);
    border: 1px solid var(--graph-accent);
    color: var(--graph-accent);
    font-size: 10px;
    font-weight: 700;
    display: grid;
    place-items: center;
  }
  .mdxcn-step[data-state="done"]::before {
    border-color: var(--success);
    color: var(--success);
  }
  .mdxcn-step[data-state="next"] {
    color: var(--graph-muted);
  }
  .mdxcn-step[data-state="next"]::before {
    border-color: var(--graph-frame);
    color: var(--graph-muted);
  }
  .mdxcn-step code {
    background: var(--background0);
    border: 1px solid var(--graph-faint);
    padding: 0 5px;
    color: var(--cyan);
    font-size: 11px;
  }

  .mdxcn-terminal {
    background: var(--background0);
    border: 1px dashed var(--graph-frame);
    overflow: hidden;
    font-family: var(--mono);
    font-size: 11.5px;
    margin-top: 8px;
  }
  .mdxcn-terminal-head {
    background: var(--background1);
    border-bottom: 1px dashed var(--graph-frame);
    padding: 4px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    color: var(--graph-muted);
    font-size: 10.5px;
  }
  .mdxcn-terminal-body {
    padding: 9px 12px;
    color: var(--foreground0);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 280px;
    overflow: auto;
    line-height: 1.48;
  }
  .mdxcn-term-cmd { color: var(--foreground0); font-weight: 600; }
  .mdxcn-term-prompt { color: var(--graph-accent); user-select: none; margin-right: 6px; }
  .mdxcn-term-comment { color: var(--graph-muted); font-style: italic; }
  .mdxcn-term-ok { color: var(--success); }
  .mdxcn-term-err { color: var(--rose); }

  /* --- Rich Markdown Output (Chat & Report Preview) --- */
  .md-prose {
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--foreground0);
    overflow-wrap: break-word;
    word-break: normal;
  }
  .md-prose > *:first-child { margin-top: 0; }
  .md-prose > *:last-child { margin-bottom: 0; }
  .md-prose p { margin: 0 0 8px; }
  .md-prose h1, .md-prose h2, .md-prose h3, .md-prose h4 {
    font-family: var(--mono);
    font-weight: 700;
    margin: 12px 0 6px;
    color: var(--graph-accent);
    letter-spacing: 0.02em;
  }
  .md-prose h1 { font-size: 15px; border-bottom: 1px dashed var(--graph-frame); padding-bottom: 4px; }
  .md-prose h2 { font-size: 13.5px; }
  .md-prose h3 { font-size: 12.5px; color: var(--cyan); }
  .md-prose ul, .md-prose ol { margin: 4px 0 8px 18px; }
  .md-prose li { margin: 2px 0; }
  .md-prose code.md-inline {
    background: var(--background0);
    border: 1px solid var(--graph-faint);
    padding: 0 5px;
    color: var(--cyan);
    font-size: 11.5px;
  }
  .md-prose pre.md-code {
    background: var(--background0);
    border: 1px dashed var(--graph-frame);
    padding: 0;
    margin: 8px 0;
    overflow: hidden;
  }
  .md-code-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 9px;
    background: var(--background1);
    border-bottom: 1px dashed var(--graph-frame);
    font-size: 10px;
    color: var(--graph-muted);
    text-transform: uppercase;
  }
  .md-code-body {
    display: block;
    padding: 9px 11px;
    overflow-x: auto;
    font-size: 11.5px;
    line-height: 1.48;
    color: var(--foreground0);
    white-space: pre;
  }
  .md-prose blockquote {
    border-left: 2px solid var(--graph-accent);
    padding: 4px 10px;
    margin: 6px 0;
    color: var(--foreground1);
    background: color-mix(in srgb, var(--graph-accent) 5%, transparent);
  }
  .md-prose table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 11.5px;
    border: 1px dashed var(--graph-frame);
  }
  .md-prose th, .md-prose td {
    padding: 5px 8px;
    border-bottom: 1px dashed var(--graph-faint);
    text-align: left;
  }
  .md-prose th {
    color: var(--graph-accent);
    font-size: 10.5px;
    text-transform: uppercase;
    background: var(--background0);
  }
  .md-task-done { color: var(--success); font-weight: 700; margin-right: 4px; }
  .md-task-todo { color: var(--graph-muted); margin-right: 4px; }
}

/* Unlayered overrides to cleanly beat @webtui/css default button styling */
button.mdxcn-tab, .mdxcn-tab {
  background: var(--background0);
  border: 1px dashed var(--graph-frame);
  padding: 9px 11px;
  cursor: pointer;
  text-align: left;
  color: var(--foreground1);
  font-family: var(--mono);
  transition: border-color 0.12s ease, background 0.12s ease;
  display: block;
  width: 100%;
  height: auto;
  line-height: 1.35;
}
button.mdxcn-tab:hover, .mdxcn-tab:hover {
  border-style: solid;
  border-color: var(--foreground2);
  color: var(--foreground0);
  background: var(--background1);
  text-decoration: none;
}
button.mdxcn-tab.active, .mdxcn-tab.active {
  border-style: solid;
  border-color: var(--graph-accent);
  background: color-mix(in srgb, var(--graph-accent) 12%, var(--background0));
  color: var(--foreground0);
}
`;

export const MDXCN_CLIENT_JS = /* js */ `
/* ==========================================================================
   mdxcn.dev Client-Side Component Builders & Safe Markdown Renderer
   ========================================================================== */

function mdxcnFrame(opts, bodyHtml) {
  const frame = opts.frame || "box";
  const corner = opts.corner || "+";
  const corners = (frame === "box" || frame === "corners")
    ? '<span class="mdxcn-corner tl" aria-hidden="true">' + esc(corner) + '</span>' +
      '<span class="mdxcn-corner tr" aria-hidden="true">' + esc(corner) + '</span>' +
      '<span class="mdxcn-corner bl" aria-hidden="true">' + esc(corner) + '</span>' +
      '<span class="mdxcn-corner br" aria-hidden="true">' + esc(corner) + '</span>'
    : "";
  const titleHtml = opts.title
    ? '<figcaption class="mdxcn-figcaption' + (opts.centerTitle ? " center" : "") + '">[ ' + esc(opts.title) + ' ]</figcaption>'
    : "";
  const metaHtml = opts.metaHtml
    ? '<div class="mdxcn-figmeta">' + opts.metaHtml + '</div>'
    : "";
  const cls = "mdxcn-frame" + (opts.className ? " " + opts.className : "");
  const bodyCls = "mdxcn-body" + (opts.compact ? " compact" : "");
  return '<figure class="' + cls + '" data-frame="' + esc(frame) + '"' + (opts.style ? ' style="' + opts.style + '"' : '') + '>' +
    corners + titleHtml + metaHtml +
    '<div class="' + bodyCls + '">' + bodyHtml + '</div></figure>';
}

function mdxcnKpi(opts) {
  const series = Array.isArray(opts.data) && opts.data.length ? opts.data : [1, 2, 1, 3, 2, 4, 3, 5];
  const maxV = Math.max(1, ...series);
  const bars = series.map((v, idx) => {
    const pct = Math.max(14, Math.round((v / maxV) * 100));
    const cls = v === 0 ? "mdxcn-spark-bar dim" : (idx === series.length - 1 ? "mdxcn-spark-bar hi" : "mdxcn-spark-bar");
    return '<span class="' + cls + '" style="height:' + pct + '%" title="' + esc(String(v)) + '"></span>';
  }).join("");
  return mdxcnFrame({ title: opts.title, frame: opts.frame || "box", compact: true },
    '<div class="mdxcn-kpi-val">' + esc(opts.value) + '</div>' +
    '<div class="mdxcn-kpi-meta"><span>' + esc(opts.label || "") + '</span><span class="mdxcn-kpi-hint">' + esc(opts.hint || "") + '</span></div>' +
    '<div class="mdxcn-spark-chars" aria-hidden="true">' + bars + '</div>'
  );
}

function mdxcnSpec(rows) {
  return '<div class="mdxcn-spec-list">' + rows.map(r =>
    '<div class="mdxcn-spec-row">' +
      '<span class="mdxcn-spec-k">' + esc(r.label) + '</span>' +
      '<span class="mdxcn-spec-dots"></span>' +
      '<span class="mdxcn-spec-v ' + esc(r.tone || "") + '" title="' + esc(r.value) + '">' + esc(r.value) + '</span>' +
    '</div>'
  ).join("") + '</div>';
}

function mdxcnCheck(items) {
  const glyphs = { pass: "✓", fail: "×", warn: "!", pending: "○" };
  return '<div class="mdxcn-check-grid">' + items.map(it =>
    '<div class="mdxcn-check-item" data-state="' + esc(it.state || "pending") + '" title="' + esc(it.note || it.label) + '">' +
      '<span class="mdxcn-check-glyph">' + (glyphs[it.state] || "○") + '</span>' +
      '<span class="mdxcn-check-label">' + esc(it.label) + '</span>' +
      (it.note ? '<span class="mdxcn-check-note">' + esc(it.note) + '</span>' : '') +
    '</div>'
  ).join("") + '</div>';
}

function mdxcnScore(score, maxVal, severity) {
  const max = maxVal || 10;
  const filled = Math.max(0, Math.min(max, Math.round(Number(score) || 0)));
  const sev = severity || (score >= 9 ? "critical" : score >= 7 ? "high" : score >= 4 ? "medium" : score > 0 ? "low" : "info");
  let dots = "";
  for (let i = 0; i < max; i++) {
    dots += '<span class="mdxcn-score-dot' + (i < filled ? (" on " + sev) : "") + '"></span>';
  }
  return '<span class="mdxcn-score"><span class="mdxcn-score-dots">' + dots + '</span><strong>' +
    (score !== undefined && score !== null ? Number(score).toFixed(1) : "—") + '</strong><span style="color:var(--graph-muted);">/' + max + '</span></span>';
}

function mdxcnStack(segments) {
  const total = segments.reduce((a, s) => a + s.count, 0);
  const bar = total > 0
    ? segments.filter(s => s.count > 0).map(s =>
        '<div class="mdxcn-stack-seg ' + esc(s.cls) + '" style="width:' + Math.max(4, (s.count / total) * 100) + '%" title="' + esc(s.label + ": " + s.count) + '"></div>'
      ).join("")
    : '<div style="width:100%; height:100%; background:var(--background1); opacity:0.5;"></div>';
  const legend = segments.map(s =>
    '<span><span class="mdxcn-legend-dot" style="background:' + esc(s.color) + '"></span>' + esc(s.label) + ' <strong>' + s.count + '</strong></span>'
  ).join("");
  return '<div class="mdxcn-stack-bar">' + bar + '</div><div class="mdxcn-stack-legend">' + legend + '</div>';
}

function mdxcnRank(items) {
  if (!items || items.length === 0) return '<div style="color:var(--graph-muted); font-size:11px;">No ranked items.</div>';
  const maxV = Math.max(1, ...items.map(i => i.value));
  return '<div class="mdxcn-rank-list">' + items.map((it, i) => {
    const pct = Math.max(6, Math.round((it.value / maxV) * 100));
    return '<div class="mdxcn-rank-row">' +
      '<span class="mdxcn-rank-idx">#' + String(i + 1).padStart(2, "0") + '</span>' +
      '<span class="mdxcn-rank-lbl" title="' + esc(it.label) + '">' + esc(it.label) + '</span>' +
      '<div class="mdxcn-meter-track"><div class="mdxcn-meter-fill ' + esc(it.tone || "warn") + '" style="width:' + pct + '%"></div></div>' +
      '<span class="mdxcn-rank-cnt">x' + it.value + '</span>' +
    '</div>';
  }).join("") + '</div>';
}

function mdxcnTree(rootLabel, groups) {
  let html = '<div class="mdxcn-tree"><div class="mdxcn-tree-root">' + esc(rootLabel) + '</div>';
  groups.forEach((g, gi) => {
    const isLastG = gi === groups.length - 1;
    html += '<div class="mdxcn-tree-node"><span class="mdxcn-tree-branch">' + (isLastG ? "└─ " : "├─ ") + '</span><span class="mdxcn-tree-key">' + esc(g.label) + '</span>' +
      (g.tag ? '<span class="mdxcn-tree-tag">' + esc(g.tag) + '</span>' : '') + '</div>';
    const items = g.children || [];
    items.forEach((leaf, li) => {
      const isLastL = li === items.length - 1;
      const prefix = (isLastG ? "   " : "│  ") + (isLastL ? "└─ " : "├─ ");
      html += '<div class="mdxcn-tree-node"><span class="mdxcn-tree-branch">' + prefix + '</span><span class="mdxcn-tree-leaf">' + (leaf.html || esc(leaf.label || leaf)) + '</span></div>';
    });
  });
  return html + '</div>';
}

function mdxcnCallout(type, title, bodyHtml) {
  const glyphs = { note: "i", tip: "+", warning: "!", danger: "×" };
  return '<div class="mdxcn-callout" data-type="' + esc(type || "note") + '">' +
    '<div class="mdxcn-callout-glyph">' + (glyphs[type] || "i") + '</div>' +
    '<div>' + (title ? '<div class="mdxcn-callout-title">' + esc(title) + '</div>' : '') + '<div>' + bodyHtml + '</div></div></div>';
}

function mdxcnEndpoint(method, url, extraHtml) {
  const m = String(method || "GET").toUpperCase();
  return '<span class="mdxcn-endpoint"><span class="mdxcn-method ' + esc(m) + '">' + esc(m) + '</span><span class="mdxcn-endpoint-url" title="' + esc(url) + '">' + esc(url) + '</span>' + (extraHtml || "") + '</span>';
}

function mdxcnUptime(cells) {
  return '<div class="mdxcn-uptime-strip">' + cells.map(c =>
    '<span class="mdxcn-uptime-cell ' + esc(c.state || "empty") + '" title="' + esc(c.title || "") + '"></span>'
  ).join("") + '</div>';
}

function mdxcnSpark(values, unit) {
  if (!values || values.length === 0) return '<span style="color:var(--graph-muted); font-size:11px;">No samples yet</span>';
  const glyphs = ["▁","▂","▃","▄","▅","▆","▇","█"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const span = Math.max(1, max - min);
  const chars = values.slice(-24).map(v => {
    const idx = Math.min(7, Math.floor(((v - min) / span) * 7.99));
    return '<span title="' + v + (unit || "") + '">' + glyphs[idx] + '</span>';
  }).join("");
  return '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:11px;">' +
    '<span style="color:var(--graph-accent); letter-spacing:1px; font-size:13px;">' + chars + '</span>' +
    '<span style="color:var(--graph-muted); font-size:10px;">min ' + min + (unit || "") + ' · avg ' + avg + (unit || "") + ' · max ' + max + (unit || "") + '</span></div>';
}

/* Safe, lightweight Markdown -> HTML renderer (headings, tables, callouts, fenced code + copy, lists, inline code) */
function renderInlineMd(raw) {
  let s = esc(raw);
  s = s.replace(/\`([^\`]+)\`/g, '<code class="md-inline">$1</code>');
  s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\\*([^*]+)\\*/g, '$1<em>$2</em>');
  return s;
}

function renderRichMarkdown(text) {
  const src = String(text || "");
  if (!src.trim()) return "";
  const lines = src.replace(/\\r\\n?/g, "\\n").split("\\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^\\s*\`\`\`([a-zA-Z0-9_-]*)/);
    if (fence) {
      const lang = fence[1] || "text";
      const codeLines = [];
      i++;
      while (i < lines.length && !/^\\s*\`\`\`/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const rawCode = codeLines.join("\\n");
      const cid = "cb_" + Math.random().toString(36).slice(2, 9);
      window.__CODE_BLOCKS = window.__CODE_BLOCKS || {};
      window.__CODE_BLOCKS[cid] = rawCode;
      html += '<pre class="md-code"><div class="md-code-head"><span>' + esc(lang) + '</span><button class="btn-ghost-xs" onclick="copyCodeBlock(\\'' + cid + '\\')">Copy</button></div><code class="md-code-body">' + esc(rawCode) + '</code></pre>';
      continue;
    }

    // Callout / Blockquote (> [!TYPE])
    const calloutStart = line.match(/^>\\s*\\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\\]\\s*(.*)$/i);
    if (calloutStart) {
      const kindMap = { note: "note", tip: "tip", warning: "warning", caution: "danger", important: "warning" };
      const cType = kindMap[calloutStart[1].toLowerCase()] || "note";
      const cTitle = calloutStart[2] || calloutStart[1].toUpperCase();
      const bodyLines = [];
      i++;
      while (i < lines.length && /^>/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^>\\s?/, ""));
        i++;
      }
      html += mdxcnCallout(cType, cTitle, bodyLines.map(renderInlineMd).join("<br/>"));
      continue;
    }

    // Markdown Table
    if (line.includes("|") && i + 1 < lines.length && /^\\s*\\|?[\\s:-]+\\|[\\s|:-]+$/.test(lines[i + 1])) {
      const parseCells = (row) => row.trim().replace(/^\\|/, "").replace(/\\|$/, "").split("|").map(c => c.trim());
      const headers = parseCells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(parseCells(lines[i]));
        i++;
      }
      html += '<table><thead><tr>' + headers.map(h => '<th>' + renderInlineMd(h) + '</th>').join("") + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => '<td>' + renderInlineMd(c) + '</td>').join("") + '</tr>').join("") + '</tbody></table>';
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,4})\\s+(.+)$/);
    if (hMatch) {
      const lvl = hMatch[1].length;
      html += '<h' + lvl + '>' + renderInlineMd(hMatch[2]) + '</h' + lvl + '>';
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\\s*(---|\\*\\*\\*|___)\\s*$/.test(line)) {
      html += '<div class="mdxcn-rule"></div>';
      i++;
      continue;
    }

    // Unordered / Task list
    if (/^\\s*[-*+]\\s+/.test(line)) {
      html += '<ul>';
      while (i < lines.length && /^\\s*[-*+]\\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\\s*[-*+]\\s+/, "");
        const taskDone = item.match(/^\\[x\\]\\s+(.*)$/i);
        const taskTodo = item.match(/^\\[ \\]\\s+(.*)$/);
        if (taskDone) html += '<li style="list-style:none;"><span class="md-task-done">✓</span>' + renderInlineMd(taskDone[1]) + '</li>';
        else if (taskTodo) html += '<li style="list-style:none;"><span class="md-task-todo">○</span>' + renderInlineMd(taskTodo[1]) + '</li>';
        else html += '<li>' + renderInlineMd(item) + '</li>';
        i++;
      }
      html += '</ul>';
      continue;
    }

    // Ordered list
    if (/^\\s*\\d+\\.\\s+/.test(line)) {
      html += '<ol>';
      while (i < lines.length && /^\\s*\\d+\\.\\s+/.test(lines[i])) {
        html += '<li>' + renderInlineMd(lines[i].replace(/^\\s*\\d+\\.\\s+/, "")) + '</li>';
        i++;
      }
      html += '</ol>';
      continue;
    }

    // Plain blockquote
    if (/^>\\s?/.test(line)) {
      const qLines = [];
      while (i < lines.length && /^>\\s?/.test(lines[i])) {
        qLines.push(lines[i].replace(/^>\\s?/, ""));
        i++;
      }
      html += '<blockquote>' + qLines.map(renderInlineMd).join("<br/>") + '</blockquote>';
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    const pLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\\s*\`\`\`/.test(lines[i]) &&
      !/^(#{1,4})\\s+/.test(lines[i]) &&
      !/^\\s*[-*+]\\s+/.test(lines[i]) &&
      !/^\\s*\\d+\\.\\s+/.test(lines[i]) &&
      !/^>/.test(lines[i])
    ) {
      pLines.push(lines[i]);
      i++;
    }
    html += '<p>' + pLines.map(renderInlineMd).join("<br/>") + '</p>';
  }

  return '<div class="md-prose">' + html + '</div>';
}

function copyCodeBlock(cid) {
  const txt = (window.__CODE_BLOCKS || {})[cid] || "";
  copyTextSnippet(txt, "code snippet");
}
`;
