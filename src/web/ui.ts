import { MARKDOWN_CLIENT_JS } from "./markdown.js";

export function renderWarRoomHtml(initialSessionId: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="obsidian">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Yedogu — Security Research Harness</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  /* ========================================================================
     Design Tokens — T3 Code Minimal Monochrome & Hairline System
     ======================================================================== */
  :root, [data-theme="obsidian"] {
    --bg: #09090b;
    --bg-sidebar: #0c0c0e;
    --bg-surface: #101013;
    --bg-elevated: #151518;
    --bg-hover: rgba(255, 255, 255, 0.045);
    --bg-active: rgba(255, 255, 255, 0.085);
    --bg-code: #0b0b0d;

    --border: rgba(255, 255, 255, 0.07);
    --border-strong: rgba(255, 255, 255, 0.12);
    --border-focus: rgba(255, 255, 255, 0.24);

    --text: #f4f4f5;
    --text-secondary: #a1a1aa;
    --text-muted: #6e6e7a;

    --primary: #f4f4f5;
    --primary-fg: #09090b;
    --primary-hover: #e4e4e7;

    --accent: #e4e4e7;
    --accent-soft: rgba(255, 255, 255, 0.06);

    --success: #34d399;
    --success-soft: rgba(52, 211, 153, 0.11);
    --warn: #fbbf24;
    --warn-soft: rgba(251, 191, 36, 0.11);
    --danger: #f87171;
    --danger-soft: rgba(248, 113, 113, 0.11);
    --info: #60a5fa;
    --info-soft: rgba(96, 165, 250, 0.11);

    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35);
    --shadow-md: 0 10px 30px rgba(0, 0, 0, 0.48);
    --shadow-lg: 0 24px 64px rgba(0, 0, 0, 0.72);

    --sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --sidebar-w: 256px;
  }

  [data-theme="light"] {
    --bg: #ffffff;
    --bg-sidebar: #fafafa;
    --bg-surface: #ffffff;
    --bg-elevated: #f6f6f7;
    --bg-hover: rgba(0, 0, 0, 0.04);
    --bg-active: rgba(0, 0, 0, 0.07);
    --bg-code: #f5f5f7;

    --border: rgba(0, 0, 0, 0.075);
    --border-strong: rgba(0, 0, 0, 0.13);
    --border-focus: rgba(0, 0, 0, 0.28);

    --text: #09090b;
    --text-secondary: #52525b;
    --text-muted: #8b8b96;

    --primary: #18181b;
    --primary-fg: #ffffff;
    --primary-hover: #27272a;

    --accent: #18181b;
    --accent-soft: rgba(0, 0, 0, 0.05);

    --success: #059669;
    --success-soft: rgba(5, 150, 105, 0.1);
    --warn: #d97706;
    --warn-soft: rgba(217, 119, 6, 0.1);
    --danger: #dc2626;
    --danger-soft: rgba(220, 38, 38, 0.1);
    --info: #2563eb;
    --info-soft: rgba(37, 99, 235, 0.1);

    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.08);
    --shadow-lg: 0 24px 64px rgba(0, 0, 0, 0.15);
  }

  [data-theme="slate"] {
    --bg: #0b0d12;
    --bg-sidebar: #0e1017;
    --bg-surface: #121620;
    --bg-elevated: #171b26;
    --bg-hover: rgba(226, 232, 240, 0.05);
    --bg-active: rgba(226, 232, 240, 0.09);
    --bg-code: #0d1017;

    --border: rgba(226, 232, 240, 0.075);
    --border-strong: rgba(226, 232, 240, 0.13);
    --border-focus: rgba(129, 140, 248, 0.42);

    --text: #eef2f8;
    --text-secondary: #9aa4b8;
    --text-muted: #64708a;

    --primary: #eef2f8;
    --primary-fg: #0b0d12;
    --primary-hover: #d7dfec;

    --accent: #818cf8;
    --accent-soft: rgba(129, 140, 248, 0.12);
  }

  [data-theme="stone"] {
    --bg: #11100f;
    --bg-sidebar: #141311;
    --bg-surface: #181715;
    --bg-elevated: #1e1c1a;
    --bg-hover: rgba(245, 240, 230, 0.045);
    --bg-active: rgba(245, 240, 230, 0.085);
    --bg-code: #131210;

    --border: rgba(245, 240, 230, 0.075);
    --border-strong: rgba(245, 240, 230, 0.13);
    --border-focus: rgba(217, 119, 87, 0.45);

    --text: #f3f1ec;
    --text-secondary: #a8a299;
    --text-muted: #706b63;

    --primary: #f3f1ec;
    --primary-fg: #11100f;
    --primary-hover: #dfdacf;

    --accent: #d97757;
    --accent-soft: rgba(217, 119, 87, 0.13);
  }

  /* ========================================================================
     Reset & Base Typography
     ======================================================================== */
  *, *::before, *::after { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 13.5px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  }

  button, input, select, textarea {
    font-family: inherit;
    color: inherit;
  }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

  /* ========================================================================
     App Shell — 4-Zone Sidebar + Workspace
     ======================================================================== */
  .app-shell {
    display: grid;
    grid-template-columns: var(--sidebar-w) 1fr;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--bg);
    transition: grid-template-columns 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .app-shell.sidebar-collapsed {
    grid-template-columns: 0px 1fr;
  }
  .sidebar-backdrop { display: none; }

  /* Sidebar */
  .sidebar {
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    user-select: none;
  }
  .app-shell.sidebar-collapsed .sidebar { border-right: none; }

  .sidebar-header {
    height: 44px;
    padding: 0 8px 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .brand-icon {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    background: var(--primary);
    color: var(--primary-fg);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .sidebar-head-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  /* Zone 2: Scrollable Projects & Chats */
  .sidebar-projects-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .projects-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px 2px;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    letter-spacing: 0.01em;
  }

  .project-group {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .project-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    height: 28px;
    padding: 0 4px 0 6px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    min-width: 0;
    transition: background 0.12s, color 0.12s;
  }
  .project-row:hover, .project-row.menu-open {
    background: var(--bg-hover);
    color: var(--text);
  }
  .project-row.active-project {
    color: var(--text);
  }
  .project-row-left {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    flex: 1;
  }
  .proj-chev {
    width: 12px;
    height: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
    transition: transform 0.14s ease;
  }
  .project-group.collapsed .proj-chev {
    transform: rotate(-90deg);
  }
  .proj-folder-ico {
    width: 13px;
    height: 13px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .project-name {
    font-size: 12.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-actions {
    display: none;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
  }
  .project-row:hover .project-actions,
  .project-row.menu-open .project-actions {
    display: inline-flex;
  }

  .mini-icon-btn {
    width: 21px;
    height: 21px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;
  }
  .mini-icon-btn:hover { background: var(--bg-active); color: var(--text); }
  .mini-icon-btn svg { width: 12.5px; height: 12.5px; }

  .thread-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-left: 10px;
    min-width: 0;
  }
  .project-group.collapsed .thread-list {
    display: none;
  }

  .thread-item {
    width: 100%;
    height: 29px;
    padding: 0 6px 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12.5px;
    font-weight: 400;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    cursor: pointer;
    text-align: left;
    min-width: 0;
    transition: background 0.12s, color 0.12s;
  }
  .thread-item:hover, .thread-item.menu-open { background: var(--bg-hover); color: var(--text); }
  .thread-item.active { background: var(--bg-active); color: var(--text); font-weight: 500; }
  .thread-left {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }
  .thread-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    opacity: 0.42;
    flex-shrink: 0;
  }
  .thread-item.active .thread-dot {
    background: var(--success);
    opacity: 1;
  }
  .thread-item.busy .thread-dot {
    background: var(--info);
    opacity: 1;
    animation: pulse 1.2s ease-in-out infinite;
  }
  .thread-pin-ico {
    width: 10px;
    height: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .thread-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .thread-time {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .thread-actions {
    display: none;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
  }
  .thread-item:hover .thread-time,
  .thread-item.menu-open .thread-time {
    display: none;
  }
  .thread-item:hover .thread-actions,
  .thread-item.menu-open .thread-actions {
    display: inline-flex;
  }

  /* Zone 3: Pinned Bottom-Left Tools */
  .sidebar-tools {
    padding: 8px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .nav-section-label {
    font-size: 10.5px;
    font-weight: 500;
    color: var(--text-muted);
    padding: 0 8px 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    letter-spacing: 0.01em;
  }
  .nav-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .nav-item {
    width: 100%;
    height: 29px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12.5px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
    text-align: left;
  }
  .nav-item:hover { background: var(--bg-hover); color: var(--text); }
  .nav-item.active { background: var(--bg-active); color: var(--text); }
  .nav-item-left {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nav-item svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: 0.68;
  }
  .nav-item.active svg { opacity: 1; }
  .nav-count {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .nav-item.active .nav-count { color: var(--text-secondary); }

  /* Zone 4: Bottom-Left Settings Footer */
  .sidebar-footer {
    height: 40px;
    padding: 0 8px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-shrink: 0;
  }
  .settings-trigger-btn {
    flex: 1;
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12.5px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s, color 0.12s;
  }
  .settings-trigger-btn:hover { background: var(--bg-hover); color: var(--text); }
  .settings-trigger-btn svg { width: 14px; height: 14px; opacity: 0.72; flex-shrink: 0; }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
  }
  .status-dot.err { background: var(--danger); }
  .status-dot.warn { background: var(--warn); }

  /* Main Area */
  .main-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }

  /* Whisper-Quiet Topbar (44px) */
  .topbar {
    height: 44px;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
    background: var(--bg);
  }
  .topbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .view-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 340px;
  }
  .topbar-crumb-sep {
    color: var(--text-muted);
    font-size: 12px;
    opacity: 0.6;
  }
  .topbar-ws {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  /* ========================================================================
     Shared UI Primitives
     ======================================================================== */
  .btn {
    height: 30px;
    padding: 0 11px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--bg-elevated);
    color: var(--text);
    font-size: 12.5px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, border-color 0.12s, color 0.12s, opacity 0.12s;
  }
  .btn:hover { background: var(--bg-hover); border-color: var(--border-focus); }
  .btn:active { opacity: 0.85; }
  .btn svg { width: 14px; height: 14px; flex-shrink: 0; }
  .btn-primary { background: var(--primary); color: var(--primary-fg); border-color: var(--primary); }
  .btn-primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); color: var(--primary-fg); }
  .btn-ghost { background: transparent; border-color: transparent; color: var(--text-secondary); }
  .btn-ghost:hover { background: var(--bg-hover); border-color: transparent; color: var(--text); }
  .btn-danger { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
  .btn-danger:hover { background: var(--danger); color: #fff; border-color: var(--danger); }
  .btn[hidden] { display: none; }
  .btn-sm { height: 26px; padding: 0 9px; font-size: 12px; }
  .btn-icon { width: 28px; height: 28px; padding: 0; }
  .btn-subtle-xs {
    height: 22px;
    padding: 0 7px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .btn-subtle-xs:hover { background: var(--bg-hover); color: var(--text); border-color: var(--border-strong); }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .pill.clickable { cursor: pointer; transition: background 0.12s, border-color 0.12s, color 0.12s; }
  .pill.clickable:hover { background: var(--bg-hover); color: var(--text); border-color: var(--border-strong); }
  .pill.success { background: var(--success-soft); color: var(--success); border-color: transparent; }
  .pill.warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
  .pill.danger { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
  .pill.info { background: var(--info-soft); color: var(--info); border-color: transparent; }

  .kbd {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--text-muted);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
    line-height: 1.35;
  }

  .input, .select, .textarea {
    width: 100%;
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 13px;
    padding: 7px 10px;
    outline: none;
    transition: border-color 0.14s, box-shadow 0.14s;
  }
  .input:focus, .select:focus, .textarea:focus { border-color: var(--border-focus); }
  .input::placeholder, .textarea::placeholder { color: var(--text-muted); }
  .input.mono, .textarea.mono, .select.mono { font-family: var(--mono); font-size: 12px; }
  .select { cursor: pointer; }
  .select option { background: var(--bg-elevated); color: var(--text); }
  .textarea { resize: vertical; line-height: 1.5; }

  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 16px 18px;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .card-title { font-size: 13px; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
  .card-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  .switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    user-select: none;
  }
  .switch input { display: none; }
  .switch-track {
    width: 30px;
    height: 17px;
    border-radius: 99px;
    background: var(--bg-active);
    border: 1px solid var(--border-strong);
    position: relative;
    transition: background 0.16s, border-color 0.16s;
  }
  .switch-track::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--text-secondary);
    transition: transform 0.16s, background 0.16s;
  }
  .switch input:checked + .switch-track { background: var(--success-soft); border-color: var(--success); }
  .switch input:checked + .switch-track::after { transform: translateX(13px); background: var(--success); }

  .segmented {
    display: inline-flex;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px;
    gap: 2px;
  }
  .seg-btn {
    height: 24px;
    padding: 0 9px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .seg-btn:hover { color: var(--text); }
  .seg-btn.active { background: var(--bg-active); color: var(--text); }

  .callout {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .callout-title { font-size: 11px; font-weight: 600; color: var(--text); margin-bottom: 2px; }
  .callout-warn { border-color: rgba(251, 191, 36, 0.22); background: var(--warn-soft); }
  .callout-warn .callout-title { color: var(--warn); }
  .callout-danger { border-color: rgba(248, 113, 113, 0.22); background: var(--danger-soft); }
  .callout-danger .callout-title { color: var(--danger); }
  .callout-success { border-color: rgba(52, 211, 153, 0.22); background: var(--success-soft); }
  .callout-success .callout-title { color: var(--success); }
  .callout-info { border-color: rgba(96, 165, 250, 0.22); background: var(--info-soft); }
  .callout-info .callout-title { color: var(--info); }

  .popover-wrap { position: relative; }
  .popover-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 196px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: 5px;
    z-index: 80;
    display: none;
  }
  .popover-menu.open { display: block; }
  .popover-title { font-size: 10.5px; font-weight: 500; color: var(--text-muted); padding: 4px 8px 5px; }
  .popover-item {
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12.5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    text-align: left;
  }
  .popover-item:hover { background: var(--bg-hover); color: var(--text); }
  .popover-item.active { background: var(--bg-active); color: var(--text); font-weight: 500; }
  .popover-item.danger { color: var(--danger); }
  .popover-item.danger:hover { background: var(--danger-soft); color: var(--danger); }

  /* Floating Context Menu (Fixed under body so never clipped) */
  .ctx-menu {
    position: fixed;
    min-width: 184px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: 5px;
    z-index: 120;
    display: none;
  }
  .ctx-menu.open { display: block; }
  .ctx-sep {
    height: 1px;
    background: var(--border);
    margin: 4px 2px;
  }

  /* ========================================================================
     Content Area & Tab Panels
     ======================================================================== */
  .workspace { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  .tab-panel { display: none; height: 100%; width: 100%; min-height: 0; overflow: hidden; }
  .tab-panel.active { display: flex; flex-direction: column; }

  /* ========================================================================
     Tab 1: Console (Strict Overflow Containment)
     ======================================================================== */
  .console-layout { display: flex; flex: 1; min-height: 0; overflow: hidden; }
  .chat-stage { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; position: relative; }

  .chat-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 28px 24px 36px;
    min-height: 0;
  }
  .chat-thread {
    max-width: 740px;
    width: 100%;
    min-width: 0;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  /* Empty State */
  .empty-hero { max-width: 620px; margin: 11vh auto 0; text-align: center; }
  .empty-mark {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    display: inline-grid;
    place-items: center;
    margin-bottom: 14px;
    color: var(--text);
  }
  .empty-hero h1 { margin: 0 0 6px; font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--text); }
  .empty-hero p { margin: 0 auto 24px; max-width: 440px; font-size: 13px; color: var(--text-muted); line-height: 1.55; }
  .starter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; text-align: left; }
  .starter-card {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s, border-color 0.12s;
  }
  .starter-card:hover { background: var(--bg-elevated); border-color: var(--border-strong); }
  .starter-title {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text);
    margin-bottom: 3px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .starter-agent { font-family: var(--mono); font-size: 10.5px; color: var(--text-muted); }
  .starter-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.45; }

  /* Chat Messages (Strict No-Overflow) */
  .msg-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
  }
  .msg-row.user { align-items: flex-end; }
  .msg-user-bubble {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 9px 14px;
    max-width: min(82%, 100%);
    font-size: 14px;
    line-height: 1.55;
    color: var(--text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .msg-user-meta { font-size: 11px; color: var(--text-muted); padding-right: 4px; }

  .msg-assistant { width: 100%; min-width: 0; max-width: 100%; }
  .msg-assistant-head { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; font-size: 12px; min-width: 0; }
  .agent-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .msg-agent-name { font-weight: 600; color: var(--text); font-size: 12.5px; }
  .msg-model-name {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .msg-head-right { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .msg-copy-btn {
    opacity: 0;
    height: 20px;
    padding: 0 6px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-secondary);
    font-size: 10.5px;
    cursor: pointer;
    transition: opacity 0.12s, background 0.12s, color 0.12s;
  }
  .msg-assistant:hover .msg-copy-btn, .msg-copy-btn:focus-visible { opacity: 1; }
  .msg-copy-btn:hover { background: var(--bg-hover); color: var(--text); }
  .msg-time { font-family: var(--mono); font-size: 10.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }

  /* Compact Activity / Tool Call Disclosures */
  .activity-stack { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; min-width: 0; max-width: 100%; }
  .disclosure { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-surface); overflow: hidden; max-width: 100%; }
  .disclosure.compact-activity { border-color: var(--border); background: rgba(255, 255, 255, 0.015); }
  [data-theme="light"] .disclosure.compact-activity { background: rgba(0, 0, 0, 0.015); }
  .disclosure > summary {
    list-style: none;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    user-select: none;
    transition: background 0.12s, color 0.12s;
  }
  .disclosure > summary::-webkit-details-marker { display: none; }
  .disclosure > summary:hover { background: var(--bg-hover); color: var(--text); }
  .disclosure-chev { width: 12px; height: 12px; flex-shrink: 0; color: var(--text-muted); transition: transform 0.14s ease; }
  .disclosure[open] > summary .disclosure-chev { transform: rotate(90deg); }
  .tool-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .tool-status-dot.success { background: var(--success); }
  .tool-status-dot.warn { background: var(--warn); animation: pulse 1.2s ease-in-out infinite; }
  .tool-status-dot.danger { background: var(--danger); }
  .disclosure-mono { font-family: var(--mono); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .disclosure-dur { font-family: var(--mono); font-size: 10.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .disclosure-body {
    border-top: 1px solid var(--border);
    background: var(--bg-code);
    padding: 10px 12px;
    font-family: var(--mono);
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--text-secondary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    max-height: 280px;
    overflow: auto;
    max-width: 100%;
  }

  /* Scroll-to-bottom button */
  .scroll-bottom-btn {
    position: absolute;
    left: 50%;
    bottom: 118px;
    transform: translateX(-50%) translateY(8px);
    opacity: 0;
    pointer-events: none;
    height: 28px;
    padding: 0 11px;
    border-radius: 99px;
    border: 1px solid var(--border-strong);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: 11.5px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    box-shadow: var(--shadow-md);
    transition: opacity 0.15s, transform 0.15s, color 0.12s, background 0.12s;
    z-index: 15;
  }
  .scroll-bottom-btn.visible { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0); }
  .scroll-bottom-btn:hover { color: var(--text); background: var(--bg-active); }

  /* Floating Composer */
  .composer-dock {
    padding: 4px 24px 18px;
    flex-shrink: 0;
    background: linear-gradient(to top, var(--bg) 82%, transparent);
  }
  .composer-box {
    max-width: 740px;
    margin: 0 auto;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    padding: 10px 12px 8px;
    box-shadow: var(--shadow-sm);
    transition: border-color 0.14s, box-shadow 0.14s;
  }
  .composer-box:focus-within { border-color: var(--border-focus); box-shadow: var(--shadow-md); }
  .composer-input {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    outline: none;
    min-height: 36px;
    max-height: 180px;
    padding: 2px 2px 8px;
  }
  .composer-input::placeholder { color: var(--text-muted); }
  .composer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }
  .composer-controls { display: flex; align-items: center; gap: 4px; min-width: 0; flex-wrap: wrap; }
  .composer-select-wrap {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 6px;
    height: 26px;
    border-radius: var(--radius-sm);
    transition: background 0.12s;
  }
  .composer-select-wrap:hover { background: var(--bg-hover); }
  .composer-select {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    padding: 2px 16px 2px 0;
    cursor: pointer;
    outline: none;
    max-width: 210px;
    text-overflow: ellipsis;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238b8b96' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 2px center;
  }
  .composer-select:hover, .composer-select:focus { color: var(--text); }
  .composer-select.mono { font-family: var(--mono); font-size: 11.5px; }
  .composer-select option { background: var(--bg-elevated); color: var(--text); }
  .composer-sep { width: 1px; height: 12px; background: var(--border-strong); margin: 0 2px; }
  .scope-chip-btn {
    height: 24px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .scope-chip-btn:hover { background: var(--bg-hover); color: var(--text); }
  .scope-chip-btn.enforced { color: var(--success); }
  .scope-chip-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--warn); }
  .scope-chip-btn.enforced .scope-chip-dot { background: var(--success); }

  /* Floating 3-Pane Model & Thinking Picker */
  .model-picker-anchor { position: relative; display: inline-flex; align-items: center; }
  .model-picker-trigger {
    height: 26px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    max-width: 240px;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .model-picker-trigger:hover, .model-picker-trigger.open {
    background: var(--bg-hover);
    color: var(--text);
    border-color: var(--border);
  }
  .mp-trigger-icon { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex-shrink: 0; color: var(--text); }
  .mp-trigger-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mp-trigger-effort {
    font-size: 10.5px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--accent-soft);
    color: var(--text-secondary);
    font-weight: 500;
    flex-shrink: 0;
  }
  .mp-trigger-chev { width: 11px; height: 11px; flex-shrink: 0; opacity: 0.65; transition: transform 0.15s; }
  .model-picker-trigger.open .mp-trigger-chev { transform: rotate(180deg); }

  .model-picker-pop {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 0;
    width: 580px;
    max-width: calc(100vw - 24px);
    height: 360px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    box-shadow: var(--shadow-lg);
    display: none;
    overflow: hidden;
    z-index: 80;
    backdrop-filter: blur(14px);
  }
  .model-picker-pop.open { display: grid; grid-template-columns: 46px 1fr 164px; animation: mpFadeUp 0.14s ease-out; }
  .model-picker-pop.no-thinking.open { grid-template-columns: 46px 1fr; width: 430px; }
  .model-picker-pop.no-thinking .mp-thinking { display: none; }
  @keyframes mpFadeUp { from { opacity: 0; transform: translateY(6px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }

  .mp-rail {
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    gap: 4px;
    overflow-y: auto;
  }
  .mp-rail-btn {
    position: relative;
    width: 34px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .mp-rail-btn:hover { background: var(--bg-hover); color: var(--text); }
  .mp-rail-btn.active { background: var(--bg-active); color: var(--text); }
  .mp-rail-btn.active::after {
    content: "";
    position: absolute;
    right: -6px;
    top: 7px;
    bottom: 7px;
    width: 2.5px;
    border-radius: 2px;
    background: var(--accent);
  }
  .mp-rail-spacer { flex: 1; }

  .mp-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .mp-search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border-bottom: 1px solid var(--border);
  }
  .mp-search {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 12.5px;
    outline: none;
    min-width: 0;
  }
  .mp-search::placeholder { color: var(--text-muted); }
  .mp-refresh-btn {
    width: 24px;
    height: 24px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-secondary);
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;
  }
  .mp-refresh-btn:hover { background: var(--bg-hover); color: var(--text); }
  .mp-refresh-btn.spinning svg { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .mp-list { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
  .mp-group-hdr {
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    padding: 7px 8px 3px;
  }
  .mp-row {
    width: 100%;
    border: none;
    background: transparent;
    border-radius: 8px;
    padding: 7px 9px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: var(--text-secondary);
    text-align: left;
    transition: background 0.1s, color 0.1s;
  }
  .mp-row:hover { background: var(--bg-hover); color: var(--text); }
  .mp-row.active { background: var(--bg-active); color: var(--text); }
  .mp-row-icon { width: 14px; height: 14px; flex-shrink: 0; color: var(--text); display: inline-flex; align-items: center; justify-content: center; }
  .mp-row-name { flex: 1; font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mp-row-check { font-size: 11px; color: var(--accent); font-weight: 600; flex-shrink: 0; }
  .mp-row-kbd {
    font-family: var(--mono);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .mp-row-star {
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0 2px;
    font-size: 12px;
    opacity: 0.4;
    transition: opacity 0.12s, color 0.12s;
  }
  .mp-row:hover .mp-row-star, .mp-row-star.fav { opacity: 1; }
  .mp-row-star.fav { color: var(--warn); }

  .mp-thinking {
    border-left: 1px solid var(--border);
    background: var(--bg-surface);
    display: flex;
    flex-direction: column;
    padding: 10px;
    gap: 8px;
  }
  .mp-thinking-hdr {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
  .mp-thinking-title { font-size: 11px; font-weight: 600; color: var(--text); line-height: 1.25; }
  .mp-thinking-model { font-size: 10.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 72px; }
  .mp-thinking-list { display: flex; flex-direction: column; gap: 3px; flex: 1; }
  .mp-level-btn {
    width: 100%;
    border: none;
    background: transparent;
    border-radius: 7px;
    padding: 6px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .mp-level-btn:hover { background: var(--bg-hover); color: var(--text); }
  .mp-level-btn.active { background: var(--bg-active); color: var(--text); }
  .mp-slider-box { padding-top: 6px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; }
  .mp-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 99px;
    background: var(--border-strong);
    outline: none;
    cursor: pointer;
  }
  .mp-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--primary);
    border: 2px solid var(--bg-elevated);
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    transition: transform 0.1s;
  }
  .mp-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
  .mp-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--primary);
    border: 2px solid var(--bg-elevated);
    cursor: pointer;
  }

  /* Unified Model + Inline Reasoning Selector next to Model Name */
  .composer-model-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
    border: 1px solid var(--border);
  }
  .composer-model-group .model-picker-trigger { height: 24px; border: none; }
  .composer-reasoning-wrap {
    display: none;
    align-items: center;
    gap: 2px;
    padding-left: 4px;
    border-left: 1px solid var(--border);
  }
  .composer-reasoning-wrap.visible { display: inline-flex; }
  .composer-reasoning-pills {
    display: inline-flex;
    align-items: center;
    gap: 1px;
  }
  .composer-reason-pill {
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 10.5px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 5px;
    cursor: pointer;
    line-height: 1.3;
    transition: background 0.12s, color 0.12s;
  }
  .composer-reason-pill:hover { background: var(--bg-hover); color: var(--text); }
  .composer-reason-pill.active {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }
  .composer-reasoning-slider { display: none; }
  .composer-reasoning-val { display: none; }
  .mp-row-reason {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  /* Upgraded Provider Cards & Custom Model Editor */
  .prv-filter-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .prv-card { display: flex; flex-direction: column; gap: 10px; transition: border-color 0.14s, transform 0.14s; }
  .prv-card:hover { border-color: var(--border-strong); }
  .prv-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .prv-brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .prv-icon-badge {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
    color: var(--text);
    flex-shrink: 0;
  }
  .prv-models-strip { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .prv-model-chip {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 99px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .prv-model-chip:hover { background: var(--bg-hover); color: var(--text); border-color: var(--border-strong); }
  .prv-model-chip.active { background: var(--accent-soft); color: var(--text); border-color: var(--accent); }
  .cp-preset-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 12px 14px 0; }
  .cp-chip-box { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
  .cp-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--mono);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 99px;
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    color: var(--text-secondary);
  }
  .cp-chip button { border: none; background: transparent; color: var(--text-muted); cursor: pointer; padding: 0; font-size: 12px; line-height: 1; }
  .cp-chip button:hover { color: var(--danger); }

  /* Redesigned Providers & Integrations Hub */
  .prv-hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--bg-surface);
    border: 1px solid var(--border);
  }
  .prv-hero-stats { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
  .prv-subnav { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .prv-subpanel { display: none; flex-direction: column; gap: 16px; }
  .prv-subpanel.active { display: flex; }
  .prv-section-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .prv-section-hdr h3 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin: 0;
  }
  .prv-connected-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
    gap: 12px;
  }
  .prv-dir-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .prv-dir-search { max-width: 260px; height: 30px; font-size: 12px; }
  .prv-dir-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(235px, 1fr));
    gap: 10px;
  }
  .prv-dir-tile {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px 13px;
    border-radius: var(--radius);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    text-align: left;
    cursor: pointer;
    color: var(--text);
    transition: border-color 0.14s, background 0.14s, transform 0.12s;
  }
  .prv-dir-tile:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
    transform: translateY(-1px);
  }
  .prv-dir-tile.connected {
    border-color: color-mix(in srgb, var(--success) 35%, var(--border));
  }
  .prv-dir-meta { flex: 1; min-width: 0; }
  .prv-dir-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .prv-dir-sub {
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 2px;
  }
  .prv-empty-state {
    padding: 20px;
    border-radius: var(--radius);
    border: 1px dashed var(--border-strong);
    background: var(--bg-surface);
    text-align: center;
    color: var(--text-muted);
    font-size: 12.5px;
  }
  .prv-modal-head {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }
  .prv-key-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .prv-key-row .input { flex: 1; }
  .cp-studio {
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-surface);
  }

  @media (max-width: 640px) {
    .model-picker-pop.open { width: calc(100vw - 24px); grid-template-columns: 42px 1fr; height: 340px; }
    .model-picker-pop .mp-thinking { display: none; }
  }

  /* File Attachments in Composer & Chat */
  .composer-box.drag-over { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .composer-attachments { display: none; flex-wrap: wrap; gap: 6px; padding: 0 2px 8px; }
  .composer-attachments.has-files { display: flex; }
  .attach-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 6px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--bg-surface);
    color: var(--text-secondary);
    font-size: 11.5px;
    max-width: 220px;
  }
  .attach-chip-thumb { width: 18px; height: 18px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
  .attach-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .attach-chip-size { font-family: var(--mono); font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
  .attach-chip button { border: none; background: transparent; color: var(--text-muted); cursor: pointer; padding: 0 1px; font-size: 13px; line-height: 1; }
  .attach-chip button:hover { color: var(--danger); }
  .attach-btn {
    width: 26px;
    height: 26px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;
  }
  .attach-btn:hover { background: var(--bg-hover); color: var(--text); }
  .msg-attachments { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; margin-top: 5px; }
  .msg-att-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 99px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-secondary);
  }

  .composer-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .send-btn {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: none;
    background: var(--primary);
    color: var(--primary-fg);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: opacity 0.12s, transform 0.1s;
  }
  .send-btn.empty { opacity: 0.35; }
  .send-btn:hover { opacity: 0.9; }
  .send-btn:active { transform: scale(0.95); }

  .stream-pill { display: none; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-secondary); }
  .spinner-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warn); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }

  /* Collapsible Right Swarm & Session Drawer */
  .swarm-drawer {
    width: 320px;
    border-left: 1px solid var(--border);
    background: var(--bg-sidebar);
    display: none;
    flex-direction: column;
    overflow-y: auto;
    padding: 16px 14px;
    gap: 16px;
    flex-shrink: 0;
  }
  .swarm-drawer.open { display: flex; }
  .drawer-section-title { font-size: 12px; font-weight: 600; color: var(--text); display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .check-pills { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 10px; }
  .check-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
    user-select: none;
  }
  .check-pill input { accent-color: var(--primary); margin: 0; }
  .timeline-list { display: flex; flex-direction: column; gap: 8px; }
  .timeline-item { padding: 9px 11px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-surface); }
  .timeline-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
  .progress-track { width: 100%; height: 4px; border-radius: 99px; background: var(--bg-active); overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 99px; background: var(--text); transition: width 0.25s ease; }
  .progress-fill.warn { background: var(--warn); }
  .progress-fill.danger { background: var(--danger); }
  .kv-list { display: flex; flex-direction: column; gap: 7px; }
  .kv-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
  .kv-k { color: var(--text-muted); }
  .kv-v { font-family: var(--mono); font-size: 11.5px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 68%; }

  /* ========================================================================
     Markdown Prose (Strict Overflow Containment)
     ======================================================================== */
  .md-prose {
    font-size: 14px;
    line-height: 1.65;
    color: var(--text);
    overflow-wrap: anywhere;
    word-break: break-word;
    min-width: 0;
    max-width: 100%;
  }
  .md-prose > *:first-child { margin-top: 0; }
  .md-prose > *:last-child { margin-bottom: 0; }
  .md-prose p { margin: 0 0 11px; }
  .md-prose h1, .md-prose h2, .md-prose h3, .md-prose h4 { font-weight: 600; letter-spacing: -0.02em; color: var(--text); margin: 18px 0 7px; }
  .md-prose h1 { font-size: 17px; }
  .md-prose h2 { font-size: 15.5px; }
  .md-prose h3 { font-size: 14px; }
  .md-prose ul, .md-prose ol { margin: 5px 0 11px; padding-left: 20px; }
  .md-prose li { margin: 3px 0; }
  .md-prose li.md-task { list-style: none; margin-left: -20px; display: flex; align-items: baseline; gap: 8px; }
  .md-check { width: 14px; height: 14px; border-radius: 4px; border: 1px solid var(--border-strong); display: inline-grid; place-items: center; font-size: 10px; flex-shrink: 0; }
  .md-check.done { background: var(--success-soft); border-color: var(--success); color: var(--success); }
  .md-prose a { color: var(--info); text-decoration: none; }
  .md-prose a:hover { text-decoration: underline; }
  .md-prose code.md-inline { font-family: var(--mono); font-size: 12.5px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; color: var(--text); }
  .md-code-wrap { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-code); margin: 10px 0; overflow: hidden; max-width: 100%; }
  .md-code-head { display: flex; align-items: center; justify-content: space-between; padding: 5px 11px; border-bottom: 1px solid var(--border); background: var(--bg-surface); font-family: var(--mono); font-size: 11px; color: var(--text-muted); }
  .md-code { margin: 0; padding: 11px 13px; overflow-x: auto; max-width: 100%; font-family: var(--mono); font-size: 12.5px; line-height: 1.55; color: var(--text); }
  .md-prose blockquote { margin: 9px 0; padding: 3px 13px; border-left: 2px solid var(--border-strong); color: var(--text-secondary); }
  .md-hr { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
  .md-table-wrap { overflow-x: auto; max-width: 100%; margin: 10px 0; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  .md-prose table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .md-prose th, .md-prose td { padding: 7px 11px; text-align: left; border-bottom: 1px solid var(--border); }
  .md-prose th { font-size: 11px; font-weight: 500; color: var(--text-muted); background: var(--bg-surface); }
  .md-prose tr:last-child td { border-bottom: none; }

  /* ========================================================================
     Secondary Tool Views
     ======================================================================== */
  .page-scroll { flex: 1; overflow-y: auto; padding: 24px 28px 44px; min-height: 0; }
  .page-container { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
  .split-pane { display: grid; grid-template-columns: 1fr 1fr; flex: 1; min-height: 0; overflow: hidden; }
  .pane { overflow-y: auto; padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; min-height: 0; }
  .pane + .pane { border-left: 1px solid var(--border); }
  .grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .section-heading h2 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: -0.015em; color: var(--text); }
  .section-heading p { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }

  .data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .data-table th { text-align: left; padding: 7px 10px; font-size: 11px; font-weight: 500; color: var(--text-muted); border-bottom: 1px solid var(--border); }
  .data-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: var(--bg-hover); }

  /* HTTP Forge */
  .url-bar { display: flex; align-items: center; background: var(--bg-surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; transition: border-color 0.14s; }
  .url-bar:focus-within { border-color: var(--border-focus); }
  .url-bar select { width: 98px; border: none; border-right: 1px solid var(--border); border-radius: 0; background: var(--bg-elevated); padding: 7px 9px; font-family: var(--mono); font-size: 12px; font-weight: 600; }
  .url-bar input { flex: 1; border: none; border-radius: 0; background: transparent; padding: 7px 11px; font-family: var(--mono); font-size: 12px; }
  .method-tag { font-family: var(--mono); font-size: 10.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
  .method-GET { background: var(--success-soft); color: var(--success); }
  .method-POST { background: var(--warn-soft); color: var(--warn); }
  .method-PUT, .method-PATCH { background: var(--info-soft); color: var(--info); }
  .method-DELETE { background: var(--danger-soft); color: var(--danger); }
  .method-OPTIONS, .method-HEAD { background: var(--accent-soft); color: var(--text-secondary); }
  .history-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-surface); cursor: pointer; transition: background 0.12s, border-color 0.12s; }
  .history-row:hover { background: var(--bg-hover); }
  .history-row.active { border-color: var(--border-focus); background: var(--bg-elevated); }
  .history-url { font-family: var(--mono); font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .code-viewer { flex: 1; min-height: 220px; margin: 0; padding: 13px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-code); font-family: var(--mono); font-size: 12px; line-height: 1.55; color: var(--text); overflow: auto; white-space: pre-wrap; word-break: break-word; }

  /* Severity Bar & Channels */
  .sev-bar { display: flex; height: 5px; border-radius: 99px; overflow: hidden; background: var(--bg-active); gap: 2px; margin-bottom: 10px; }
  .sev-seg-critical { background: #ef4444; }
  .sev-seg-high { background: #f97316; }
  .sev-seg-medium { background: #eab308; }
  .sev-seg-low { background: #3b82f6; }
  .sev-seg-info { background: #71717a; }
  .plat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
  .plat-card { padding: 11px 13px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-elevated); cursor: pointer; text-align: left; transition: border-color 0.12s, background 0.12s; }
  .plat-card:hover { background: var(--bg-hover); }
  .plat-card.active { border-color: var(--border-focus); background: var(--bg-active); }
  .plat-name { font-size: 12.5px; font-weight: 600; color: var(--text); display: flex; justify-content: space-between; align-items: center; }
  .plat-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
  .steps-list { display: flex; flex-direction: column; gap: 7px; margin: 0 0 14px; padding: 0; list-style: none; }
  .step-row { display: flex; align-items: baseline; gap: 9px; font-size: 12.5px; color: var(--text-secondary); }
  .step-num { width: 19px; height: 19px; border-radius: 50%; background: var(--bg-elevated); border: 1px solid var(--border-strong); font-family: var(--mono); font-size: 10.5px; color: var(--text); display: inline-grid; place-items: center; flex-shrink: 0; }
  .step-row code { font-family: var(--mono); font-size: 11.5px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; color: var(--text); }

  /* ========================================================================
     Modals: Command Palette, Project Folder Picker, Settings Panel
     ======================================================================== */
  dialog.cmd-palette, dialog.modal-dlg, dialog.settings-modal {
    margin: auto;
    padding: 0;
    background: var(--bg-elevated);
    color: var(--text);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }
  dialog.cmd-palette::backdrop, dialog.modal-dlg::backdrop, dialog.settings-modal::backdrop {
    background: rgba(0, 0, 0, 0.56);
    backdrop-filter: blur(4px);
  }

  dialog.cmd-palette { width: min(560px, 92vw); max-height: 70vh; }
  .cp-search { display: flex; align-items: center; gap: 10px; padding: 12px 15px; border-bottom: 1px solid var(--border); }
  .cp-search input { flex: 1; border: none; background: transparent; color: var(--text); font-size: 13.5px; outline: none; }
  .cp-list { max-height: 360px; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
  .cp-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 11px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12.5px; color: var(--text-secondary); }
  .cp-item:hover, .cp-item.active { background: var(--bg-active); color: var(--text); }
  .cp-foot { padding: 8px 14px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; }

  /* Project Modal */
  dialog.modal-dlg { width: min(520px, 92vw); max-height: 82vh; }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 16px;
    border-bottom: 1px solid var(--border);
  }
  .modal-title { font-size: 13.5px; font-weight: 600; color: var(--text); }
  .modal-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .modal-foot {
    padding: 11px 16px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .dir-browser {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-code);
    height: 210px;
    overflow-y: auto;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .dir-item {
    width: 100%;
    padding: 6px 9px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--mono);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    text-align: left;
  }
  .dir-item:hover { background: var(--bg-hover); color: var(--text); }
  .dir-item svg { width: 13px; height: 13px; color: var(--text-muted); flex-shrink: 0; }

  /* Settings Modal (Two-Column Layout) */
  dialog.settings-modal {
    width: min(820px, 94vw);
    height: min(600px, 86vh);
    display: none;
  }
  dialog.settings-modal[open] {
    display: grid;
    grid-template-columns: 204px 1fr;
  }
  .settings-nav {
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    padding: 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .settings-nav-title {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-muted);
    padding: 2px 10px 8px;
  }
  .settings-nav-btn {
    width: 100%;
    height: 30px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12.5px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .settings-nav-btn:hover { background: var(--bg-hover); color: var(--text); }
  .settings-nav-btn.active { background: var(--bg-active); color: var(--text); }
  .settings-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--bg-surface);
  }
  .settings-content-head {
    padding: 16px 22px 12px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .settings-content-head h2 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }
  .settings-content-head p { margin: 3px 0 0; font-size: 12px; color: var(--text-muted); }
  .settings-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 18px 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .settings-section { display: none; flex-direction: column; gap: 16px; }
  .settings-section.active { display: flex; }
  .settings-group-label { font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
  .settings-box {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    overflow: hidden;
  }
  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
  }
  .settings-row + .settings-row { border-top: 1px solid var(--border); }
  .settings-row-title { font-size: 13px; font-weight: 500; color: var(--text); }
  .settings-row-sub { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }
  .theme-grid-2x2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .theme-card-opt {
    padding: 12px 14px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: border-color 0.12s, background 0.12s;
  }
  .theme-card-opt:hover { background: var(--bg-hover); }
  .theme-card-opt.active { border-color: var(--info); background: var(--info-soft); }

  /* Toast */
  .toast {
    position: fixed;
    bottom: 18px;
    right: 18px;
    z-index: 999;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    color: var(--text);
    padding: 8px 13px;
    font-size: 12px;
    box-shadow: var(--shadow-md);
    display: none;
  }

  /* Responsive */
  @media (max-width: 1024px) {
    .split-pane { grid-template-columns: 1fr; overflow-y: auto; }
    .pane + .pane { border-left: none; border-top: 1px solid var(--border); }
    .plat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 820px) {
    .app-shell, .app-shell.sidebar-collapsed { grid-template-columns: 1fr; }
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: 268px;
      z-index: 60;
      transform: translateX(-100%);
      transition: transform 0.18s ease;
      box-shadow: var(--shadow-lg);
    }
    .app-shell.sidebar-open .sidebar { transform: translateX(0); }
    .app-shell.sidebar-open .sidebar-backdrop { display: block; position: fixed; inset: 0; z-index: 55; background: rgba(0, 0, 0, 0.45); }
    .starter-grid, .theme-grid-2x2 { grid-template-columns: 1fr; }
    .swarm-drawer { position: fixed; right: 0; top: 44px; bottom: 0; z-index: 50; box-shadow: var(--shadow-lg); }
    .topbar-ws, .topbar-crumb-sep { display: none; }
    dialog.settings-modal[open] { grid-template-columns: 1fr; height: 90vh; }
    .settings-nav { flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--border); padding: 8px; }
    .settings-nav-title { display: none; }
    .settings-nav-btn { width: auto; white-space: nowrap; }
  }
</style>
</head>
<body>
<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;">
  <defs>
    <linearGradient id="logo-gemini-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4285F4"/>
      <stop offset="50%" stop-color="#9B72CB"/>
      <stop offset="100%" stop-color="#D96570"/>
    </linearGradient>
    <linearGradient id="logo-deepseek-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5B7FFF"/>
      <stop offset="100%" stop-color="#4D6BFE"/>
    </linearGradient>
    <linearGradient id="logo-lmstudio-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
</svg>
<div class="app-shell" id="appShell">
  <div class="sidebar-backdrop" onclick="closeMobileSidebar()"></div>

  <!-- LEFT SIDEBAR (4-Zone: Header / Projects+Chats / Bottom-Left Tools / Settings Footer) -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="brand">
        <span class="brand-icon" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 20 2 20 12 2"/></svg>
        </span>
        <span>Yedogu</span>
      </div>
      <div class="sidebar-head-actions">
        <button class="btn btn-ghost btn-icon" onclick="openProjectModal()" title="New project">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10v6M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
        </button>
        <button class="btn btn-ghost btn-icon" onclick="toggleSidebar()" title="Collapse sidebar (Ctrl+B)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
        </button>
      </div>
    </div>

    <!-- Zone 2: Scrollable Projects & Nested Chats -->
    <div class="sidebar-projects-scroll">
      <div class="projects-head">
        <span>Projects</span>
        <button class="mini-icon-btn" onclick="openProjectModal()" title="Add project folder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
      <div id="projectsTree"></div>
    </div>

    <!-- Zone 3: Pinned Bottom-Left Tools -->
    <div class="sidebar-tools">
      <div class="nav-section-label"><span>Tools</span></div>
      <nav class="nav-list">
        <button class="nav-item active" data-tab="console" onclick="switchTab('console')">
          <span class="nav-item-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Console</span>
          </span>
          <span class="nav-count" id="nbMsg"></span>
        </button>
        <button class="nav-item" data-tab="http" onclick="switchTab('http')">
          <span class="nav-item-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6M12 19h8"/></svg>
            <span>HTTP Forge</span>
          </span>
          <span class="nav-count" id="nbHttp"></span>
        </button>
        <button class="nav-item" data-tab="re" onclick="switchTab('re')">
          <span class="nav-item-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>
            <span>RE &amp; JS Recon</span>
          </span>
          <span class="nav-count" id="nbArt"></span>
        </button>
        <button class="nav-item" data-tab="findings" onclick="switchTab('findings')">
          <span class="nav-item-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Findings</span>
          </span>
          <span class="nav-count" id="nbFnd"></span>
        </button>
        <button class="nav-item" data-tab="providers" onclick="switchTab('providers')">
          <span class="nav-item-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Providers &amp; Scope</span>
          </span>
          <span class="nav-count" id="nbPrv"></span>
        </button>
        <button class="nav-item" data-tab="channels" onclick="switchTab('channels')">
          <span class="nav-item-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            <span>Channels</span>
          </span>
          <span class="nav-count" id="nbChn"></span>
        </button>
      </nav>
    </div>

    <!-- Zone 4: Bottom-Left Settings Button + Subtle Live Dot -->
    <div class="sidebar-footer">
      <button class="settings-trigger-btn" onclick="openSettingsModal()" title="Settings (Ctrl+,)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Settings</span>
      </button>
      <span class="status-dot" id="sseDot" title="Synced"></span>
    </div>
  </aside>

  <!-- MAIN WORKSPACE -->
  <div class="main-col">
    <header class="topbar">
      <div class="topbar-left">
        <button class="btn btn-ghost btn-icon" id="sidebarToggleBtn" onclick="toggleSidebar()" title="Toggle sidebar (Ctrl+B)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
        </button>
        <span class="view-title" id="topbarTitle">Console</span>
        <span class="topbar-crumb-sep">/</span>
        <span class="topbar-ws" id="topbarWorkspace">workspace</span>
      </div>

      <div class="topbar-right">
        <span class="pill clickable" id="hudScope" onclick="switchTab('providers')" title="Scope & Rules of Engagement">Advisory</span>
        <button class="btn btn-ghost btn-sm" id="swarmToggleBtn" onclick="toggleSwarmDrawer()" title="Toggle Swarm & Session panel (Ctrl+.)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
          <span>Swarm</span>
        </button>

        <div class="popover-wrap">
          <button class="btn btn-ghost btn-icon" id="themeBtn" onclick="toggleThemeMenu(event)" title="Switch theme (Ctrl+T)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          </button>
          <div class="popover-menu" id="themeMenu">
            <div class="popover-title">Appearance</div>
            <div id="themeMenuList"></div>
          </div>
        </div>

        <button class="btn btn-ghost btn-sm" onclick="openCmdPalette()" title="Command Palette (Ctrl+K)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span class="kbd">⌘K</span>
        </button>
      </div>
    </header>

    <main class="workspace">
      <!-- ===============================================================
           TAB 1: CONSOLE & SWARM
           =============================================================== -->
      <section class="tab-panel active" id="tab-console">
        <div class="console-layout">
          <div class="chat-stage">
            <div class="chat-scroll" id="chatScroll">
              <div class="chat-thread" id="chatMessages"></div>
            </div>

            <button class="scroll-bottom-btn" id="scrollBottomBtn" onclick="scrollChatToBottom()" title="Scroll to bottom">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
              <span>Latest</span>
            </button>

            <div class="composer-dock">
              <div class="composer-box" id="composerBox">
                <div class="composer-attachments" id="composerAttachments"></div>
                <textarea id="chatInput" class="composer-input" rows="1" placeholder="Ask @commander or describe a security objective…"></textarea>
                <input type="file" id="chatFileInput" multiple style="display:none;" onchange="handleChatFilesSelected(this.files)" />
                <div class="composer-bar">
                  <div class="composer-controls">
                    <button type="button" class="attach-btn" id="attachFileBtn" onclick="document.getElementById('chatFileInput').click()" title="Attach files (or drag & drop)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    </button>
                    <span class="composer-sep"></span>
                    <label class="composer-select-wrap" title="Active specialist agent">
                      <span class="agent-dot" id="composerAgentDot" style="background:var(--text-muted);"></span>
                      <select id="composerAgentSelect" class="composer-select" onchange="selectAgent(this.value)"></select>
                    </label>
                    <span class="composer-sep"></span>
                    <div class="composer-model-group">
                      <div class="model-picker-anchor" id="modelPickerAnchor">
                        <button type="button" class="model-picker-trigger" id="modelPickerTrigger" onclick="toggleModelPicker(event)" title="Select active model">
                          <span class="mp-trigger-icon" id="mpTriggerIcon"></span>
                          <span class="mp-trigger-name" id="mpTriggerName">Select model</span>
                          <span class="mp-trigger-effort" id="mpTriggerEffort" style="display:none;"></span>
                          <svg class="mp-trigger-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                        <div class="model-picker-pop" id="modelPickerPopover" onclick="event.stopPropagation()">
                          <div class="mp-rail" id="mpRail"></div>
                          <div class="mp-main">
                            <div class="mp-search-bar">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);flex-shrink:0;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                              <input id="mpSearchInput" class="mp-search" placeholder="Search models…" oninput="MP_SEARCH=this.value;renderModelPickerList()" />
                              <button type="button" class="mp-refresh-btn" id="mpRefreshBtn" onclick="refreshAllProviderModelsUi(this)" title="Refresh available models">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
                              </button>
                            </div>
                            <div class="mp-list" id="mpList"></div>
                          </div>
                          <div class="mp-thinking" id="mpThinkingPane">
                            <div class="mp-thinking-hdr">
                              <span class="mp-thinking-title">Thinking<br/>Level</span>
                              <span class="mp-thinking-model" id="mpThinkingModelName"></span>
                            </div>
                            <div class="mp-thinking-list" id="mpThinkingList"></div>
                            <div class="mp-slider-box">
                              <input type="range" class="mp-slider" id="mpThinkingSlider" min="0" max="3" step="1" oninput="onModalReasoningSlider(this.value)" />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div class="composer-reasoning-wrap" id="composerReasoningWrap" title="Reasoning / Thinking Effort">
                        <div class="composer-reasoning-pills" id="composerReasoningPills"></div>
                        <input type="range" class="mp-slider composer-reasoning-slider" id="composerReasoningSlider" min="0" max="3" step="1" oninput="onComposerReasoningSlider(this.value)" />
                        <span class="composer-reasoning-val" id="composerReasoningVal">Med</span>
                      </div>
                    </div>
                    <span class="composer-sep"></span>
                    <button type="button" class="scope-chip-btn" id="composerScopeBtn" onclick="toggleScopeSwitch(STATE?.session?.scope?.mode !== 'enforced')" title="Toggle scope enforcement">
                      <span class="scope-chip-dot"></span>
                      <span id="composerScopeLabel">Advisory</span>
                    </button>
                  </div>
                  <div class="composer-actions">
                    <div class="stream-pill" id="streamIndicator">
                      <span class="spinner-dot"></span>
                      <span>Running</span>
                      <button class="btn btn-danger btn-sm" onclick="abortRun()">Stop</button>
                    </div>
                    <button class="send-btn empty" id="sendBtn" onclick="sendChat()" title="Send">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Collapsible Right Swarm & Telemetry Drawer -->
          <aside class="swarm-drawer" id="swarmDrawer">
            <div>
              <div class="drawer-section-title">
                <span>Parallel Swarm</span>
                <button class="btn btn-ghost btn-icon" style="width:24px;height:24px;" onclick="toggleSwarmDrawer()" title="Close">×</button>
              </div>
              <input id="swarmGoal" class="input" placeholder="Objective (e.g. Audit ./src for auth flaws)" />
              <div class="check-pills" id="swarmAgentChecks"></div>
              <button class="btn btn-primary" style="width:100%;" onclick="launchSwarm()">Dispatch Swarm</button>
            </div>

            <div style="border-top:1px solid var(--border); padding-top:14px;">
              <div class="drawer-section-title">
                <span>Workers</span>
                <span class="nav-count" id="swarmWorkerCount">0</span>
              </div>
              <div id="swarmTimelineBox"></div>
            </div>

            <div style="border-top:1px solid var(--border); padding-top:14px;">
              <div class="drawer-section-title"><span>Session</span></div>
              <div id="contextMeterBox"></div>
            </div>
          </aside>
        </div>
      </section>

      <!-- ===============================================================
           TAB 2: HTTP FORGE
           =============================================================== -->
      <section class="tab-panel" id="tab-http">
        <div class="split-pane">
          <div class="pane">
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">Request Builder</div>
                  <div class="card-sub">Scoped HTTP repeater with header presets</div>
                </div>
                <label class="switch">
                  <input type="checkbox" id="httpFollowRedirects" checked />
                  <span class="switch-track"></span>
                  <span>Follow 3xx</span>
                </label>
              </div>

              <div style="display:flex; gap:8px; margin-bottom:12px;">
                <div class="url-bar" style="flex:1;">
                  <select id="httpMethod">
                    <option>GET</option><option>POST</option><option>PUT</option>
                    <option>PATCH</option><option>DELETE</option><option>OPTIONS</option><option>HEAD</option>
                  </select>
                  <input id="httpUrl" placeholder="https://target.example.com/api/v1/profile" onkeydown="if(event.key==='Enter')sendHttpForge()" />
                </div>
                <button class="btn btn-primary" onclick="sendHttpForge()">Send</button>
              </div>

              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                <span style="font-size:12px; font-weight:500; color:var(--text-secondary);">Headers (JSON)</span>
                <div style="display:flex; gap:5px;">
                  <button class="btn-subtle-xs" onclick="presetHttpHeader('cors')">+ Origin</button>
                  <button class="btn-subtle-xs" onclick="presetHttpHeader('xff')">+ XFF</button>
                  <button class="btn-subtle-xs" onclick="presetHttpHeader('json')">+ JSON</button>
                </div>
              </div>
              <textarea id="httpHeaders" class="textarea mono" rows="4" style="margin-bottom:12px;">{"Accept": "application/json"}</textarea>

              <div style="font-size:12px; font-weight:500; color:var(--text-secondary); margin-bottom:6px;">Body</div>
              <textarea id="httpBody" class="textarea mono" rows="4" placeholder='{"role": "admin"}'></textarea>
            </div>

            <div class="card" style="flex:1; display:flex; flex-direction:column; min-height:200px;">
              <div class="card-head">
                <div class="card-title">History</div>
                <span class="nav-count" id="httpHistoryCount">0 requests</span>
              </div>
              <div id="httpHistoryList" style="display:flex; flex-direction:column; gap:5px;"></div>
            </div>
          </div>

          <div class="pane">
            <div id="httpInspectorFrame" style="flex:1; display:flex; flex-direction:column;"></div>
          </div>
        </div>
      </section>

      <!-- ===============================================================
           TAB 3: RE & JS RECON
           =============================================================== -->
      <section class="tab-panel" id="tab-re">
        <div class="split-pane">
          <div class="pane">
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">Binary &amp; Package Triage</div>
                  <div class="card-sub">PE, ELF, Mach-O, APK, IPA, Electron ASAR</div>
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <input id="reBinaryPath" class="input mono" placeholder="C:\\path\\to\\binary.exe or app.apk" onkeydown="if(event.key==='Enter')runBinaryTriageUi()" />
                <button class="btn btn-primary" onclick="runBinaryTriageUi()">Triage</button>
              </div>
            </div>
            <div id="binaryArtifactsList" style="display:flex; flex-direction:column; gap:12px;"></div>
          </div>

          <div class="pane">
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">JavaScript Surface Recon</div>
                  <div class="card-sub">Endpoints, source maps, DOM sinks, and secret detection</div>
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <input id="jsReconPath" class="input mono" placeholder="Workspace directory (leave blank for cwd)" onkeydown="if(event.key==='Enter')runJsReconUi()" />
                <button class="btn btn-primary" onclick="runJsReconUi()">Scan</button>
              </div>
            </div>
            <div id="jsReconOutput" style="display:flex; flex-direction:column; gap:12px;"></div>
          </div>
        </div>
      </section>

      <!-- ===============================================================
           TAB 4: FINDINGS & REPORT STUDIO
           =============================================================== -->
      <section class="tab-panel" id="tab-findings">
        <div class="split-pane">
          <div class="pane">
            <div id="findingsOverviewBox"></div>

            <details class="disclosure" id="newFindingAccordion">
              <summary>
                <svg class="disclosure-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                <span style="font-weight:500; color:var(--text);">Record Finding</span>
                <span class="pill" id="liveCvssBadge" style="margin-left:auto;">CVSS —</span>
              </summary>
              <div style="padding:14px; border-top:1px solid var(--border); display:flex; flex-direction:column; gap:10px;">
                <div style="display:grid; grid-template-columns:1fr 124px; gap:8px;">
                  <input id="fTitle" class="input" placeholder="Impact-first vulnerability title" />
                  <select id="fSeverity" class="select">
                    <option value="critical">Critical</option>
                    <option value="high" selected>High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="info">Info</option>
                  </select>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                  <input id="fTarget" class="input mono" placeholder="Target endpoint or asset" />
                  <input id="fCvss" class="input mono" placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N" oninput="previewCvssUi(this.value)" />
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                  <div style="display:flex; gap:5px; flex-wrap:wrap;">
                    <button class="btn-subtle-xs" onclick="applyCvssPreset('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')">RCE 9.8</button>
                    <button class="btn-subtle-xs" onclick="applyCvssPreset('CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N')">IDOR 8.1</button>
                    <button class="btn-subtle-xs" onclick="applyCvssPreset('CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N')">XSS 6.1</button>
                    <button class="btn-subtle-xs" onclick="applyCvssPreset('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N')">Info 5.3</button>
                  </div>
                  <span id="liveCvssScoreViz" style="font-family:var(--mono); font-size:11.5px; color:var(--text-secondary);"></span>
                </div>
                <textarea id="fSummary" class="textarea" rows="2" placeholder="Technical root cause"></textarea>
                <textarea id="fImpact" class="textarea" rows="2" placeholder="Proven security impact"></textarea>
                <textarea id="fRepro" class="textarea mono" rows="2" placeholder="Reproduction steps / PoC"></textarea>
                <div>
                  <button class="btn btn-primary btn-sm" onclick="createFindingUi()">Save Finding</button>
                </div>
              </div>
            </details>

            <div id="findingsList" style="display:flex; flex-direction:column; gap:10px;"></div>
          </div>

          <div class="pane">
            <div class="card" style="flex:1; display:flex; flex-direction:column; gap:12px; min-height:0;">
              <div class="card-head" style="margin-bottom:0;">
                <div>
                  <div class="card-title">Report Studio</div>
                  <div class="card-sub">Auto-redacted tokens, cookies, and PII</div>
                </div>
                <div style="display:flex; gap:6px;">
                  <button class="btn btn-sm" id="rptModeBtn" onclick="toggleReportMode()">Preview</button>
                  <button class="btn btn-sm" onclick="copyReportMd()">Copy</button>
                  <button class="btn btn-primary btn-sm" onclick="downloadReport()">Export .md</button>
                </div>
              </div>

              <div class="segmented" style="align-self:flex-start;">
                <button class="seg-btn" id="rptBtn-redteam" onclick="loadReport('redteam')">Red-Team</button>
                <button class="seg-btn" id="rptBtn-hackerone" onclick="loadReport('hackerone')">HackerOne</button>
                <button class="seg-btn" id="rptBtn-bugcrowd" onclick="loadReport('bugcrowd')">Bugcrowd</button>
              </div>

              <pre id="reportPreview" class="code-viewer">Select a template above to generate a sanitized Markdown report.</pre>
              <div id="reportRendered" style="display:none; flex:1; overflow:auto; padding:14px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-code);"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===============================================================
           TAB 5: PROVIDERS, ROUTING, SCOPE & MCP
           =============================================================== -->
      <section class="tab-panel" id="tab-providers">
        <div class="page-scroll">
          <div class="page-container">
            <div class="prv-hero">
              <div>
                <h2 style="margin:0; font-size:17px; font-weight:600;">Providers &amp; Integrations</h2>
                <p id="providerSummaryText" style="margin:3px 0 0; font-size:12.5px; color:var(--text-secondary);">Auto-discovers environment variables, CLI credentials, and local runtimes.</p>
                <div class="prv-hero-stats" id="providerHeroStats"></div>
              </div>
              <div class="prv-filter-bar">
                <button type="button" class="btn btn-sm" id="prvRefreshAllBtn" onclick="refreshAllProviderModelsUi(this)">Refresh Models</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="openAddCustomProviderUi()">+ Custom Endpoint</button>
              </div>
            </div>

            <div class="prv-subnav">
              <div class="segmented" id="prvSectionSeg">
                <button type="button" class="seg-btn active" data-sec="providers" onclick="setProviderSection('providers')">Providers</button>
                <button type="button" class="seg-btn" data-sec="routing" onclick="setProviderSection('routing')">Agent Routing</button>
                <button type="button" class="seg-btn" data-sec="scope" onclick="setProviderSection('scope')">Scope &amp; MCP</button>
              </div>
            </div>

            <div class="prv-subpanel active" id="prvPanel-providers">
              <div>
                <div class="prv-section-hdr">
                  <h3>Connected Providers</h3>
                  <span class="pill" id="prvConnectedCountPill">0 active</span>
                </div>
                <div class="prv-connected-grid" id="providerConnectedGrid"></div>
              </div>

              <div>
                <div class="prv-dir-toolbar">
                  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <h3 style="margin:0; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Provider Directory</h3>
                    <div class="segmented" id="prvFilterSeg">
                      <button type="button" class="seg-btn active" data-filter="all" onclick="setProviderFilter('all')">All</button>
                      <button type="button" class="seg-btn" data-filter="cloud" onclick="setProviderFilter('cloud')">Cloud</button>
                      <button type="button" class="seg-btn" data-filter="gateway" onclick="setProviderFilter('gateway')">Gateways</button>
                      <button type="button" class="seg-btn" data-filter="local" onclick="setProviderFilter('local')">Local</button>
                      <button type="button" class="seg-btn" data-filter="custom" onclick="setProviderFilter('custom')">Custom</button>
                    </div>
                  </div>
                  <input id="prvDirSearch" class="input prv-dir-search" placeholder="Search providers or models…" oninput="PRV_SEARCH=this.value;renderProvidersAndScope()" />
                </div>
                <div class="prv-dir-grid" id="providerGrid"></div>
              </div>

              <details class="disclosure cp-studio" id="customProviderDisclosure">
                <summary>
                  <svg class="disclosure-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  <span id="customProviderFormTitle" style="font-weight:500; color:var(--text);">+ Add Custom OpenAI / Anthropic / Gemini Endpoint</span>
                </summary>
                <div class="cp-preset-row">
                  <span style="font-size:11px; color:var(--text-muted);">Quick Presets:</span>
                  <button type="button" class="btn btn-sm" onclick="applyCustomPreset('openrouter')">OpenRouter</button>
                  <button type="button" class="btn btn-sm" onclick="applyCustomPreset('together')">Together</button>
                  <button type="button" class="btn btn-sm" onclick="applyCustomPreset('vllm')">vLLM</button>
                  <button type="button" class="btn btn-sm" onclick="applyCustomPreset('litellm')">LiteLLM</button>
                  <button type="button" class="btn btn-sm" onclick="applyCustomPreset('lmstudio')">LM Studio</button>
                </div>
                <form id="customProviderForm" onsubmit="event.preventDefault();saveCustomProviderUi()" style="padding:14px; display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px; align-items:end;">
                  <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary);">Provider ID<input id="cpId" class="input mono" placeholder="e.g. vllm" pattern="[a-zA-Z0-9_-]+" required /></label>
                  <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary);">Display name<input id="cpName" class="input" placeholder="Display name" /></label>
                  <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary);">Protocol<select id="cpProto" class="select"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option></select></label>
                  <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary);">Endpoint URL<input id="cpUrl" class="input mono" type="url" placeholder="https://api.example.com/v1" required /></label>
                  <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary);">API key<input id="cpKey" class="input mono" type="password" autocomplete="new-password" placeholder="API key (optional)" /></label>
                  <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary);">Default model ID<input id="cpModel" class="input mono" placeholder="default-model-id" required /></label>
                  <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary); grid-column:1 / -1;">Additional model IDs (comma-separated)<input id="cpModels" class="input mono" placeholder="Optional additional model IDs" oninput="renderCustomModelChips()" /><div class="cp-chip-box" id="cpModelsChips"></div></label>
                  <div style="display:flex; gap:6px; flex-wrap:wrap; grid-column:1 / -1; align-items:center;">
                    <button class="btn btn-primary" id="cpSaveBtn" type="submit">Add</button>
                    <button class="btn" id="cpProbeBtn" type="button" onclick="probeCustomProviderUi()">Test &amp; Fetch Models</button>
                    <button class="btn" id="cpCancelBtn" type="button" onclick="cancelCustomProviderEditUi()" hidden>Cancel</button>
                    <span id="cpProbeStatus" style="font-size:11.5px; color:var(--text-muted);"></span>
                  </div>
                  <div id="cpProbeResults" class="prv-models-strip" style="grid-column:1 / -1; display:none;"></div>
                </form>
              </details>
            </div>

            <div class="prv-subpanel" id="prvPanel-routing">
              <div class="card">
                <div class="card-head">
                  <div>
                    <div class="card-title">Per-Agent Model Routing</div>
                    <div class="card-sub">Pin a specific model to any specialist agent</div>
                  </div>
                </div>
                <table class="data-table" id="agentRoutingTable"></table>
              </div>
            </div>

            <div class="prv-subpanel" id="prvPanel-scope">
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; align-items:start;">
                <div class="card">
                  <div class="card-head">
                    <div>
                      <div class="card-title">Scope &amp; Rules of Engagement</div>
                      <div class="card-sub">Enforce hard blocks on out-of-scope requests</div>
                    </div>
                    <label class="switch">
                      <input type="checkbox" id="scopeEnforceSwitch" onchange="toggleScopeSwitch(this.checked)" />
                      <span class="switch-track"></span>
                      <span id="scopeSwitchLabel">Advisory</span>
                    </label>
                  </div>
                  <select id="scopeModeSelect" style="display:none;" onchange="updateScopeMode()">
                    <option value="advisory">advisory</option>
                    <option value="enforced">enforced</option>
                  </select>
                  <div style="display:flex; gap:8px; margin-bottom:12px;">
                    <select id="scopeKind" class="select" style="width:94px;"><option value="allow">Allow</option><option value="deny">Deny</option></select>
                    <input id="scopeRuleInput" class="input mono" placeholder="*.target.com or 10.10.0.0/16" onkeydown="if(event.key==='Enter')addScopeRuleUi()" />
                    <button class="btn btn-primary" onclick="addScopeRuleUi()">Add</button>
                  </div>
                  <div id="scopeRulesTree"></div>
                </div>

                <div class="card">
                  <div class="card-head">
                    <div>
                      <div class="card-title">MCP Bridges</div>
                      <div class="card-sub">External tool servers and reverse-engineering bridges</div>
                    </div>
                  </div>
                  <div id="mcpList" style="display:flex; flex-direction:column; gap:7px;"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===============================================================
           TAB 6: CHANNELS & REMOTE BOTS
           =============================================================== -->
      <section class="tab-panel" id="tab-channels">
        <div class="page-scroll">
          <div class="page-container">
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">Connect Messaging Channel</div>
                  <div class="card-sub">Command Yedogu remotely with zero public tunnels required</div>
                </div>
              </div>

              <div class="plat-grid" id="chPlatformTabs">
                <button class="plat-card active" data-plat="telegram" onclick="selectChannelPlatform('telegram')">
                  <div class="plat-name"><span>Telegram</span><span class="pill info">Bot API</span></div>
                  <div class="plat-sub">Long-polling via @BotFather</div>
                </button>
                <button class="plat-card" data-plat="discord" onclick="selectChannelPlatform('discord')">
                  <div class="plat-name"><span>Discord</span><span class="pill">Gateway</span></div>
                  <div class="plat-sub">DMs and server channels</div>
                </button>
                <button class="plat-card" data-plat="slack" onclick="selectChannelPlatform('slack')">
                  <div class="plat-name"><span>Slack</span><span class="pill warn">Socket</span></div>
                  <div class="plat-sub">DMs and @mentions</div>
                </button>
                <button class="plat-card" data-plat="webhook" onclick="selectChannelPlatform('webhook')">
                  <div class="plat-name"><span>Webhook</span><span class="pill success">HTTP</span></div>
                  <div class="plat-sub">WhatsApp, Matrix, n8n</div>
                </button>
              </div>
              <input type="hidden" id="chPlatform" value="telegram" />

              <ol class="steps-list" id="chStepsGuide"></ol>
              <div id="chPlatformHint" style="margin-bottom:12px;"></div>

              <div style="display:grid; grid-template-columns:1fr 170px auto; gap:8px; align-items:center;">
                <input id="chToken" class="input mono" type="password" placeholder="Paste @BotFather token and press Enter" onkeydown="if(event.key==='Enter')createChannelUi()" />
                <select id="chDefaultAgent" class="select">
                  <option value="">Active @agent</option>
                </select>
                <button class="btn btn-primary" onclick="createChannelUi()">Connect</button>
              </div>
              <div id="chExtraRow" style="display:none; gap:8px; margin-top:8px;">
                <input id="chAppToken" class="input mono" type="password" placeholder="Slack App-Level Token (xapp-...)" style="flex:1;" onkeydown="if(event.key==='Enter')createChannelUi()" />
                <input id="chName" class="input" placeholder="Bridge name (optional)" style="flex:1; display:none;" onkeydown="if(event.key==='Enter')createChannelUi()" />
                <input id="chCallbackUrl" class="input mono" placeholder="Callback URL (optional)" style="flex:1; display:none;" onkeydown="if(event.key==='Enter')createChannelUi()" />
              </div>

              <div id="chCreatedNotice" style="display:none; margin-top:12px;"></div>
            </div>

            <div>
              <div class="section-heading">
                <div>
                  <h2>Connected Channels</h2>
                  <p>Supports @agent routing and remote slash commands (/status, /agent, /model, /findings, /abort)</p>
                </div>
              </div>
              <div class="grid-cards" id="channelsGrid"></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</div>

<!-- FLOATING CONTEXT MENU (Chat & Project Hover Options) -->
<div id="ctxMenu" class="ctx-menu" onclick="event.stopPropagation()"></div>

<!-- CONNECT / MANAGE PROVIDER MODAL -->
<dialog id="providerConnectDlg" class="modal-dlg">
  <div class="modal-head">
    <div class="prv-modal-head">
      <span class="prv-icon-badge" id="prvModalIcon"></span>
      <div style="min-width:0;">
        <div class="modal-title" id="prvModalTitle">Connect Provider</div>
        <div style="font-family:var(--mono); font-size:11px; color:var(--text-muted);" id="prvModalMeta"></div>
      </div>
    </div>
    <button class="btn btn-ghost btn-icon" onclick="document.getElementById('providerConnectDlg').close()" title="Close">×</button>
  </div>
  <form class="modal-body" id="prvModalForm" onsubmit="event.preventDefault();submitProviderConnectModal()">
    <div id="prvModalStatusRow" style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;"></div>
    <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary);">
      <span>API Key <span id="prvModalEnvHint" style="font-family:var(--mono); font-size:11px; color:var(--text-muted);"></span></span>
      <div class="prv-key-row">
        <input id="prvModalKey" type="password" class="input mono" autocomplete="new-password" placeholder="Paste API key" />
        <button type="button" class="btn btn-sm" id="prvModalEyeBtn" onclick="togglePrvModalKeyVisibility()" title="Show/Hide Key">Show</button>
      </div>
    </label>
    <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary);">
      <span>Base URL (optional override)</span>
      <input id="prvModalBaseUrl" type="url" class="input mono" placeholder="https://api.example.com/v1" />
    </label>
    <div id="prvModalModelsBox" class="prv-models-strip" style="display:none;"></div>
  </form>
  <div class="modal-foot" style="justify-content:space-between;">
    <div style="display:flex; gap:6px;">
      <button type="button" class="btn btn-danger btn-sm" id="prvModalDisconnectBtn" onclick="disconnectFromProviderModal()" style="display:none;">Disconnect</button>
      <button type="button" class="btn btn-sm" id="prvModalRefreshBtn" onclick="refreshFromProviderModal()" style="display:none;">Refresh Models</button>
    </div>
    <div style="display:flex; gap:8px;">
      <button type="button" class="btn" onclick="document.getElementById('providerConnectDlg').close()">Cancel</button>
      <button type="button" class="btn btn-primary" id="prvModalSaveBtn" onclick="submitProviderConnectModal()">Connect &amp; Sync</button>
    </div>
  </div>
</dialog>

<!-- NEW / EDIT PROJECT MODAL -->
<dialog id="projectModalDlg" class="modal-dlg">
  <div class="modal-head">
    <span class="modal-title" id="projModalTitle">New Project</span>
    <button class="btn btn-ghost btn-icon" onclick="document.getElementById('projectModalDlg').close()" title="Close">×</button>
  </div>
  <div class="modal-body">
    <label style="display:grid; gap:5px; font-size:12px; color:var(--text-secondary);">
      Project Name
      <input id="projNameInput" class="input" placeholder="Leave blank to use folder name" />
    </label>
    <div style="display:grid; gap:6px;">
      <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--text-secondary);">
        <span>Project Folder (grants file read access to this folder)</span>
        <div style="display:flex; gap:4px;">
          <button type="button" class="btn-subtle-xs" onclick="browseProjectFolder(PROJ_BROWSE_HOME)">Home</button>
          <button type="button" class="btn-subtle-xs" onclick="browseProjectFolder(PROJ_BROWSE_WS)">Workspace</button>
          <button type="button" class="btn-subtle-xs" id="projParentBtn" onclick="browseProjectFolder(PROJ_BROWSE_PARENT)">↑ Parent</button>
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <input id="projFolderInput" class="input mono" placeholder="C:\\path\\to\\project" onkeydown="if(event.key==='Enter'){event.preventDefault();browseProjectFolder(this.value);}" />
        <button type="button" class="btn" onclick="browseProjectFolder(document.getElementById('projFolderInput').value)">Browse</button>
        <button type="button" class="btn btn-primary" id="projNativePickBtn" onclick="pickNativeFolderUi()" title="Open system folder picker">Open Folder…</button>
      </div>
      <div class="dir-browser" id="projDirList"></div>
    </div>
  </div>
  <div class="modal-foot">
    <button type="button" class="btn" onclick="document.getElementById('projectModalDlg').close()">Cancel</button>
    <button type="button" class="btn btn-primary" id="projSaveBtn" onclick="submitProjectModal()">Create Project</button>
  </div>
</dialog>

<!-- SETTINGS PANEL MODAL -->
<dialog id="settingsDlg" class="settings-modal">
  <nav class="settings-nav">
    <div class="settings-nav-title">Settings</div>
    <button class="settings-nav-btn active" data-sec="general" onclick="switchSettingsSection('general')">General</button>
    <button class="settings-nav-btn" data-sec="appearance" onclick="switchSettingsSection('appearance')">Appearance</button>
    <button class="settings-nav-btn" data-sec="models" onclick="switchSettingsSection('models')">Models</button>
    <button class="settings-nav-btn" data-sec="permissions" onclick="switchSettingsSection('permissions')">Permissions</button>
    <button class="settings-nav-btn" data-sec="shortcuts" onclick="switchSettingsSection('shortcuts')">Shortcuts</button>
    <button class="settings-nav-btn" data-sec="session" onclick="switchSettingsSection('session')">Session</button>
  </nav>
  <div class="settings-content">
    <div class="settings-content-head">
      <div>
        <h2 id="settingsSecTitle">General</h2>
        <p id="settingsSecSub">Configure chat input, default agent, and streaming behavior.</p>
      </div>
      <button class="btn btn-ghost btn-icon" onclick="document.getElementById('settingsDlg').close()" title="Close">×</button>
    </div>
    <div class="settings-scroll">
      <!-- General -->
      <div class="settings-section active" id="set-sec-general">
        <div>
          <div class="settings-group-label">Input Box</div>
          <div class="settings-box">
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Send message</div>
                <div class="settings-row-sub">Choose which key sends a message in the chat composer.</div>
              </div>
              <div class="segmented">
                <button class="seg-btn" id="sendKeyEnterBtn" onclick="setSendKeyPref('enter')">Enter</button>
                <button class="seg-btn" id="sendKeyCtrlBtn" onclick="setSendKeyPref('ctrl-enter')">Ctrl+Enter</button>
              </div>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Default specialist agent</div>
                <div class="settings-row-sub">Agent used when starting new chats.</div>
              </div>
              <select id="settingsDefaultAgent" class="select" style="width:170px;" onchange="selectAgent(this.value)"></select>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Auto-scroll while streaming</div>
                <div class="settings-row-sub">Follow new tokens automatically when near the bottom.</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="settingsAutoScroll" checked onchange="setAutoScrollPref(this.checked)" />
                <span class="switch-track"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div class="settings-section" id="set-sec-appearance">
        <div>
          <div class="settings-group-label">Theme</div>
          <div class="theme-grid-2x2" id="settingsThemeGrid"></div>
        </div>
        <div>
          <div class="settings-group-label">Workspace</div>
          <div class="settings-box">
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Collapse sidebar</div>
                <div class="settings-row-sub">Hide the left project tree for maximum reading width (⌘B).</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="settingsSidebarCollapsed" onchange="setSidebarCollapsedPref(this.checked)" />
                <span class="switch-track"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Models -->
      <div class="settings-section" id="set-sec-models">
        <div>
          <div class="settings-group-label">Model Routing</div>
          <div class="settings-box">
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Default model</div>
                <div class="settings-row-sub">Primary model used across agents without a custom override.</div>
              </div>
              <select id="settingsModelSelect" class="select" style="width:240px;" onchange="setDefaultModelFromSettings(this.value)"></select>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Thinking / Reasoning effort</div>
                <div class="settings-row-sub">Default reasoning depth for thinking-capable models.</div>
              </div>
              <div class="segmented" id="settingsReasoningSeg">
                <button type="button" class="seg-btn" data-effort="none" onclick="setReasoningEffortUi('none')">Off</button>
                <button type="button" class="seg-btn" data-effort="low" onclick="setReasoningEffortUi('low')">Low</button>
                <button type="button" class="seg-btn" data-effort="medium" onclick="setReasoningEffortUi('medium')">Med</button>
                <button type="button" class="seg-btn" data-effort="high" onclick="setReasoningEffortUi('high')">High</button>
                <button type="button" class="seg-btn" data-effort="xhigh" onclick="setReasoningEffortUi('xhigh')">Extra</button>
              </div>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Connected providers</div>
                <div class="settings-row-sub" id="settingsProvidersSub">—</div>
              </div>
              <button class="btn btn-sm" onclick="document.getElementById('settingsDlg').close();switchTab('providers');">Manage Providers</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Permissions -->
      <div class="settings-section" id="set-sec-permissions">
        <div>
          <div class="settings-group-label">Scope Enforcement</div>
          <div class="settings-box">
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Rules of Engagement mode</div>
                <div class="settings-row-sub">Enforced blocks out-of-scope HTTP &amp; tool requests automatically.</div>
              </div>
              <div class="segmented">
                <button class="seg-btn" id="setScopeAdvBtn" onclick="toggleScopeSwitch(false)">Advisory</button>
                <button class="seg-btn" id="setScopeEnfBtn" onclick="toggleScopeSwitch(true)">Enforced</button>
              </div>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Allow / Deny rules</div>
                <div class="settings-row-sub" id="settingsScopeRulesSub">—</div>
              </div>
              <button class="btn btn-sm" onclick="document.getElementById('settingsDlg').close();switchTab('providers');">Edit Rules</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Shortcuts -->
      <div class="settings-section" id="set-sec-shortcuts">
        <div class="settings-box">
          <div class="settings-row"><span class="settings-row-title">Command Palette</span><span class="kbd">Ctrl/⌘ + K</span></div>
          <div class="settings-row"><span class="settings-row-title">Toggle Sidebar</span><span class="kbd">Ctrl/⌘ + B</span></div>
          <div class="settings-row"><span class="settings-row-title">Open Settings</span><span class="kbd">Ctrl/⌘ + ,</span></div>
          <div class="settings-row"><span class="settings-row-title">Toggle Swarm Panel</span><span class="kbd">Ctrl/⌘ + .</span></div>
          <div class="settings-row"><span class="settings-row-title">Cycle Theme</span><span class="kbd">Ctrl/⌘ + T</span></div>
          <div class="settings-row"><span class="settings-row-title">Switch Tool Views</span><span class="kbd">1 – 6</span></div>
        </div>
      </div>

      <!-- Session -->
      <div class="settings-section" id="set-sec-session">
        <div class="settings-box">
          <div class="settings-row">
            <div><div class="settings-row-title">Daemon Sync</div><div class="settings-row-sub">Live SSE stream with terminal harness</div></div>
            <span class="pill success" id="settingsSseStatus">Synced</span>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-title">Active Session ID</div><div class="settings-row-sub mono" id="settingsSessionId">${initialSessionId}</div></div>
            <button class="btn btn-sm" onclick="copyTextSnippet(STATE?.session?.id || '', 'session ID')">Copy</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-title">Active Project Folder</div><div class="settings-row-sub" id="settingsWorkspacePath" style="font-family:var(--mono); word-break:break-all;">—</div></div>
            <button class="btn btn-sm" onclick="document.getElementById('settingsDlg').close();openProjectModal(activeProjectId());">Change</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-title">Token Usage</div><div class="settings-row-sub" id="settingsTokensSub">0 tokens</div></div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-sm" onclick="document.getElementById('settingsDlg').close();newSession();">New Chat</button>
              <button class="btn btn-danger btn-sm" onclick="clearProjectChatsUi(activeProjectId())">Clear Project Chats</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</dialog>

<div class="toast" id="toast"></div>

<!-- COMMAND PALETTE (Ctrl+K / Cmd+K) -->
<dialog id="cmdPaletteDlg" class="cmd-palette">
  <div class="cp-search">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="color:var(--text-muted);flex-shrink:0;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
    <input id="cpInput" placeholder="Jump to project, chat, view, agent, theme, or action…" autocomplete="off" />
    <span class="kbd">ESC</span>
  </div>
  <div id="cpList" class="cp-list"></div>
  <div class="cp-foot">
    <span>↑↓ navigate · ↵ select</span>
    <span>⌘B sidebar · ⌘, settings · ⌘K palette</span>
  </div>
</dialog>

<script>
let STATE = null;
let CURRENT_TAB = "console";
let ACTIVE_HTTP = null;
let HTTP_VIEW_MODE = "body";
let LAST_REPORT_MD = "";
let LAST_REPORT_FMT = "redteam";
let REPORT_RENDERED_MODE = false;
let FINDING_FILTER = "all";
const STREAM_BUFFERS = {};
const COLLAPSED_PROJECTS = {};
let SEND_KEY_PREF = "enter";
let AUTO_SCROLL_PREF = true;
let EDITING_PROJECT_ID = null;
let PROJ_BROWSE_HOME = "";
let PROJ_BROWSE_WS = "";
let PROJ_BROWSE_PARENT = "";

try {
  SEND_KEY_PREF = localStorage.getItem("yedogu.sendKey") || "enter";
  AUTO_SCROLL_PREF = localStorage.getItem("yedogu.autoScroll") !== "0";
} catch {}

function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

${MARKDOWN_CLIENT_JS}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.style.display = "none", 3000);
}

const TAB_LABELS = {
  console: "Console",
  http: "HTTP Forge",
  re: "RE & JS Recon",
  findings: "Findings",
  providers: "Providers & Scope",
  channels: "Channels",
};

function activeProjectId() {
  if (!STATE) return "";
  return STATE.session?.projectId || (STATE.projects && STATE.projects[0]?.id) || "";
}

function activeProjectObj() {
  const pid = activeProjectId();
  return (STATE?.projects || []).find(p => p.id === pid) || null;
}

function updateTopbarTitle() {
  const title = document.getElementById("topbarTitle");
  if (!title) return;
  if (CURRENT_TAB === "console") {
    title.textContent = STATE?.session?.name || "New chat";
  } else {
    title.textContent = TAB_LABELS[CURRENT_TAB] || CURRENT_TAB;
  }
}

function switchTab(tab) {
  CURRENT_TAB = tab;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + tab));
  updateTopbarTitle();
  closeMobileSidebar();
}

function toggleSidebar() {
  const shell = document.getElementById("appShell");
  if (!shell) return;
  if (window.innerWidth <= 820) {
    shell.classList.toggle("sidebar-open");
  } else {
    const collapsed = shell.classList.toggle("sidebar-collapsed");
    try { localStorage.setItem("yedogu.sidebarCollapsed", collapsed ? "1" : "0"); } catch {}
    const sw = document.getElementById("settingsSidebarCollapsed");
    if (sw) sw.checked = collapsed;
  }
}

function closeMobileSidebar() {
  document.getElementById("appShell")?.classList.remove("sidebar-open");
}

function toggleSwarmDrawer(forceOpen) {
  const drawer = document.getElementById("swarmDrawer");
  if (!drawer) return;
  if (typeof forceOpen === "boolean") drawer.classList.toggle("open", forceOpen);
  else drawer.classList.toggle("open");
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

async function refreshState() {
  STATE = await api("/api/state");
  renderAll();
}

let MP_OPEN = false;
let MP_PROVIDER_FILTER = "all";
let MP_SEARCH = "";
let PRV_FILTER = "all";
let PRV_SEARCH = "";
let PRV_SECTION = "providers";
let PRV_EXPANDED = {};
let PRV_MODAL_ID = null;
let AUTO_REFRESHED_MODELS = false;

const EFFORT_LABELS = { none: "Off", low: "Low", medium: "Med", high: "High", xhigh: "Extra" };
const EFFORT_FULL_LABELS = { none: "Off", low: "Low", medium: "Medium", high: "High", xhigh: "Extra" };
const EFFORT_ORDER_UI = ["none", "low", "medium", "high", "xhigh"];

function getFavoriteModels() {
  try { return JSON.parse(localStorage.getItem("yedogu.favoriteModels") || "[]"); } catch { return []; }
}
function toggleFavoriteModel(key, e) {
  if (e) e.stopPropagation();
  const favs = new Set(getFavoriteModels());
  if (favs.has(key)) favs.delete(key);
  else favs.add(key);
  try { localStorage.setItem("yedogu.favoriteModels", JSON.stringify([...favs])); } catch {}
  renderModelPickerList();
}

function resolveBrandForIcon(pid, modelId) {
  const p = String(pid || "").toLowerCase();
  const m = String(modelId || "").toLowerCase();
  if (p === "openai" || p === "codex" || p === "anthropic" || p === "gemini" || p === "deepseek" || p === "xai" || p === "groq" || p === "mistral" || p === "ollama" || p === "lmstudio") {
    return p;
  }
  if (m) {
    if (/^(?:anthropic\\/)?claude/.test(m)) return "anthropic";
    if (/^(?:openai\\/)?(?:gpt|o1|o3|o4|chatgpt)/.test(m)) return "openai";
    if (/^(?:google\\/)?(?:gemini|gemma)/.test(m)) return "gemini";
    if (/^(?:deepseek\\/)?deepseek/.test(m)) return "deepseek";
    if (/^(?:mistralai\\/)?(?:mistral|codestral|mixtral|pixtral)/.test(m)) return "mistral";
    if (/^(?:x-ai\\/)?grok/.test(m)) return "xai";
    if (/groq/.test(m)) return "groq";
    if (/ollama/.test(m)) return "ollama";
    if (/lmstudio/.test(m)) return "lmstudio";
  }
  if (p === "openrouter" || p.includes("openrouter")) return "openrouter";
  if (p.includes("openai") || p.includes("codex") || p.includes("azure")) return "openai";
  if (p.includes("anthropic") || p.includes("claude")) return "anthropic";
  if (p.includes("gemini") || p.includes("google") || p.includes("vertex")) return "gemini";
  if (p.includes("deepseek")) return "deepseek";
  if (p.includes("xai") || p.includes("grok")) return "xai";
  if (p.includes("groq")) return "groq";
  if (p.includes("mistral")) return "mistral";
  if (p.includes("ollama")) return "ollama";
  if (p.includes("lmstudio")) return "lmstudio";
  return p || "custom";
}

function providerSvgIcon(pid, size = 14, modelId = "") {
  const brand = resolveBrandForIcon(pid, modelId);
  const base = 'width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true" style="display:block;flex-shrink:0;"';

  // OpenAI / Codex: Official 6-petal interlocking blossom
  if (brand === "openai" || brand === "codex") {
    return '<svg ' + base + ' fill="currentColor">' +
      '<path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z"/>' +
    '</svg>';
  }

  // Anthropic (Claude): Official Anthropic A\ slanted mark
  if (brand === "anthropic") {
    return '<svg ' + base + ' fill="currentColor">' +
      '<path d="M17.304 3.541h-3.672l6.696 16.918h3.672zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223L8.616 7.82l2.291 5.945Z"/>' +
    '</svg>';
  }

  // Google Gemini: Official 4-point sparkle with Gemini gradient
  if (brand === "gemini") {
    return '<svg ' + base + ' fill="none">' +
      '<path d="M12 1C12.35 6.85 17.15 11.65 23 12C17.15 12.35 12.35 17.15 12 23C11.65 17.15 6.85 12.35 1 12C6.85 11.65 11.65 6.85 12 1Z" fill="url(#logo-gemini-grad)"/>' +
    '</svg>';
  }

  // OpenRouter: Official branching arrows mark
  if (brand === "openrouter") {
    return '<svg ' + base + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 12h4l3-6h8"/><path d="M7 12l3 6h8"/><path d="M16 4l3 2-3 2"/><path d="M16 16l3 2-3 2"/><circle cx="3.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
    '</svg>';
  }

  // DeepSeek: Official blue whale silhouette
  if (brand === "deepseek") {
    return '<svg ' + base + ' fill="url(#logo-deepseek-grad)">' +
      '<path d="M21.4 10.2c-.6-2.5-2.7-4.5-5.3-5.1-1.3-.3-2.6-.2-3.8.3-.7.3-1.4.2-2-.2-1.1-.8-2.5-1-3.8-.5C4.8 5.4 3.6 7 3.3 8.9c-.2 1.2 0 2.5.6 3.6.2.4.1.9-.3 1.2-.8.6-1.4 1.5-1.6 2.5-.3 1.7.7 3.4 2.4 3.9 1.6.5 3.3-.2 4.1-1.6.4-.7 1.2-1.1 2-1 1.6.3 3.2.1 4.7-.5 3.7-1.4 6.7-5 6.2-6.8zm-10.1 2.2a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7z"/>' +
    '</svg>';
  }

  // xAI (Grok): Official xAI diagonal slash X
  if (brand === "xai") {
    return '<svg ' + base + ' fill="currentColor">' +
      '<path d="M3.1 3.5h3.5l5.4 7.7L17.4 3.5h3.5l-7.1 9.9 7.5 10.1h-3.5l-5.8-8.1-5.9 8.1H2.6l7.5-10.1z"/>' +
    '</svg>';
  }

  // Groq: Official Groq orange geometric bolt/prism
  if (brand === "groq") {
    return '<svg ' + base + ' fill="#F55036">' +
      '<path d="M12 2a10 10 0 1 0 10 10h-3.2a6.8 6.8 0 1 1-2-4.82L14.5 9.5H22V2l-2.9 2.9A9.96 9.96 0 0 0 12 2zm0 5.5A4.5 4.5 0 0 0 7.5 12a4.5 4.5 0 0 0 4.5 4.5c1.86 0 3.45-1.13 4.14-2.74h-3.38a1.65 1.65 0 0 1-2.41-1.46A1.65 1.65 0 0 1 12 10.65c.6 0 1.12.32 1.4.8h3.07A4.5 4.5 0 0 0 12 7.5z"/>' +
    '</svg>';
  }

  // Mistral AI: Official 5-band stepped M
  if (brand === "mistral") {
    return '<svg ' + base + '>' +
      '<rect x="3" y="4" width="3.6" height="3.2" fill="#FFD800"/>' +
      '<rect x="17.4" y="4" width="3.6" height="3.2" fill="#FFD800"/>' +
      '<rect x="3" y="7.2" width="7.2" height="3.2" fill="#FFAF00"/>' +
      '<rect x="13.8" y="7.2" width="7.2" height="3.2" fill="#FFAF00"/>' +
      '<rect x="3" y="10.4" width="18" height="3.2" fill="#FF8205"/>' +
      '<rect x="3" y="13.6" width="3.6" height="3.2" fill="#FA500F"/>' +
      '<rect x="10.2" y="13.6" width="3.6" height="3.2" fill="#FA500F"/>' +
      '<rect x="17.4" y="13.6" width="3.6" height="3.2" fill="#FA500F"/>' +
      '<rect x="1.8" y="16.8" width="6" height="3.2" fill="#E10500"/>' +
      '<rect x="16.2" y="16.8" width="6" height="3.2" fill="#E10500"/>' +
    '</svg>';
  }

  // Ollama: Official llama silhouette mark
  if (brand === "ollama") {
    return '<svg ' + base + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M8.5 3.5c.8 0 1.4.8 1.5 2h4c.1-1.2.7-2 1.5-2 .9 0 1.5 1 1.5 2.4v2.6c1.1 1 1.7 2.4 1.7 4 0 3.6-2.8 6.5-6.7 6.5S5.3 16.1 5.3 12.5c0-1.6.6-3 1.7-4V5.9c0-1.4.6-2.4 1.5-2.4Z"/>' +
      '<circle cx="9.8" cy="11.4" r=".9" fill="currentColor" stroke="none"/><circle cx="14.2" cy="11.4" r=".9" fill="currentColor" stroke="none"/>' +
      '<path d="M10.8 14.3c.7.6 1.7.6 2.4 0"/>' +
    '</svg>';
  }

  // LM Studio: Official indigo/purple geometric LM mark
  if (brand === "lmstudio") {
    return '<svg ' + base + ' fill="none">' +
      '<rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="url(#logo-lmstudio-grad)"/>' +
      '<path d="M7.5 8v8h4M13.5 16V8l2.5 4 2.5-4v8" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  }

  // Custom / Generic endpoint node icon
  return '<svg ' + base + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h6v6H9z"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>' +
  '</svg>';
}

function cleanModelName(id, rawName) {
  const cleanId = String(id || "").trim();
  const trimmedRaw = String(rawName || "").trim();
  if (trimmedRaw && trimmedRaw !== cleanId) {
    return trimmedRaw.replace(/\\s*\\((?:OR|Ollama Live|Local)\\)\\s*$/i, "").trim();
  }
  let base = cleanId.replace(/^(?:openai|anthropic|google|deepseek|qwen|meta-llama|mistralai|x-ai)\\//i, "").replace(/:(?:free|beta)$/i, "");
  base = base.replace(/-(?:20\\d{6}|20\\d{2}-\\d{2}-\\d{2})$/, "");
  const l = base.toLowerCase();
  if (l === "gpt-5") return "GPT-5";
  if (l === "gpt-5-mini") return "GPT-5 Mini";
  if (l === "gpt-4.1") return "GPT-4.1";
  if (l === "gpt-4o") return "GPT-4o";
  if (l === "gpt-4o-mini") return "GPT-4o Mini";
  if (l === "o3" || l === "o4-mini" || l === "o1") return l;
  const cm = l.match(/^claude-(opus|sonnet|haiku)-(\\d+)(?:-(\\d+))?/);
  if (cm) return "Claude " + cm[1][0].toUpperCase() + cm[1].slice(1) + " " + cm[2] + (cm[3] ? "." + cm[3] : "");
  const gm = l.match(/^gemini-(\\d+(?:\\.\\d+)?)-(pro|flash|flash-lite)/);
  if (gm) return "Gemini " + gm[1] + " " + gm[2].split("-").map(x => x[0].toUpperCase() + x.slice(1)).join(" ");
  if (l === "deepseek-reasoner" || l === "deepseek-r1") return "DeepSeek R1";
  if (l === "deepseek-chat") return "DeepSeek V3";
  return base.split(/[-_]+/).filter(Boolean).map(p => (/^(gpt|o\\d|r1|v3)$/i.test(p) ? p.toUpperCase() : /^\\d/.test(p) ? p : p[0].toUpperCase() + p.slice(1))).join(" ") || cleanId;
}

function extractUiVariant(m) {
  const pm = String(m.name || "").match(/^(.+?)\\s*\\(([^)]+)\\)\\s*$/);
  if (pm) return { baseName: pm[1].trim(), variant: pm[2].trim().toLowerCase() };
  const im = String(m.id || "").match(/^(.+?)-(low|medium|high|xhigh|max)$/i);
  if (im) return { baseName: String(m.name || m.id), variant: im[2].toLowerCase() };
  return { baseName: cleanModelName(m.id, m.name) };
}

function groupConnectedModels() {
  if (!STATE) return [];
  const groupsMap = new Map();
  const order = [];
  for (const p of STATE.providers || []) {
    if (!p.connected) continue;
    for (const m of p.models || []) {
      const { baseName, variant } = extractUiVariant(m);
      const key = p.id + "::" + baseName.toLowerCase();
      let g = groupsMap.get(key);
      if (!g) {
        g = { key, displayName: baseName, provider: p, variants: [], isEffortGroup: false };
        groupsMap.set(key, g);
        order.push(key);
      }
      g.variants.push({ label: variant || "default", model: m, spec: p.id + "/" + m.id });
    }
  }
  return order.map(k => {
    const g = groupsMap.get(k);
    if (g.variants.length === 1) {
      g.displayName = cleanModelName(g.variants[0].model.id, g.variants[0].model.name);
      g.isEffortGroup = false;
      return g;
    }
    const eff = new Set(["low", "medium", "high", "xhigh", "max"]);
    g.isEffortGroup = g.variants.every(v => eff.has(v.label));
    if (g.isEffortGroup) {
      g.variants.sort((a, b) => EFFORT_ORDER_UI.indexOf(a.label) - EFFORT_ORDER_UI.indexOf(b.label));
    }
    return g;
  });
}

function allModelSpecs() {
  if (!STATE) return [];
  const list = [];
  for (const p of STATE.providers) {
    if (!p.connected) continue;
    for (const m of p.models) {
      list.push({
        spec: p.id + "/" + m.id,
        label: cleanModelName(m.id, m.name),
        providerId: p.id,
        providerName: p.name,
        model: m,
      });
    }
  }
  return list;
}

function formatModelBadge(spec) {
  if (!spec) return "";
  const idx = spec.indexOf("/");
  const pid = idx === -1 ? "" : spec.slice(0, idx);
  const mid = idx === -1 ? spec : spec.slice(idx + 1);
  if (STATE?.providers) {
    const p = STATE.providers.find(x => x.id === pid);
    const m = p?.models?.find(x => x.id === mid);
    if (m) return cleanModelName(m.id, m.name);
  }
  return cleanModelName(mid);
}

function getActiveReasoningConfig() {
  const s = STATE?.session;
  if (!s) return null;
  const groups = groupConnectedModels();
  const activeGroup = groups.find(g => g.variants.some(v => v.spec === s.activeModel));
  if (activeGroup && activeGroup.isEffortGroup && activeGroup.variants.length > 1) {
    const activeVar = activeGroup.variants.find(v => v.spec === s.activeModel) || activeGroup.variants[0];
    return {
      mode: "variant",
      group: activeGroup,
      levels: activeGroup.variants.map(v => ({
        key: v.label,
        label: EFFORT_FULL_LABELS[v.label] || v.label,
        short: EFFORT_LABELS[v.label] || v.label,
        spec: v.spec,
      })),
      currentKey: activeVar.label,
    };
  }
  const specs = allModelSpecs();
  const cur = specs.find(x => x.spec === s.activeModel);
  const levels = (cur?.model?.reasoningLevels && cur.model.reasoningLevels.length > 1)
    ? cur.model.reasoningLevels
    : (cur?.model?.supportsReasoning
        ? ["low", "medium", "high"]
        : (s.activeModel ? ["none", "low", "medium", "high"] : null));
  if (levels && levels.length > 1) {
    const curEffort = STATE.reasoningEffort || s.reasoningEffort || "medium";
    const resolved = levels.includes(curEffort) ? curEffort : levels[Math.min(1, levels.length - 1)];
    return {
      mode: "effort",
      group: activeGroup,
      levels: levels.map(lv => ({
        key: lv,
        label: EFFORT_FULL_LABELS[lv] || lv,
        short: EFFORT_LABELS[lv] || lv,
      })),
      currentKey: resolved,
    };
  }
  return null;
}

async function selectModelSpec(spec) {
  if (!spec) return;
  try {
    if (STATE?.session) {
      STATE.session.activeModel = spec;
      renderModelPickerAndSlider();
    }
    await api("/api/model", { method: "POST", body: { model: spec } });
    toast("Model set to " + formatModelBadge(spec));
    await refreshState();
  } catch (err) { toast("Error: " + err.message); }
}

async function setReasoningEffortUi(effort) {
  try {
    if (STATE) {
      STATE.reasoningEffort = effort;
      if (STATE.session) STATE.session.reasoningEffort = effort;
      renderModelPickerAndSlider();
    }
    await api("/api/model", { method: "POST", body: { reasoningEffort: effort } });
    toast("Thinking effort: " + (EFFORT_FULL_LABELS[effort] || effort));
    await refreshState();
  } catch (err) { toast("Error: " + err.message); }
}

function applyReasoningByIndex(idx) {
  const cfg = getActiveReasoningConfig();
  if (!cfg) return;
  const item = cfg.levels[Math.max(0, Math.min(cfg.levels.length - 1, Number(idx)))];
  if (!item) return;
  if (cfg.mode === "variant" && item.spec) {
    selectModelSpec(item.spec);
  } else {
    setReasoningEffortUi(item.key);
  }
}

function onComposerReasoningSlider(val) {
  applyReasoningByIndex(val);
}

function onModalReasoningSlider(val) {
  applyReasoningByIndex(val);
}

let MP_HOVER_GROUP_KEY = null;

function getReasoningConfigForGroup(group) {
  if (!group) return null;
  const s = STATE?.session;
  const curEffort = STATE?.reasoningEffort || s?.reasoningEffort || "medium";
  if (group.isEffortGroup && group.variants.length > 1) {
    const activeVar = group.variants.find(v => v.spec === s?.activeModel) ||
      group.variants.find(v => v.label === curEffort) ||
      group.variants.find(v => v.label === "medium") ||
      group.variants[0];
    return {
      mode: "variant",
      group,
      levels: group.variants.map(v => ({
        key: v.label,
        label: EFFORT_FULL_LABELS[v.label] || v.label,
        short: EFFORT_LABELS[v.label] || v.label,
        spec: v.spec,
      })),
      currentKey: activeVar.label,
    };
  }
  const primary = group.variants[0]?.model;
  const levels = (primary?.reasoningLevels && primary.reasoningLevels.length > 1)
    ? primary.reasoningLevels
    : (primary?.supportsReasoning ? ["low", "medium", "high"] : ["none", "low", "medium", "high"]);
  if (levels && levels.length > 1) {
    const resolved = levels.includes(curEffort) ? curEffort : levels[Math.min(1, levels.length - 1)];
    return {
      mode: "effort",
      group,
      targetSpec: group.variants[0]?.spec,
      levels: levels.map(lv => ({
        key: lv,
        label: EFFORT_FULL_LABELS[lv] || lv,
        short: EFFORT_LABELS[lv] || lv,
      })),
      currentKey: resolved,
    };
  }
  return null;
}

function setMpHoverGroup(key) {
  MP_HOVER_GROUP_KEY = key || null;
  renderModelPickerThinking();
}

function toggleModelPicker(e) {
  if (e) e.stopPropagation();
  closeCtxMenu();
  document.getElementById("themeMenu")?.classList.remove("open");
  MP_OPEN = !MP_OPEN;
  if (!MP_OPEN) MP_HOVER_GROUP_KEY = null;
  document.getElementById("modelPickerTrigger")?.classList.toggle("open", MP_OPEN);
  document.getElementById("modelPickerPopover")?.classList.toggle("open", MP_OPEN);
  if (MP_OPEN) {
    renderModelPickerPopover();
    setTimeout(() => document.getElementById("mpSearchInput")?.focus(), 20);
  }
}

function closeModelPicker() {
  MP_OPEN = false;
  MP_HOVER_GROUP_KEY = null;
  document.getElementById("modelPickerTrigger")?.classList.remove("open");
  document.getElementById("modelPickerPopover")?.classList.remove("open");
}

function setMpProviderFilter(pid) {
  MP_PROVIDER_FILTER = pid;
  MP_HOVER_GROUP_KEY = null;
  renderModelPickerPopover();
}

function renderModelPickerPopover() {
  const pop = document.getElementById("modelPickerPopover");
  const rail = document.getElementById("mpRail");
  if (!pop || !rail || !STATE) return;

  const connected = (STATE.providers || []).filter(p => p.connected && (p.models || []).length > 0);
  const railBtns = [
    '<button type="button" class="mp-rail-btn' + (MP_PROVIDER_FILTER === "all" ? " active" : "") + '" onclick="setMpProviderFilter(\\'all\\')" title="All Available">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
    '</button>',
    ...connected.map(p =>
      '<button type="button" class="mp-rail-btn' + (MP_PROVIDER_FILTER === p.id ? " active" : "") + '" onclick="setMpProviderFilter(\\'' + esc(p.id) + '\\')" title="' + esc(p.name) + '">' +
        providerSvgIcon(p.id, 15) +
      '</button>'
    ),
    '<div class="mp-rail-spacer"></div>',
    '<button type="button" class="mp-rail-btn" onclick="closeModelPicker();switchTab(\\'providers\\')" title="Manage Providers & Custom Models">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' +
    '</button>',
  ];
  rail.innerHTML = railBtns.join("");
  renderModelPickerList();
  renderModelPickerThinking();
}

function renderModelPickerList() {
  const listEl = document.getElementById("mpList");
  if (!listEl || !STATE) return;
  const activeModel = STATE.session?.activeModel || "";
  const favs = new Set(getFavoriteModels());
  const q = MP_SEARCH.trim().toLowerCase();

  let groups = groupConnectedModels();
  if (MP_PROVIDER_FILTER !== "all") {
    groups = groups.filter(g => g.provider.id === MP_PROVIDER_FILTER);
  }
  if (q) {
    groups = groups.filter(g =>
      g.displayName.toLowerCase().includes(q) ||
      g.provider.name.toLowerCase().includes(q) ||
      g.variants.some(v => v.spec.toLowerCase().includes(q))
    );
  }

  groups.sort((a, b) => {
    const af = favs.has(a.key) ? 0 : 1;
    const bf = favs.has(b.key) ? 0 : 1;
    return af - bf;
  });

  if (groups.length === 0) {
    listEl.innerHTML = '<div style="padding:26px 14px; text-align:center; color:var(--text-muted); font-size:12px;">No available models match. <br/><button type="button" class="btn btn-sm" style="margin-top:8px;" onclick="closeModelPicker();switchTab(\\'providers\\')">Connect Provider</button></div>';
    return;
  }

  let shortcutIdx = 0;
  let html = "";
  let lastPid = "";
  for (const g of groups) {
    if (MP_PROVIDER_FILTER === "all" && !q && g.provider.id !== lastPid) {
      lastPid = g.provider.id;
      html += '<div class="mp-group-hdr">' + esc(g.provider.name) + '</div>';
    }
    const isActive = g.variants.some(v => v.spec === activeModel);
    const defaultVariant = g.variants.find(v => v.label === "medium") || g.variants[0];
    const targetSpec = isActive ? activeModel : defaultVariant.spec;
    const primaryModelId = g.variants[0]?.model?.id || "";
    const rCfg = getReasoningConfigForGroup(g);
    const reasonBadge = rCfg
      ? '<span class="mp-row-reason">' + esc(isActive ? (EFFORT_LABELS[rCfg.currentKey] || rCfg.currentKey) : (rCfg.levels.length + "lv")) + '</span>'
      : '';
    shortcutIdx += 1;
    const kbd = shortcutIdx <= 5 ? '<span class="mp-row-kbd">Ctrl+' + shortcutIdx + '</span>' : '';
    const isFav = favs.has(g.key);
    html +=
      '<button type="button" class="mp-row' + (isActive ? " active" : "") + '" data-spec="' + esc(targetSpec) + '" data-group-key="' + esc(g.key) + '" onmouseenter="setMpHoverGroup(this.dataset.groupKey)" onclick="MP_HOVER_GROUP_KEY=this.dataset.groupKey;selectModelSpec(\\'' + esc(targetSpec) + '\\');renderModelPickerThinking()">' +
        '<span class="mp-row-icon">' + providerSvgIcon(g.provider.id, 14, primaryModelId) + '</span>' +
        '<span class="mp-row-name">' + esc(g.displayName) + '</span>' +
        reasonBadge +
        (isActive ? '<span class="mp-row-check">✓</span>' : '') +
        kbd +
        '<span class="mp-row-star' + (isFav ? " fav" : "") + '" onclick="toggleFavoriteModel(\\'' + esc(g.key) + '\\', event)" title="Pin favorite">' + (isFav ? "★" : "☆") + '</span>' +
      '</button>';
  }
  listEl.innerHTML = html;
}

async function selectModelAndEffort(spec, effortKey) {
  try {
    await api("/api/model", {
      method: "POST",
      body: { ...(spec ? { model: spec } : {}), ...(effortKey ? { reasoningEffort: effortKey } : {}) },
    });
    toast((spec ? formatModelBadge(spec) + " · " : "Thinking effort: ") + (EFFORT_FULL_LABELS[effortKey] || effortKey));
    await refreshState();
  } catch (err) { toast("Error: " + err.message); }
}

function renderModelPickerThinking() {
  const pop = document.getElementById("modelPickerPopover");
  const listEl = document.getElementById("mpThinkingList");
  const nameEl = document.getElementById("mpThinkingModelName");
  const slider = document.getElementById("mpThinkingSlider");
  if (!pop || !listEl || !slider) return;

  let cfg = null;
  if (MP_HOVER_GROUP_KEY) {
    const hoverGroup = groupConnectedModels().find(g => g.key === MP_HOVER_GROUP_KEY);
    if (hoverGroup) cfg = getReasoningConfigForGroup(hoverGroup);
  }
  if (!cfg) {
    cfg = getActiveReasoningConfig();
  }
  if (!cfg) {
    pop.classList.add("no-thinking");
    return;
  }
  pop.classList.remove("no-thinking");
  if (nameEl) {
    nameEl.textContent = cfg.group?.displayName || formatModelBadge(STATE.session.activeModel);
  }

  const curIdx = Math.max(0, cfg.levels.findIndex(l => l.key === cfg.currentKey));
  slider.min = "0";
  slider.max = String(Math.max(0, cfg.levels.length - 1));
  slider.value = String(curIdx);

  listEl.innerHTML = cfg.levels.map((lv, i) => {
    const active = i === curIdx;
    let onclick = "";
    if (cfg.mode === "variant" && lv.spec) {
      onclick = 'selectModelSpec(\\'' + esc(lv.spec) + '\\')';
    } else if (cfg.targetSpec && cfg.targetSpec !== STATE.session?.activeModel) {
      onclick = 'selectModelAndEffort(\\'' + esc(cfg.targetSpec) + '\\', \\'' + esc(lv.key) + '\\')';
    } else {
      onclick = 'setReasoningEffortUi(\\'' + esc(lv.key) + '\\')';
    }
    return '<button type="button" class="mp-level-btn' + (active ? " active" : "") + '" onclick="' + onclick + '">' +
      '<span>' + esc(lv.label) + '</span>' +
      (active ? '<span>✓</span>' : '') +
    '</button>';
  }).join("");
}

function renderModelPickerAndSlider() {
  const s = STATE?.session;
  if (!s) return;
  const triggerIcon = document.getElementById("mpTriggerIcon");
  const triggerName = document.getElementById("mpTriggerName");
  const triggerEffort = document.getElementById("mpTriggerEffort");
  const spec = s.activeModel || "";
  const pid = spec.includes("/") ? spec.slice(0, spec.indexOf("/")) : "";
  const mid = spec.includes("/") ? spec.slice(spec.indexOf("/") + 1) : spec;

  if (triggerIcon) triggerIcon.innerHTML = providerSvgIcon(pid, 13, mid);
  if (triggerName) triggerName.textContent = formatModelBadge(spec) || spec;

  const rCfg = getActiveReasoningConfig();
  const rWrap = document.getElementById("composerReasoningWrap");
  const rPills = document.getElementById("composerReasoningPills");
  const rSlider = document.getElementById("composerReasoningSlider");
  const rVal = document.getElementById("composerReasoningVal");

  if (rCfg && rWrap && rSlider && rVal) {
    const idx = Math.max(0, rCfg.levels.findIndex(l => l.key === rCfg.currentKey));
    const curLv = rCfg.levels[idx] || rCfg.levels[0];
    rWrap.classList.add("visible");
    rSlider.min = "0";
    rSlider.max = String(Math.max(0, rCfg.levels.length - 1));
    rSlider.value = String(idx);
    rVal.textContent = curLv.short;
    if (rPills) {
      rPills.innerHTML = rCfg.levels.map((lv, i) => {
        const active = i === idx;
        const onclick = rCfg.mode === "variant" && lv.spec
          ? 'selectModelSpec(\\'' + esc(lv.spec) + '\\')'
          : 'setReasoningEffortUi(\\'' + esc(lv.key) + '\\')';
        return '<button type="button" class="composer-reason-pill' + (active ? " active" : "") + '" onclick="' + onclick + '" title="Thinking: ' + esc(lv.label) + '">' + esc(lv.short) + '</button>';
      }).join("");
    }
    if (triggerEffort) {
      triggerEffort.style.display = "inline-block";
      triggerEffort.textContent = curLv.short;
    }
  } else {
    rWrap?.classList.remove("visible");
    if (rPills) rPills.innerHTML = "";
    if (triggerEffort) triggerEffort.style.display = "none";
  }

  if (MP_OPEN) renderModelPickerPopover();
}

async function refreshAllProviderModelsUi(btn) {
  if (btn) btn.classList.add("spinning");
  try {
    const res = await api("/api/providers/refresh", { method: "POST", body: {} });
    const liveCount = (res.refreshed || []).filter(r => r.live).length;
    toast(liveCount ? ("Synced live models for " + liveCount + " provider(s)") : "Model list refreshed");
    await refreshState();
  } catch (err) {
    toast("Refresh failed: " + err.message);
  } finally {
    if (btn) btn.classList.remove("spinning");
  }
}

function fmtCompactNum(n) {
  const v = Number(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(2) + "M";
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return String(v);
}

function fmtRelTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + "m";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "h";
  const day = Math.floor(hr / 24);
  return day + "d";
}

/* ========================================================================
   Theme Switcher
   ======================================================================== */
const UI_THEMES = [
  { id: "obsidian", name: "Obsidian", dot: "#18181b" },
  { id: "light", name: "Light", dot: "#e4e4e7" },
  { id: "slate", name: "Linear Slate", dot: "#818cf8" },
  { id: "stone", name: "Warm Stone", dot: "#d97757" },
];

function resolveUiTheme(raw) {
  if (["obsidian", "light", "slate", "stone"].includes(raw)) return raw;
  if (raw === "claude" || raw === "gruvbox") return "stone";
  if (raw === "tokyonight" || raw === "catppuccin" || raw === "nord" || raw === "osmium" || raw === "dracula") return "slate";
  return "obsidian";
}

function renderThemeMenu(activeId) {
  const el = document.getElementById("themeMenuList");
  if (el) {
    el.innerHTML = UI_THEMES.map(t =>
      '<button class="popover-item' + (t.id === activeId ? " active" : "") + '" onclick="changeThemeUi(\\'' + t.id + '\\')">' +
        '<span style="display:inline-flex; align-items:center; gap:8px;">' +
          '<span style="width:9px; height:9px; border-radius:50%; background:' + t.dot + '; border:1px solid var(--border-strong);"></span>' +
          esc(t.name) +
        '</span>' +
        (t.id === activeId ? '<span>✓</span>' : '') +
      '</button>'
    ).join("");
  }
  const grid = document.getElementById("settingsThemeGrid");
  if (grid) {
    grid.innerHTML = UI_THEMES.map(t =>
      '<button class="theme-card-opt' + (t.id === activeId ? " active" : "") + '" onclick="changeThemeUi(\\'' + t.id + '\\')">' +
        '<span style="display:inline-flex; align-items:center; gap:9px;">' +
          '<span style="width:12px; height:12px; border-radius:50%; background:' + t.dot + '; border:1px solid var(--border-strong);"></span>' +
          '<span style="font-size:13px; font-weight:500;">' + esc(t.name) + '</span>' +
        '</span>' +
        (t.id === activeId ? '<span class="pill info">Active</span>' : '') +
      '</button>'
    ).join("");
  }
}

function toggleThemeMenu(e) {
  e.stopPropagation();
  closeCtxMenu();
  document.getElementById("themeMenu").classList.toggle("open");
}

document.addEventListener("click", () => {
  document.getElementById("themeMenu")?.classList.remove("open");
  closeModelPicker();
  closeCtxMenu();
});

function applyWebTheme(themeId) {
  const resolved = resolveUiTheme(themeId);
  document.documentElement.setAttribute("data-theme", resolved);
  renderThemeMenu(resolved);
}

async function changeThemeUi(themeId) {
  applyWebTheme(themeId);
  document.getElementById("themeMenu")?.classList.remove("open");
  try {
    await api("/api/theme", { method: "POST", body: { theme: themeId } });
    toast("Theme set to " + themeId);
  } catch (err) { toast("Theme error: " + err.message); }
}

function cycleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "obsidian";
  const ids = UI_THEMES.map(t => t.id);
  const next = ids[(ids.indexOf(cur) + 1) % ids.length];
  changeThemeUi(next);
}

/* ========================================================================
   Master Render Pipeline
   ======================================================================== */
function renderAll() {
  if (!STATE) return;
  if (STATE.theme) applyWebTheme(STATE.theme);
  const s = STATE.session;

  document.getElementById("chatInput").placeholder = "Ask @" + s.activeAgent + " or describe a security objective…";
  const proj = activeProjectObj();
  const wsParts = (s.workspace || "").split(/[\\\\/]/).filter(Boolean);
  const wsBase = proj?.name || wsParts[wsParts.length - 1] || s.workspace || "workspace";
  const topWs = document.getElementById("topbarWorkspace");
  if (topWs) {
    topWs.textContent = wsBase;
    topWs.title = s.workspace || "";
  }
  updateTopbarTitle();

  const scopeEl = document.getElementById("hudScope");
  const isEnforced = s.scope.mode === "enforced";
  scopeEl.textContent = isEnforced ? ("Scope Enforced · " + s.scope.allow.length) : "Advisory";
  scopeEl.className = "pill clickable " + (isEnforced ? "success" : "warn");

  const cScopeBtn = document.getElementById("composerScopeBtn");
  const cScopeLbl = document.getElementById("composerScopeLabel");
  if (cScopeBtn && cScopeLbl) {
    cScopeBtn.className = "scope-chip-btn" + (isEnforced ? " enforced" : "");
    cScopeLbl.textContent = isEnforced ? "Enforced" : "Advisory";
  }

  const setCount = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val ? String(val) : "";
  };
  setCount("nbMsg", s.messages.filter(m => m.role !== "tool").length);
  setCount("nbHttp", s.httpHistory.length);
  setCount("nbArt", s.artifacts.length);
  setCount("nbFnd", s.findings.length);
  setCount("nbPrv", STATE.providers.filter(p => p.connected).length);
  setCount("nbChn", (STATE.channels || []).filter(c => c.status?.state === "connected").length);

  renderModelPickerAndSlider();

  renderProjectsAndChats();
  renderAgents();
  renderChat();
  renderSwarm();
  renderHttp();
  renderArtifacts();
  renderFindings();
  renderProvidersAndScope();
  renderChannels();
  renderSettingsPanel();
}

/* ========================================================================
   Projects & Nested Chats + Hover Context Menus
   ======================================================================== */
function toggleProjectCollapse(projectId) {
  COLLAPSED_PROJECTS[projectId] = !COLLAPSED_PROJECTS[projectId];
  renderProjectsAndChats();
}

function renderProjectsAndChats() {
  const tree = document.getElementById("projectsTree");
  if (!tree) return;
  const cur = STATE.session;
  const curProjId = activeProjectId();
  const projects = (STATE.projects && STATE.projects.length)
    ? STATE.projects
    : [{ id: curProjId || "default", name: "Workspace", folder: cur.workspace }];
  const sessions = Array.isArray(STATE.sessions) ? STATE.sessions : [];

  const chevSvg = '<svg class="proj-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const folderSvg = '<svg class="proj-folder-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  const plusSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
  const dotsSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
  const pinSvg = '<svg class="thread-pin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';

  tree.innerHTML = projects.map(p => {
    const isCollapsed = Boolean(COLLAPSED_PROJECTS[p.id]);
    const isCurProj = p.id === curProjId;
    const pSessions = sessions.filter(s => s.projectId === p.id);

    const chatsHtml = pSessions.map(item => {
      const isActive = item.id === cur.id;
      const isBusy = isActive && Boolean(STATE.busy);
      const isPinned = Boolean(item.pinned);
      const metaTitle = (item.name || "New chat") + " · " + (item.messagesCount || 0) + " msgs · " + (item.findingsCount || 0) + " findings";
      return '<div class="thread-item' + (isActive ? " active" : "") + (isBusy ? " busy" : "") + '" data-session-id="' + esc(item.id) + '" onclick="switchSessionUi(\\'' + esc(item.id) + '\\')" title="' + esc(metaTitle) + '">' +
        '<span class="thread-left">' +
          '<span class="thread-dot"></span>' +
          (isPinned ? pinSvg : '') +
          '<span class="thread-title">' + esc(item.name || "New chat") + '</span>' +
        '</span>' +
        '<span class="thread-time">' + esc(fmtRelTime(item.updatedAt)) + '</span>' +
        '<span class="thread-actions" onclick="event.stopPropagation()">' +
          '<button type="button" class="mini-icon-btn" onclick="togglePinSession(\\'' + esc(item.id) + '\\', ' + (!isPinned) + ')" title="' + (isPinned ? "Unpin chat" : "Pin chat") + '">' +
            '<svg viewBox="0 0 24 24" fill="' + (isPinned ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>' +
          '</button>' +
          '<button type="button" class="mini-icon-btn" onclick="openChatMenu(event, \\'' + esc(item.id) + '\\')" title="Chat options">' + dotsSvg + '</button>' +
        '</span>' +
      '</div>';
    }).join("");

    return '<div class="project-group' + (isCollapsed ? " collapsed" : "") + '">' +
      '<div class="project-row' + (isCurProj ? " active-project" : "") + '" data-project-id="' + esc(p.id) + '" onclick="toggleProjectCollapse(\\'' + esc(p.id) + '\\')" title="' + esc(p.folder) + '">' +
        '<span class="project-row-left">' +
          chevSvg +
          folderSvg +
          '<span class="project-name">' + esc(p.name) + '</span>' +
        '</span>' +
        '<span class="project-actions" onclick="event.stopPropagation()">' +
          '<button type="button" class="mini-icon-btn" onclick="newSession(\\'' + esc(p.id) + '\\')" title="New chat in ' + esc(p.name) + '">' + plusSvg + '</button>' +
          '<button type="button" class="mini-icon-btn" onclick="openProjectMenu(event, \\'' + esc(p.id) + '\\')" title="Project options">' + dotsSvg + '</button>' +
        '</span>' +
      '</div>' +
      '<div class="thread-list">' + (chatsHtml || '<div style="padding:4px 8px; font-size:11.5px; color:var(--text-muted);">No chats</div>') + '</div>' +
    '</div>';
  }).join("");
}

function closeCtxMenu() {
  const m = document.getElementById("ctxMenu");
  if (m) m.classList.remove("open");
  document.querySelectorAll(".thread-item.menu-open, .project-row.menu-open").forEach(el => el.classList.remove("menu-open"));
}

function positionCtxMenu(anchorEl) {
  const menu = document.getElementById("ctxMenu");
  if (!menu) return;
  menu.classList.add("open");
  const rect = anchorEl.getBoundingClientRect();
  const mw = menu.offsetWidth || 190;
  const mh = menu.offsetHeight || 160;
  let left = rect.right + 4;
  if (left + mw > window.innerWidth - 10) left = Math.max(8, rect.left - mw - 4);
  let top = rect.top;
  if (top + mh > window.innerHeight - 10) top = Math.max(8, window.innerHeight - mh - 10);
  menu.style.left = left + "px";
  menu.style.top = top + "px";
}

function openChatMenu(e, sessionId) {
  e.stopPropagation();
  closeCtxMenu();
  const s = (STATE?.sessions || []).find(x => x.id === sessionId);
  if (!s) return;
  const row = e.currentTarget.closest(".thread-item");
  row?.classList.add("menu-open");
  const isPinned = Boolean(s.pinned);

  const menu = document.getElementById("ctxMenu");
  menu.innerHTML =
    '<button class="popover-item" onclick="closeCtxMenu();renameSessionUi(\\'' + esc(sessionId) + '\\')"><span>Rename</span></button>' +
    '<button class="popover-item" onclick="closeCtxMenu();togglePinSession(\\'' + esc(sessionId) + '\\', ' + (!isPinned) + ')"><span>' + (isPinned ? "Unpin" : "Pin") + '</span></button>' +
    '<button class="popover-item" onclick="closeCtxMenu();copyTextSnippet(\\'' + esc(sessionId) + '\\', \\'chat ID\\')"><span>Copy ID</span></button>' +
    '<div class="ctx-sep"></div>' +
    '<button class="popover-item danger" onclick="closeCtxMenu();deleteSessionUi(\\'' + esc(sessionId) + '\\')"><span>Delete</span></button>';
  positionCtxMenu(e.currentTarget);
}

function openProjectMenu(e, projectId) {
  e.stopPropagation();
  closeCtxMenu();
  const p = (STATE?.projects || []).find(x => x.id === projectId);
  if (!p) return;
  const row = e.currentTarget.closest(".project-row");
  row?.classList.add("menu-open");
  const canDelete = (STATE?.projects || []).length > 1;

  const menu = document.getElementById("ctxMenu");
  menu.innerHTML =
    '<button class="popover-item" onclick="closeCtxMenu();newSession(\\'' + esc(projectId) + '\\')"><span>New Chat</span></button>' +
    '<button class="popover-item" onclick="closeCtxMenu();renameProjectUi(\\'' + esc(projectId) + '\\')"><span>Rename Project</span></button>' +
    '<button class="popover-item" onclick="closeCtxMenu();openProjectModal(\\'' + esc(projectId) + '\\')"><span>Change Folder</span></button>' +
    '<div class="ctx-sep"></div>' +
    '<button class="popover-item danger" onclick="closeCtxMenu();clearProjectChatsUi(\\'' + esc(projectId) + '\\')"><span>Clear All Chats</span></button>' +
    (canDelete ? '<button class="popover-item danger" onclick="closeCtxMenu();deleteProjectUi(\\'' + esc(projectId) + '\\')"><span>Remove Project</span></button>' : '');
  positionCtxMenu(e.currentTarget);
}

async function renameSessionUi(sessionId) {
  const s = (STATE?.sessions || []).find(x => x.id === sessionId);
  const next = window.prompt("Rename chat", s?.name || "");
  if (!next || !next.trim()) return;
  try {
    await api("/api/session/" + encodeURIComponent(sessionId), { method: "PATCH", body: { name: next.trim() } });
    toast("Renamed chat.");
    await refreshState();
  } catch (err) { toast("Rename error: " + err.message); }
}

async function togglePinSession(sessionId, pinned) {
  try {
    await api("/api/session/" + encodeURIComponent(sessionId), { method: "PATCH", body: { pinned } });
    toast(pinned ? "Pinned chat." : "Unpinned chat.");
    await refreshState();
  } catch (err) { toast("Pin error: " + err.message); }
}

async function deleteSessionUi(sessionId) {
  try {
    await api("/api/session/" + encodeURIComponent(sessionId), { method: "DELETE" });
    toast("Deleted chat.");
    await refreshState();
  } catch (err) { toast("Delete error: " + err.message); }
}

async function renameProjectUi(projectId) {
  const p = (STATE?.projects || []).find(x => x.id === projectId);
  const next = window.prompt("Rename project", p?.name || "");
  if (!next || !next.trim()) return;
  try {
    await api("/api/projects/" + encodeURIComponent(projectId), { method: "PATCH", body: { name: next.trim() } });
    toast("Renamed project.");
    await refreshState();
  } catch (err) { toast("Project error: " + err.message); }
}

async function clearProjectChatsUi(projectId) {
  const p = (STATE?.projects || []).find(x => x.id === projectId);
  if (!p) return;
  if (!window.confirm("Clear all chats in project \\"" + p.name + "\\"?")) return;
  try {
    const res = await api("/api/projects/" + encodeURIComponent(projectId) + "/clear-chats", { method: "POST", body: {} });
    toast("Cleared " + (res.deletedCount || 0) + " chats in " + p.name + ".");
    await refreshState();
  } catch (err) { toast("Clear error: " + err.message); }
}

async function deleteProjectUi(projectId) {
  const p = (STATE?.projects || []).find(x => x.id === projectId);
  if (!p) return;
  if (!window.confirm("Remove project \\"" + p.name + "\\" and its chats?")) return;
  try {
    await api("/api/projects/" + encodeURIComponent(projectId), { method: "DELETE" });
    toast("Removed project " + p.name + ".");
    await refreshState();
  } catch (err) { toast("Delete error: " + err.message); }
}

/* ========================================================================
   Project Folder Browser Modal
   ======================================================================== */
async function openProjectModal(editProjectId = null) {
  EDITING_PROJECT_ID = editProjectId || null;
  const proj = EDITING_PROJECT_ID ? (STATE?.projects || []).find(p => p.id === EDITING_PROJECT_ID) : null;
  document.getElementById("projModalTitle").textContent = proj ? "Edit Project Folder" : "New Project";
  document.getElementById("projSaveBtn").textContent = proj ? "Save Project" : "Create Project";
  document.getElementById("projNameInput").value = proj ? proj.name : "";
  const startPath = proj ? proj.folder : (STATE?.session?.workspace || "");
  document.getElementById("projFolderInput").value = startPath;

  const dlg = document.getElementById("projectModalDlg");
  if (!dlg.open) dlg.showModal();
  await browseProjectFolder(startPath);
}

async function browseProjectFolder(targetPath) {
  const listEl = document.getElementById("projDirList");
  const folderInp = document.getElementById("projFolderInput");
  try {
    const q = targetPath ? ("?path=" + encodeURIComponent(targetPath)) : "";
    const data = await api("/api/fs/browse" + q);
    PROJ_BROWSE_HOME = data.home || "";
    PROJ_BROWSE_WS = data.workspace || "";
    PROJ_BROWSE_PARENT = data.parent || "";
    folderInp.value = data.current;
    document.getElementById("projParentBtn").disabled = !data.parent;

    const folderIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    if (!data.entries.length) {
      listEl.innerHTML = '<div style="padding:12px; font-size:12px; color:var(--text-muted);">No subdirectories in this folder.</div>';
    } else {
      listEl.innerHTML = data.entries.map(ent =>
        '<button type="button" class="dir-item" data-path="' + esc(ent.path) + '" onclick="browseProjectFolder(this.dataset.path)">' +
          folderIco +
          '<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(ent.name) + '</span>' +
        '</button>'
      ).join("");
    }
  } catch (err) {
    listEl.innerHTML = '<div style="padding:12px; font-size:12px; color:var(--danger);">' + esc(err.message) + '</div>';
  }
}

async function pickNativeFolderUi() {
  const btn = document.getElementById("projNativePickBtn");
  const inp = document.getElementById("projFolderInput");
  if (btn) { btn.disabled = true; btn.textContent = "Opening…"; }
  try {
    const res = await api("/api/fs/pick-folder", {
      method: "POST",
      body: { initialPath: inp?.value?.trim() || "" },
    });
    if (res.path) {
      if (inp) inp.value = res.path;
      toast("Selected folder: " + res.path);
      await browseProjectFolder(res.path);
    }
  } catch (err) {
    toast("Folder picker error: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Open Folder…"; }
  }
}

async function submitProjectModal() {
  const name = document.getElementById("projNameInput").value.trim();
  const folder = document.getElementById("projFolderInput").value.trim();
  if (!folder) return toast("Select a project folder.");
  try {
    if (EDITING_PROJECT_ID) {
      await api("/api/projects/" + encodeURIComponent(EDITING_PROJECT_ID), {
        method: "PATCH",
        body: { name: name || undefined, folder },
      });
      toast("Updated project.");
    } else {
      await api("/api/projects", {
        method: "POST",
        body: { name: name || undefined, folder },
      });
      switchTab("console");
      toast("Created project.");
    }
    document.getElementById("projectModalDlg").close();
    await refreshState();
  } catch (err) { toast("Project error: " + err.message); }
}

/* ========================================================================
   Settings Panel Modal
   ======================================================================== */
const SETTINGS_META = {
  general: { title: "General", sub: "Configure chat input, default agent, and streaming behavior." },
  appearance: { title: "Appearance", sub: "Customize theme and workspace layout." },
  models: { title: "Models", sub: "Choose default model routing and manage connected providers." },
  permissions: { title: "Permissions", sub: "Configure Rules of Engagement and scope enforcement." },
  shortcuts: { title: "Shortcuts", sub: "Keyboard shortcuts for fast navigation." },
  session: { title: "Session", sub: "Inspect daemon sync, active project folder, and token usage." },
};

function switchSettingsSection(sec) {
  document.querySelectorAll(".settings-nav-btn").forEach(b => b.classList.toggle("active", b.dataset.sec === sec));
  document.querySelectorAll(".settings-section").forEach(s => s.classList.toggle("active", s.id === "set-sec-" + sec));
  const meta = SETTINGS_META[sec] || SETTINGS_META.general;
  document.getElementById("settingsSecTitle").textContent = meta.title;
  document.getElementById("settingsSecSub").textContent = meta.sub;
}

function openSettingsModal(sec = "general") {
  renderSettingsPanel();
  switchSettingsSection(sec);
  const dlg = document.getElementById("settingsDlg");
  if (!dlg.open) dlg.showModal();
}

function setSendKeyPref(mode) {
  SEND_KEY_PREF = mode === "ctrl-enter" ? "ctrl-enter" : "enter";
  try { localStorage.setItem("yedogu.sendKey", SEND_KEY_PREF); } catch {}
  renderSettingsPanel();
}

function setAutoScrollPref(enabled) {
  AUTO_SCROLL_PREF = Boolean(enabled);
  try { localStorage.setItem("yedogu.autoScroll", AUTO_SCROLL_PREF ? "1" : "0"); } catch {}
}

function setSidebarCollapsedPref(collapsed) {
  const shell = document.getElementById("appShell");
  if (!shell) return;
  shell.classList.toggle("sidebar-collapsed", Boolean(collapsed));
  try { localStorage.setItem("yedogu.sidebarCollapsed", collapsed ? "1" : "0"); } catch {}
}

async function setDefaultModelFromSettings(model) {
  if (!model) return;
  try {
    await api("/api/model", { method: "POST", body: { model } });
    toast("Model set to " + model);
    refreshState();
  } catch (err) { toast("Error: " + err.message); }
}

function renderSettingsPanel() {
  document.getElementById("sendKeyEnterBtn")?.classList.toggle("active", SEND_KEY_PREF === "enter");
  document.getElementById("sendKeyCtrlBtn")?.classList.toggle("active", SEND_KEY_PREF === "ctrl-enter");
  const autoScrollEl = document.getElementById("settingsAutoScroll");
  if (autoScrollEl) autoScrollEl.checked = AUTO_SCROLL_PREF;

  const sbEl = document.getElementById("settingsSidebarCollapsed");
  if (sbEl) sbEl.checked = document.getElementById("appShell")?.classList.contains("sidebar-collapsed") || false;

  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.title = SEND_KEY_PREF === "ctrl-enter" ? "Send (Ctrl+Enter)" : "Send (Enter)";

  if (!STATE) return;
  const s = STATE.session;
  const agSel = document.getElementById("settingsDefaultAgent");
  if (agSel) {
    agSel.innerHTML = STATE.agents.map(a =>
      '<option value="' + esc(a.id) + '"' + (s.activeAgent === a.id ? " selected" : "") + '>@' + esc(a.id) + ' — ' + esc(a.title) + '</option>'
    ).join("");
  }

  const mSel = document.getElementById("settingsModelSelect");
  const specs = allModelSpecs();
  if (mSel) {
    mSel.innerHTML = buildGroupedModelOptionsHtml(specs, s.activeModel);
  }
  const activeEffort = STATE.reasoningEffort || s.reasoningEffort || "medium";
  document.querySelectorAll("#settingsReasoningSeg .seg-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.effort === activeEffort);
  });

  const connected = (STATE.providers || []).filter(p => p.connected).length;
  const prvSub = document.getElementById("settingsProvidersSub");
  if (prvSub) prvSub.textContent = connected + " of " + (STATE.providers || []).length + " providers connected.";

  const isEnf = s.scope.mode === "enforced";
  document.getElementById("setScopeAdvBtn")?.classList.toggle("active", !isEnf);
  document.getElementById("setScopeEnfBtn")?.classList.toggle("active", isEnf);
  const rulesSub = document.getElementById("settingsScopeRulesSub");
  if (rulesSub) rulesSub.textContent = (s.scope.allow || []).length + " allow · " + (s.scope.deny || []).length + " deny rules";

  const sidEl = document.getElementById("settingsSessionId");
  if (sidEl) sidEl.textContent = s.id;
  const wsEl = document.getElementById("settingsWorkspacePath");
  if (wsEl) wsEl.textContent = s.workspace || "—";
  const tokEl = document.getElementById("settingsTokensSub");
  if (tokEl) tokEl.textContent = fmtCompactNum((s.totalInputTokens || 0) + (s.totalOutputTokens || 0)) + " tokens (" + s.messages.length + " messages)";
}

/* ========================================================================
   Agents, Chat, Swarm
   ======================================================================== */
function renderAgents() {
  const s = STATE.session;
  const agSel = document.getElementById("composerAgentSelect");
  const agDot = document.getElementById("composerAgentDot");
  if (agSel) {
    agSel.innerHTML = STATE.agents.map(a =>
      '<option value="' + esc(a.id) + '"' + (s.activeAgent === a.id ? " selected" : "") + '>@' + esc(a.id) + '</option>'
    ).join("");
  }
  if (agDot) {
    const activeObj = STATE.agents.find(a => a.id === s.activeAgent);
    agDot.style.background = activeObj?.color || "var(--text-secondary)";
  }

  const checks = document.getElementById("swarmAgentChecks");
  if (checks && !checks.dataset.init) {
    checks.dataset.init = "1";
    checks.innerHTML = STATE.agents.filter(a => a.id !== "commander").map(a =>
      '<label class="check-pill">' +
        '<input type="checkbox" value="' + esc(a.id) + '" ' + (["recon","web-hunter","reverser"].includes(a.id) ? "checked" : "") + ' />' +
        '<span>@' + esc(a.id) + '</span>' +
      '</label>'
    ).join("");
  }
}

function usePlaybookPrompt(text) {
  const inp = document.getElementById("chatInput");
  inp.value = text;
  autoGrowComposer();
  updateSendBtnState();
  inp.focus();
}

function isNearBottom(el) {
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < 120;
}

function scrollChatToBottom() {
  const scroller = document.getElementById("chatScroll");
  if (!scroller) return;
  scroller.scrollTop = scroller.scrollHeight;
  updateScrollBottomBtn();
}

function updateScrollBottomBtn() {
  const scroller = document.getElementById("chatScroll");
  const btn = document.getElementById("scrollBottomBtn");
  if (!scroller || !btn) return;
  const show = (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) > 160;
  btn.classList.toggle("visible", show);
}

function copyMessageText(id) {
  const txt = (window.__MSG_TEXTS || {})[id] || "";
  if (txt) copyTextSnippet(txt, "response");
}

function renderChat() {
  const box = document.getElementById("chatMessages");
  const scroller = document.getElementById("chatScroll");
  const shouldScroll = AUTO_SCROLL_PREF && (!box.children.length || isNearBottom(scroller));
  const msgs = STATE.session.messages.filter(m => m.role !== "tool");
  window.__MSG_TEXTS = {};

  if (msgs.length === 0) {
    const proj = activeProjectObj();
    box.innerHTML =
      '<div class="empty-hero">' +
        '<div class="empty-mark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 20 2 20 12 2"/></svg></div>' +
        '<h1>What are we auditing?</h1>' +
        '<p>Working in <code>' + esc(proj?.name || "workspace") + '</code>. Dispatch a specialist agent or pick a starting prompt.</p>' +
        '<div class="starter-grid">' +
          '<button class="starter-card" onclick="usePlaybookPrompt(\\'@recon Scan the current workspace JS bundles for hidden API routes, GraphQL operations, and leaked secrets.\\')">' +
            '<div class="starter-title"><span>JS Bundle &amp; Secret Audit</span><span class="starter-agent">@recon</span></div>' +
            '<div class="starter-desc">Extract hidden API routes, GraphQL ops, and secrets.</div>' +
          '</button>' +
          '<button class="starter-card" onclick="usePlaybookPrompt(\\'@web-hunter Build a focused IDOR, auth-bypass, and CORS test plan for the authorized scope targets.\\')">' +
            '<div class="starter-title"><span>API Auth &amp; IDOR Plan</span><span class="starter-agent">@web-hunter</span></div>' +
            '<div class="starter-desc">Map broken object-level authz and CORS bypass paths.</div>' +
          '</button>' +
          '<button class="starter-card" onclick="usePlaybookPrompt(\\'@reverser Triage binary artifacts and enumerate exploit mitigations, high-entropy sections, and native surfaces.\\')">' +
            '<div class="starter-title"><span>Native Binary Triage</span><span class="starter-agent">@reverser</span></div>' +
            '<div class="starter-desc">Inspect PE, ELF, Mach-O, APK, or ASAR mitigations.</div>' +
          '</button>' +
          '<button class="starter-card" onclick="usePlaybookPrompt(\\'@triage-report Validate all draft findings against the 7-Question Gate and calculate CVSS 3.1 vectors.\\')">' +
            '<div class="starter-title"><span>Validate &amp; Score Findings</span><span class="starter-agent">@triage-report</span></div>' +
            '<div class="starter-desc">Apply the 7-Question Gate and score CVSS 3.1 vectors.</div>' +
          '</button>' +
        '</div>' +
      '</div>';
    updateScrollBottomBtn();
    return;
  }

  const agentColor = (id) => (STATE.agents.find(a => a.id === id)?.color) || "var(--text-secondary)";
  const chevSvg = '<svg class="disclosure-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

  box.innerHTML = msgs.map(m => {
    if (m.role === "user") {
      const sender = m.source ? (m.source.platform + " · " + m.source.senderName) : "";
      const attsHtml = (m.attachments && m.attachments.length)
        ? '<div class="msg-attachments">' + m.attachments.map(a =>
            '<span class="msg-att-pill" title="' + esc(a.savedPath || a.name) + '">📎 ' + esc(a.name) + ' <span style="color:var(--text-muted);">' + fmtCompactNum(a.size) + 'B</span></span>'
          ).join("") + '</div>'
        : "";
      return '<div class="msg-row user" id="msg-' + esc(m.id) + '">' +
        '<div class="msg-user-bubble">' + esc(m.content || "") + '</div>' +
        attsHtml +
        (sender ? '<div class="msg-user-meta">' + esc(sender) + '</div>' : '') +
      '</div>';
    }

    window.__MSG_TEXTS[m.id] = m.content || "";

    const toolsList = m.toolCalls || [];
    const toolsHtml = toolsList.length
      ? '<div class="activity-stack">' + toolsList.map(tc => {
          const tone = tc.status === "error" ? "danger" : tc.status === "running" ? "warn" : "success";
          const argPreview = esc(JSON.stringify(tc.arguments || {}).slice(0, 84));
          return '<details class="disclosure compact-activity">' +
            '<summary>' +
              chevSvg +
              '<span class="tool-status-dot ' + tone + '"></span>' +
              '<span class="disclosure-mono"><strong>' + esc(tc.name) + '</strong> <span style="color:var(--text-muted);">' + argPreview + '</span></span>' +
              (tc.durationMs ? '<span class="disclosure-dur">' + tc.durationMs + 'ms</span>' : '') +
            '</summary>' +
            '<div class="disclosure-body">' + esc((tc.output || "No output captured.").slice(0, 3500)) + '</div>' +
          '</details>';
        }).join("") + '</div>'
      : "";

    const reasoningHtml = m.reasoning
      ? '<details class="disclosure compact-activity" style="margin:2px 0 8px;">' +
          '<summary>' +
            chevSvg +
            '<span style="color:var(--text-muted);">Reasoning</span>' +
            '<span class="disclosure-dur" style="margin-left:auto;">' + m.reasoning.length + ' chars</span>' +
          '</summary>' +
          '<div class="disclosure-body">' + esc(m.reasoning) + '</div>' +
        '</details>'
      : "";

    return '<div class="msg-row msg-assistant" id="msg-' + esc(m.id) + '">' +
      '<div class="msg-assistant-head">' +
        '<span class="agent-dot" style="background:' + esc(agentColor(m.agentId)) + ';"></span>' +
        '<span class="msg-agent-name">@' + esc(m.agentId || "agent") + '</span>' +
        (m.model ? '<span class="msg-model-name" title="' + esc(m.model) + '">' + esc(formatModelBadge(m.model)) + '</span>' : '') +
        '<span class="msg-head-right">' +
          '<button class="msg-copy-btn" onclick="copyMessageText(\\'' + esc(m.id) + '\\')">Copy</button>' +
          '<span class="msg-time">' + esc((m.timestamp || "").slice(11, 19)) + '</span>' +
        '</span>' +
      '</div>' +
      reasoningHtml +
      renderRichMarkdown(m.content || "") +
      toolsHtml +
    '</div>';
  }).join("");

  if (shouldScroll) scroller.scrollTop = scroller.scrollHeight;
  updateScrollBottomBtn();
}

function renderSwarm() {
  const workers = STATE.session.swarmWorkers || [];
  document.getElementById("swarmWorkerCount").textContent = String(workers.length);

  const tl = document.getElementById("swarmTimelineBox");
  if (workers.length === 0) {
    tl.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">No workers dispatched yet.</div>';
  } else {
    tl.innerHTML = '<div class="timeline-list">' + workers.map(w => {
      const tone = w.status === "completed" ? "success" : w.status === "failed" ? "danger" : "warn";
      return '<div class="timeline-item">' +
        '<div class="timeline-head">' +
          '<strong style="font-family:var(--mono); font-size:11.5px;">@' + esc(w.agentId) + '</strong>' +
          '<span class="pill ' + tone + '">' + esc(w.status) + '</span>' +
        '</div>' +
        '<div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">' + esc((w.objective || "").slice(0, 100)) + '</div>' +
        '<div style="font-family:var(--mono); font-size:10.5px; color:var(--text-muted);">' + esc(w.model) + ' · ' + w.toolCallsCount + ' tools · +' + w.findingsAdded + ' findings</div>' +
      '</div>';
    }).join("") + '</div>';
  }

  const s = STATE.session;
  const totalTok = (s.totalInputTokens || 0) + (s.totalOutputTokens || 0);
  const pct = Math.min(100, Math.round((totalTok / 200000) * 100));
  const fillCls = pct > 80 ? "danger" : pct > 55 ? "warn" : "";
  document.getElementById("contextMeterBox").innerHTML =
    '<div style="margin-bottom:10px;">' +
      '<div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-secondary); margin-bottom:5px;"><span>Context</span><span style="font-family:var(--mono);">' + fmtCompactNum(totalTok) + ' (' + pct + '%)</span></div>' +
      '<div class="progress-track"><div class="progress-fill ' + fillCls + '" style="width:' + Math.max(2, pct) + '%"></div></div>' +
    '</div>' +
    '<div class="kv-list">' +
      '<div class="kv-row"><span class="kv-k">Messages</span><span class="kv-v">' + s.messages.length + '</span></div>' +
      '<div class="kv-row"><span class="kv-k">HTTP Captures</span><span class="kv-v">' + (s.httpHistory || []).length + '</span></div>' +
      '<div class="kv-row"><span class="kv-k">Binaries</span><span class="kv-v">' + (s.artifacts || []).length + '</span></div>' +
      '<div class="kv-row"><span class="kv-k">Findings</span><span class="kv-v">' + (s.findings || []).length + '</span></div>' +
    '</div>';
}

/* ========================================================================
   Tab 2: HTTP Forge
   ======================================================================== */
function presetHttpHeader(kind) {
  let obj = {};
  try { obj = JSON.parse(document.getElementById("httpHeaders").value || "{}"); } catch {}
  if (kind === "cors") obj["Origin"] = "https://evil.example";
  if (kind === "xff") { obj["X-Forwarded-For"] = "127.0.0.1"; obj["X-Original-URL"] = "/admin"; }
  if (kind === "json") { obj["Content-Type"] = "application/json"; obj["Accept"] = "application/json"; }
  document.getElementById("httpHeaders").value = JSON.stringify(obj, null, 2);
}

function renderHttp() {
  const list = STATE.session.httpHistory || [];
  if (!ACTIVE_HTTP && list.length > 0) ACTIVE_HTTP = list[0];
  document.getElementById("httpHistoryCount").textContent = list.length + (list.length === 1 ? " request" : " requests");

  const hist = document.getElementById("httpHistoryList");
  if (list.length === 0) {
    hist.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">No requests captured yet.</div>';
  } else {
    hist.innerHTML = list.map(h => {
      const isSel = ACTIVE_HTTP && ACTIVE_HTTP.id === h.id;
      const stCls = !h.scopeAllowed || h.status >= 500 ? "danger" : h.status >= 400 ? "warn" : "success";
      return '<div class="history-row' + (isSel ? " active" : "") + '" onclick="inspectHttp(\\'' + esc(h.id) + '\\')">' +
        '<span class="method-tag method-' + esc(h.method) + '">' + esc(h.method) + '</span>' +
        '<span class="history-url" title="' + esc(h.url) + '">' + esc(h.url) + '</span>' +
        '<span class="pill ' + stCls + '">' + (h.scopeAllowed ? h.status : "Blocked") + ' · ' + h.durationMs + 'ms</span>' +
      '</div>';
    }).join("");
  }

  renderHttpInspector();
}

function setHttpViewMode(mode) {
  HTTP_VIEW_MODE = mode;
  renderHttpInspector();
}

function renderHttpInspector() {
  const host = document.getElementById("httpInspectorFrame");
  const item = ACTIVE_HTTP;
  if (!item) {
    host.innerHTML = '<div class="card" style="flex:1; display:grid; place-items:center; text-align:center; color:var(--text-muted); font-size:12.5px;">Send a request or select one from history to inspect headers, body, and security posture.</div>';
    return;
  }

  const present = item.securityHeaders?.present || [];
  const missing = item.securityHeaders?.missing || [];
  const hdrText = Object.entries(item.responseHeaders || {}).map(([k, v]) => k + ": " + v).join("\\n");
  const bodyText = item.responseBody || "";
  const shownText = HTTP_VIEW_MODE === "headers"
    ? hdrText
    : HTTP_VIEW_MODE === "raw"
      ? ("HTTP " + item.status + " " + (item.statusText || "") + "\\n" + hdrText + "\\n\\n" + bodyText)
      : bodyText;

  const stCls = !item.scopeAllowed || item.status >= 500 ? "danger" : item.status >= 400 ? "warn" : "success";

  host.innerHTML =
    '<div class="card" style="flex:1; display:flex; flex-direction:column; gap:12px; min-height:0;">' +
      '<div class="card-head" style="margin-bottom:0;">' +
        '<div style="display:flex; align-items:center; gap:8px; min-width:0;">' +
          '<span class="method-tag method-' + esc(item.method) + '">' + esc(item.method) + '</span>' +
          '<span class="history-url">' + esc(item.url) + '</span>' +
        '</div>' +
        '<button class="btn btn-sm" onclick="escalateHttpToWebHunter()">Ask @web-hunter</button>' +
      '</div>' +
      '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
        '<span class="pill ' + stCls + '">' + (item.scopeAllowed ? (item.status + " " + (item.statusText || "")) : "Scope Blocked") + '</span>' +
        '<span class="pill">' + item.durationMs + ' ms</span>' +
        '<span class="pill" style="font-family:var(--mono);" title="' + esc(item.bodySha256 || "") + '">sha256: ' + esc((item.bodySha256 || "—").slice(0, 12)) + '</span>' +
      '</div>' +
      (present.length || missing.length
        ? '<div style="display:flex; gap:5px; flex-wrap:wrap;">' +
            present.map(h => '<span class="pill success">✓ ' + esc(h) + '</span>').join("") +
            missing.map(h => '<span class="pill danger">× ' + esc(h) + '</span>').join("") +
          '</div>'
        : '') +
      '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">' +
        '<div class="segmented">' +
          '<button class="seg-btn ' + (HTTP_VIEW_MODE === "body" ? "active" : "") + '" onclick="setHttpViewMode(\\'body\\')">Body</button>' +
          '<button class="seg-btn ' + (HTTP_VIEW_MODE === "headers" ? "active" : "") + '" onclick="setHttpViewMode(\\'headers\\')">Headers</button>' +
          '<button class="seg-btn ' + (HTTP_VIEW_MODE === "raw" ? "active" : "") + '" onclick="setHttpViewMode(\\'raw\\')">Raw</button>' +
        '</div>' +
        '<button class="btn btn-sm" onclick="copyActiveHttp()">Copy</button>' +
      '</div>' +
      '<pre id="httpResponseView" class="code-viewer">' + esc(shownText) + '</pre>' +
    '</div>';
}

function copyActiveHttp() {
  const el = document.getElementById("httpResponseView");
  if (el) copyTextSnippet(el.textContent || "", "HTTP response");
}

function inspectHttp(id) {
  const item = (STATE.session.httpHistory || []).find(h => h.id === id);
  if (!item) return;
  ACTIVE_HTTP = item;
  document.getElementById("httpMethod").value = item.method;
  document.getElementById("httpUrl").value = item.url;
  document.getElementById("httpHeaders").value = JSON.stringify(item.requestHeaders || {}, null, 2);
  document.getElementById("httpBody").value = item.requestBody || "";
  renderHttp();
}

/* ========================================================================
   Tab 3: RE & JS Recon
   ======================================================================== */
function renderArtifacts() {
  const list = STATE.session.artifacts || [];
  const el = document.getElementById("binaryArtifactsList");
  if (list.length === 0) {
    el.innerHTML = '<div class="card" style="color:var(--text-muted); font-size:12.5px;">No binaries triaged yet. Provide a local path above to inspect headers, mitigations, and section entropy.</div>';
    return;
  }

  el.innerHTML = list.map(a => {
    const mitHtml = Object.entries(a.mitigations || {}).map(([k, v]) =>
      '<span class="pill ' + (v ? "success" : "danger") + '">' + esc(k) + ': ' + (v ? "ON" : "OFF") + '</span>'
    ).join("");

    const secsHtml = (a.sections || []).length
      ? '<table class="data-table" style="margin-top:10px;"><thead><tr><th>Section</th><th>VAddr</th><th>Size</th><th>Perm</th><th>Entropy</th></tr></thead><tbody>' +
        a.sections.map(sec => {
          const pct = Math.min(100, Math.round((sec.entropy / 8) * 100));
          const tone = sec.entropy > 7.1 ? "danger" : sec.entropy > 6.2 ? "warn" : "";
          return '<tr><td style="font-family:var(--mono); font-weight:500;">' + esc(sec.name) + '</td><td style="font-family:var(--mono); color:var(--text-muted);">' + esc(sec.virtualAddress || "-") + '</td><td style="font-family:var(--mono);">' + sec.size.toLocaleString() + '</td><td style="font-family:var(--mono);">' + esc(sec.flags || "-") + '</td>' +
            '<td style="min-width:110px;"><div style="display:flex; align-items:center; gap:8px;"><span style="font-family:var(--mono); font-size:11px; width:32px;">' + Number(sec.entropy).toFixed(2) + '</span><div class="progress-track"><div class="progress-fill ' + tone + '" style="width:' + pct + '%"></div></div></div></td></tr>';
        }).join("") + '</tbody></table>'
      : "";

    return '<div class="card">' +
      '<div class="card-head">' +
        '<div><div class="card-title">' + esc(a.format + " · " + a.architecture) + '</div><div class="card-sub" style="font-family:var(--mono);">' + esc(a.path) + '</div></div>' +
        '<button class="btn btn-sm" onclick="escalateBinaryToReverser(\\'' + esc(a.path).replace(/\\\\/g, "\\\\\\\\") + '\\')">Analyze with @reverser</button>' +
      '</div>' +
      '<div class="kv-list" style="margin-bottom:10px;">' +
        '<div class="kv-row"><span class="kv-k">SHA-256</span><span class="kv-v">' + esc(a.sha256 || "—") + '</span></div>' +
        '<div class="kv-row"><span class="kv-k">Size / Entropy</span><span class="kv-v">' + a.sizeBytes.toLocaleString() + ' B · H=' + a.entropy + '</span></div>' +
      '</div>' +
      (mitHtml ? '<div style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:10px;">' + mitHtml + '</div>' : '') +
      (a.highlights?.length ? '<div class="callout callout-warn"><div class="callout-title">Highlights</div><div>' + a.highlights.map(esc).join("<br/>") + '</div></div>' : '') +
      secsHtml +
    '</div>';
  }).join("");
}

function renderJsReconEmpty() {
  const el = document.getElementById("jsReconOutput");
  if (el && !el.dataset.hasData) {
    el.innerHTML = '<div class="card" style="color:var(--text-muted); font-size:12.5px;">Run a scan to enumerate API endpoints, dangerous DOM/Node sinks, and hardcoded secrets.</div>';
  }
}

/* ========================================================================
   Tab 4: Findings & Report Studio
   ======================================================================== */
function setFindingFilter(st) {
  FINDING_FILTER = st;
  renderFindings();
}

function renderFindings() {
  const all = STATE.session.findings || [];
  const counts = {
    critical: all.filter(f => f.severity === "critical").length,
    high: all.filter(f => f.severity === "high").length,
    medium: all.filter(f => f.severity === "medium").length,
    low: all.filter(f => f.severity === "low").length,
    info: all.filter(f => f.severity === "info").length,
  };
  const total = all.length;

  const barHtml = total > 0
    ? ["critical","high","medium","low","info"].filter(k => counts[k] > 0).map(k =>
        '<div class="sev-seg-' + k + '" style="width:' + Math.max(4, (counts[k] / total) * 100) + '%" title="' + k + ': ' + counts[k] + '"></div>'
      ).join("")
    : "";

  const filters = ["all","draft","validated","triaged","reported","rejected"];
  const filterBar = '<div style="display:flex; gap:5px; flex-wrap:wrap; margin-top:10px;">' +
    filters.map(st => {
      const cnt = st === "all" ? all.length : all.filter(f => f.status === st).length;
      return '<button class="btn btn-sm ' + (FINDING_FILTER === st ? "btn-primary" : "btn-ghost") + '" onclick="setFindingFilter(\\'' + st + '\\')">' +
        st.charAt(0).toUpperCase() + st.slice(1) + ' <span style="opacity:0.65;">' + cnt + '</span></button>';
    }).join("") + '</div>';

  document.getElementById("findingsOverviewBox").innerHTML =
    '<div class="card">' +
      '<div class="card-head" style="margin-bottom:8px;"><div class="card-title">Evidence Ledger</div><span class="nav-count">' + total + ' total</span></div>' +
      '<div class="sev-bar">' + barHtml + '</div>' +
      '<div style="display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:var(--text-secondary);">' +
        '<span>Critical <strong>' + counts.critical + '</strong></span>' +
        '<span>High <strong>' + counts.high + '</strong></span>' +
        '<span>Medium <strong>' + counts.medium + '</strong></span>' +
        '<span>Low <strong>' + counts.low + '</strong></span>' +
        '<span>Info <strong>' + counts.info + '</strong></span>' +
      '</div>' +
      filterBar +
    '</div>';

  const list = FINDING_FILTER === "all" ? all : all.filter(f => f.status === FINDING_FILTER);
  const el = document.getElementById("findingsList");
  if (list.length === 0) {
    el.innerHTML = '<div class="card" style="color:var(--text-muted); font-size:12.5px;">No findings match this filter.</div>';
    return;
  }

  el.innerHTML = list.map(f => {
    const sevCls = f.severity === "critical" || f.severity === "high" ? "danger" : f.severity === "medium" ? "warn" : f.severity === "low" ? "info" : "";
    const statusSel = '<select class="select" style="width:auto; padding:3px 8px; font-size:11.5px;" onchange="updateFindingStatusUi(\\'' + esc(f.id) + '\\', this.value)">' +
      ["draft","validated","triaged","reported","rejected"].map(st => '<option value="' + st + '"' + (f.status === st ? " selected" : "") + '>' + st.charAt(0).toUpperCase() + st.slice(1) + '</option>').join("") + '</select>';

    return '<div class="card">' +
      '<div class="card-head" style="margin-bottom:7px;">' +
        '<div style="display:flex; align-items:center; gap:7px;">' +
          '<span class="pill ' + sevCls + '">' + esc(f.severity.toUpperCase()) + '</span>' +
          (f.cvssScore !== undefined ? '<span class="pill" style="font-family:var(--mono);">' + Number(f.cvssScore).toFixed(1) + '</span>' : '') +
          '<span style="font-family:var(--mono); font-size:11px; color:var(--text-muted);">' + esc(f.id) + '</span>' +
        '</div>' +
        statusSel +
      '</div>' +
      '<div style="font-size:13.5px; font-weight:600; color:var(--text); margin-bottom:3px;">' + esc(f.title) + '</div>' +
      '<div style="font-family:var(--mono); font-size:11.5px; color:var(--text-muted); margin-bottom:8px;">' + esc(f.target) + '</div>' +
      '<div style="font-size:12.5px; color:var(--text-secondary); line-height:1.55; margin-bottom:8px;">' + esc(f.summary) + '</div>' +
      (f.impact ? '<div class="callout callout-warn"><div class="callout-title">Impact</div><div>' + esc(f.impact) + '</div></div>' : '') +
    '</div>';
  }).join("");
}

let __cvssTimer = null;
function previewCvssUi(vector) {
  clearTimeout(__cvssTimer);
  const v = (vector || "").trim();
  const badge = document.getElementById("liveCvssBadge");
  const viz = document.getElementById("liveCvssScoreViz");
  if (!v) {
    badge.textContent = "CVSS —";
    badge.className = "pill";
    viz.textContent = "";
    return;
  }
  __cvssTimer = setTimeout(async () => {
    try {
      const { result } = await api("/api/cvss", { method: "POST", body: { vector: v } });
      if (result) {
        badge.textContent = "CVSS " + result.score.toFixed(1) + " " + result.severity.toUpperCase();
        badge.className = "pill " + (result.severity === "critical" || result.severity === "high" ? "danger" : result.severity === "medium" ? "warn" : "info");
        viz.textContent = result.score.toFixed(1) + " / 10";
        document.getElementById("fSeverity").value = result.severity;
      } else {
        badge.textContent = "Invalid vector";
        badge.className = "pill danger";
        viz.textContent = "";
      }
    } catch {}
  }, 180);
}

function applyCvssPreset(vec) {
  const inp = document.getElementById("fCvss");
  inp.value = vec;
  previewCvssUi(vec);
}

function toggleReportMode() {
  REPORT_RENDERED_MODE = !REPORT_RENDERED_MODE;
  document.getElementById("rptModeBtn").textContent = REPORT_RENDERED_MODE ? "Raw" : "Preview";
  document.getElementById("reportPreview").style.display = REPORT_RENDERED_MODE ? "none" : "block";
  document.getElementById("reportRendered").style.display = REPORT_RENDERED_MODE ? "block" : "none";
  if (REPORT_RENDERED_MODE && LAST_REPORT_MD) {
    document.getElementById("reportRendered").innerHTML = renderRichMarkdown(LAST_REPORT_MD);
  }
}

function copyReportMd() {
  if (!LAST_REPORT_MD) return toast("Generate a report first.");
  copyTextSnippet(LAST_REPORT_MD, LAST_REPORT_FMT + " report");
}

/* ========================================================================
   Tab 5: Providers, Routing, Scope & MCP
   ======================================================================== */
function buildGroupedModelOptionsHtml(specs, selectedSpec, includeDefaultLabel) {
  let html = includeDefaultLabel ? '<option value="">' + esc(includeDefaultLabel) + '</option>' : "";
  const byProvider = new Map();
  for (const m of specs) {
    const pid = m.providerId || (m.spec.includes("/") ? m.spec.slice(0, m.spec.indexOf("/")) : "other");
    const pname = m.providerName || pid;
    if (!byProvider.has(pid)) byProvider.set(pid, { name: pname, items: [] });
    byProvider.get(pid).items.push(m);
  }
  for (const [, grp] of byProvider.entries()) {
    html += '<optgroup label="' + esc(grp.name) + '">';
    for (const m of grp.items) {
      html += '<option value="' + esc(m.spec) + '"' + (m.spec === selectedSpec ? " selected" : "") + '>' + esc(m.label) + '</option>';
    }
    html += '</optgroup>';
  }
  if (selectedSpec && !specs.some(m => m.spec === selectedSpec)) {
    html = '<option value="' + esc(selectedSpec) + '" selected>' + esc(formatModelBadge(selectedSpec)) + '</option>' + html;
  }
  return html;
}

function setProviderSection(sec) {
  PRV_SECTION = sec || "providers";
  document.querySelectorAll("#prvSectionSeg .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.sec === PRV_SECTION));
  document.querySelectorAll(".prv-subpanel").forEach(p => p.classList.toggle("active", p.id === "prvPanel-" + PRV_SECTION));
}

function getProviderCategory(p) {
  if (p.custom) return "custom";
  if (p.local) return "local";
  if (p.id === "openrouter" || p.id === "groq") return "gateway";
  return "cloud";
}

function setProviderFilter(filter) {
  PRV_FILTER = filter || "all";
  document.querySelectorAll("#prvFilterSeg .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === PRV_FILTER));
  renderProvidersAndScope();
}

function toggleProviderModelsExpand(pid) {
  PRV_EXPANDED[pid] = !PRV_EXPANDED[pid];
  renderProvidersAndScope();
}

function renderProvidersAndScope() {
  const allProviders = STATE.providers || [];
  const connectedProviders = allProviders.filter(p => p.connected);
  const totalModels = connectedProviders.reduce((sum, p) => sum + (p.models || []).length, 0);
  const scopeMode = STATE.session?.scope?.mode === "enforced" ? "Enforced" : "Advisory";

  document.getElementById("providerSummaryText").textContent =
    connectedProviders.length + " of " + allProviders.length + " connected · Auto-discovers environment variables, CLI auth, and local runtimes.";

  const heroStats = document.getElementById("providerHeroStats");
  if (heroStats) {
    heroStats.innerHTML =
      '<span class="pill success">' + connectedProviders.length + ' Connected</span>' +
      '<span class="pill">' + totalModels + ' Available Models</span>' +
      '<span class="pill ' + (scopeMode === "Enforced" ? "success" : "") + '">Scope: ' + scopeMode + '</span>';
  }
  const connPill = document.getElementById("prvConnectedCountPill");
  if (connPill) connPill.textContent = connectedProviders.length + " active";

  const activeModel = STATE.session?.activeModel || "";
  const connGrid = document.getElementById("providerConnectedGrid");
  if (connGrid) {
    connGrid.innerHTML = connectedProviders.map(p => {
      const models = p.models || [];
      const expanded = Boolean(PRV_EXPANDED[p.id]);
      const visibleModels = expanded ? models : models.slice(0, 6);
      const hasMore = models.length > 6;
      const statusPill = p.liveStatus === "error"
        ? '<span class="pill danger" title="' + esc(p.liveError || "Unavailable") + '">Unavailable</span>'
        : '<span class="pill success">' + esc(p.authSource || "Connected") + (models.length ? " · " + models.length : "") + '</span>';

      const chipsHtml = models.length > 0
        ? '<div class="prv-models-strip">' +
            visibleModels.map(m => {
              const spec = p.id + "/" + m.id;
              const isAct = spec === activeModel;
              return '<button type="button" class="prv-model-chip' + (isAct ? " active" : "") + '" onclick="selectModelSpec(\\'' + esc(spec) + '\\')" title="' + esc(spec) + '">' + esc(cleanModelName(m.id, m.name)) + '</button>';
            }).join("") +
            (hasMore ? '<button type="button" class="prv-model-chip" onclick="toggleProviderModelsExpand(\\'' + esc(p.id) + '\\')">' + (expanded ? "Show less" : "+" + (models.length - 6) + " more") + '</button>' : '') +
          '</div>'
        : '<div style="font-size:11.5px; color:var(--text-muted);">' + esc(p.liveError || "No available models detected for this credential.") + '</div>';

      return '<div class="card prv-card">' +
        '<div class="prv-card-head">' +
          '<div class="prv-brand">' +
            '<span class="prv-icon-badge">' + providerSvgIcon(p.id, 17) + '</span>' +
            '<div style="min-width:0;">' +
              '<div style="display:flex; align-items:center; gap:6px;">' +
                '<span class="status-dot"></span>' +
                '<span class="card-title" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(p.name) + '</span>' +
              '</div>' +
              '<div style="font-family:var(--mono); font-size:10.5px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + esc(p.baseUrl) + '">' + esc(p.protocol) + ' · ' + esc(p.baseUrl) + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">' +
            statusPill +
          '</div>' +
        '</div>' +
        chipsHtml +
        '<div style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding-top:4px; border-top:1px solid var(--border);">' +
          '<div style="display:flex; gap:5px;">' +
            '<button type="button" class="btn btn-sm" onclick="openProviderConnectModal(\\'' + esc(p.id) + '\\')">Configure</button>' +
            '<button type="button" class="btn btn-sm" onclick="refreshSingleProviderUi(\\'' + esc(p.id) + '\\', this)" title="Refresh models">↻ Sync</button>' +
          '</div>' +
          '<div style="display:flex; gap:5px;">' +
            (p.custom ? '<button type="button" class="btn btn-sm" data-provider-id="' + esc(p.id) + '" onclick="editCustomProviderUi(this.dataset.providerId)">Edit</button>' : '') +
            (p.custom
              ? '<button type="button" class="btn btn-danger btn-sm" onclick="deleteCustomProviderUi(\\'' + esc(p.id) + '\\')" title="Delete custom provider">Delete</button>'
              : '<button type="button" class="btn btn-danger btn-sm" onclick="disconnectProviderUi(\\'' + esc(p.id) + '\\', \\'' + esc(p.authSource || "") + '\\')">Disconnect</button>') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join("") || '<div class="prv-empty-state" style="grid-column:1/-1;">No providers connected yet. Choose a provider from the directory below or add a custom endpoint.</div>';
  }

  const q = PRV_SEARCH.trim().toLowerCase();
  const dirProviders = allProviders.filter(p => {
    if (PRV_FILTER !== "all" && getProviderCategory(p) !== PRV_FILTER) return false;
    if (q) {
      const mMatch = (p.models || []).some(m => (m.id + " " + m.name).toLowerCase().includes(q));
      if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q) && !mMatch) return false;
    }
    return true;
  });

  const grid = document.getElementById("providerGrid");
  grid.innerHTML = dirProviders.map(p => {
    const models = p.models || [];
    const tagline = models.slice(0, 3).map(m => cleanModelName(m.id, m.name)).join(", ") || p.protocol + " endpoint";
    const badge = p.connected
      ? '<span class="pill success">Connected</span>'
      : '<span class="pill">Connect</span>';
    return '<button type="button" class="prv-dir-tile' + (p.connected ? " connected" : "") + '" onclick="openProviderConnectModal(\\'' + esc(p.id) + '\\')">' +
      '<span class="prv-icon-badge">' + providerSvgIcon(p.id, 17) + '</span>' +
      '<div class="prv-dir-meta">' +
        '<div class="prv-dir-name">' + esc(p.name) + '</div>' +
        '<div class="prv-dir-sub">' + esc(tagline) + '</div>' +
      '</div>' +
      badge +
    '</button>';
  }).join("") || '<div class="prv-empty-state" style="grid-column:1/-1;">No providers match this filter.</div>';

  const specs = allModelSpecs();
  const rt = document.getElementById("agentRoutingTable");
  rt.innerHTML = '<thead><tr><th>Agent</th><th>Role</th><th>Model</th></tr></thead><tbody>' +
    STATE.agents.map(a => {
      const cur = STATE.session.agentModels[a.id] || "";
      return '<tr>' +
        '<td style="font-family:var(--mono); font-weight:500;"><span class="agent-dot" style="display:inline-block; background:' + esc(a.color) + '; margin-right:7px;"></span>@' + esc(a.id) + '</td>' +
        '<td style="color:var(--text-secondary);">' + esc(a.title) + '</td>' +
        '<td><select class="select" style="font-size:11.5px; padding:5px 8px;" onchange="pinAgentModel(\\'' + esc(a.id) + '\\', this.value)">' +
          buildGroupedModelOptionsHtml(specs, cur, "Default (" + formatModelBadge(STATE.session.activeModel) + ")") +
        '</select></td></tr>';
    }).join("") + '</tbody>';

  const isEnforced = STATE.session.scope.mode === "enforced";
  document.getElementById("scopeModeSelect").value = STATE.session.scope.mode;
  document.getElementById("scopeEnforceSwitch").checked = isEnforced;
  document.getElementById("scopeSwitchLabel").textContent = isEnforced ? "Enforced" : "Advisory";

  const allow = STATE.session.scope.allow || [];
  const deny = STATE.session.scope.deny || [];
  document.getElementById("scopeRulesTree").innerHTML =
    '<div style="margin-bottom:9px;">' +
      '<div style="font-size:11px; color:var(--text-muted); margin-bottom:5px;">Allow (' + allow.length + ')</div>' +
      '<div style="display:flex; gap:5px; flex-wrap:wrap;">' +
        (allow.length
          ? allow.map(r => '<span class="pill success" style="font-family:var(--mono);">' + esc(r) + ' <a href="#" onclick="removeScopeRuleUi(\\'allow\\',\\'' + esc(r) + '\\');return false;" style="color:inherit;text-decoration:none;margin-left:3px;">×</a></span>').join("")
          : '<span style="font-size:12px; color:var(--text-muted);">No allow rules yet</span>') +
      '</div>' +
    '</div>' +
    '<div>' +
      '<div style="font-size:11px; color:var(--text-muted); margin-bottom:5px;">Deny (' + deny.length + ')</div>' +
      '<div style="display:flex; gap:5px; flex-wrap:wrap;">' +
        (deny.length
          ? deny.map(r => '<span class="pill danger" style="font-family:var(--mono);">' + esc(r) + ' <a href="#" onclick="removeScopeRuleUi(\\'deny\\',\\'' + esc(r) + '\\');return false;" style="color:inherit;text-decoration:none;margin-left:3px;">×</a></span>').join("")
          : '<span style="font-size:12px; color:var(--text-muted);">None</span>') +
      '</div>' +
    '</div>';

  const ml = document.getElementById("mcpList");
  ml.innerHTML = (STATE.mcpServers || []).map(m =>
    '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 11px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-elevated);">' +
      '<div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
        '<div style="font-size:12.5px; font-weight:500;">' + esc(m.name) + '</div>' +
        '<div style="font-family:var(--mono); font-size:11px; color:var(--text-muted);">' + esc(m.command + " " + m.args.join(" ")) + '</div>' +
      '</div>' +
      (m.connected
        ? '<span class="pill success">' + m.toolCount + ' tools</span>'
        : '<button class="btn btn-sm" onclick="connectMcpUi(\\'' + esc(m.name) + '\\')">Connect</button>') +
    '</div>'
  ).join("") || '<div style="font-size:12px; color:var(--text-muted);">No MCP servers configured.</div>';
}

/* ========================================================================
   Tab 6: Channels & Remote Bots
   ======================================================================== */
const CHANNEL_GUIDES = {
  telegram: {
    steps: [
      'Open <code>@BotFather</code> in Telegram and send <code>/newbot</code>.',
      'Copy the HTTP API token (<code>123456789:AAH...</code>).',
      'Paste below and press <code>Enter</code>, then text <code>/pair CODE</code> to your bot.',
    ],
    callout: 'Uses local Bot API long-polling — no ngrok, domain, or public port required.',
    placeholder: 'Paste @BotFather token and press Enter',
  },
  discord: {
    steps: [
      'Open <code>discord.com/developers/applications</code> → New Application → <code>Bot</code>.',
      'Click <code>Reset Token</code> and enable <code>Message Content Intent</code>.',
      'Paste the token below and press <code>Enter</code>, then DM <code>/pair CODE</code>.',
    ],
    callout: 'Connects over Discord Gateway v10 WebSocket. DMs work even without Message Content Intent.',
    placeholder: 'Paste Discord Bot token and press Enter',
  },
  slack: {
    steps: [
      'In <code>api.slack.com/apps</code>, enable <code>Socket Mode</code> and create an <code>xapp-...</code> App Token.',
      'Add scopes <code>chat:write</code>, <code>im:history</code>, <code>app_mentions:read</code> and install for <code>xoxb-...</code>.',
      'Paste both tokens below and press <code>Enter</code>.',
    ],
    callout: 'Subscribe to <code>message.im</code> and <code>app_mention</code> under Event Subscriptions.',
    placeholder: 'Slack Bot Token (xoxb-...)',
  },
  webhook: {
    steps: [
      'Press <code>Enter</code> to create <code>/api/channels/webhook/&lt;id&gt;</code>.',
      'POST JSON <code>{"text":"...","senderId":"me"}</code> with <code>Authorization: Bearer &lt;secret&gt;</code>.',
      'Send <code>/pair CODE</code> once to authorize your sender ID.',
    ],
    callout: 'Works with WhatsApp bridges, Matrix, n8n workflows, iOS Shortcuts, or custom scripts.',
    placeholder: 'Optional custom Bearer secret (blank = auto-generate)',
  },
};

function selectChannelPlatform(plat, focusInput = true) {
  document.getElementById("chPlatform").value = plat;
  document.querySelectorAll("#chPlatformTabs .plat-card").forEach(b => b.classList.toggle("active", b.dataset.plat === plat));
  const guide = CHANNEL_GUIDES[plat] || CHANNEL_GUIDES.telegram;
  document.getElementById("chStepsGuide").innerHTML = guide.steps.map((s, i) =>
    '<li class="step-row"><span class="step-num">' + (i + 1) + '</span><span>' + s + '</span></li>'
  ).join("");
  document.getElementById("chPlatformHint").innerHTML = '<div class="callout">' + guide.callout + '</div>';

  const tok = document.getElementById("chToken");
  const extra = document.getElementById("chExtraRow");
  const appTok = document.getElementById("chAppToken");
  const chName = document.getElementById("chName");
  const cbUrl = document.getElementById("chCallbackUrl");
  tok.placeholder = guide.placeholder;

  if (plat === "slack") {
    extra.style.display = "flex"; appTok.style.display = "block"; chName.style.display = "none"; cbUrl.style.display = "none";
  } else if (plat === "webhook") {
    extra.style.display = "flex"; appTok.style.display = "none"; chName.style.display = "block"; cbUrl.style.display = "block";
  } else {
    extra.style.display = "none";
  }
  if (focusInput) tok.focus();
}

function copyTextSnippet(text, label) {
  navigator.clipboard?.writeText(text).then(() => toast("Copied " + label)).catch(() => toast(label + ": " + text));
}

selectChannelPlatform("telegram", false);

function renderChannels() {
  const agSel = document.getElementById("chDefaultAgent");
  if (agSel && STATE?.agents && agSel.options.length <= 1) {
    for (const a of STATE.agents) {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = "Pin @" + a.id;
      agSel.appendChild(opt);
    }
  }

  const list = STATE.channels || [];
  const grid = document.getElementById("channelsGrid");
  if (list.length === 0) {
    grid.innerHTML = '<div class="card" style="grid-column:1/-1; color:var(--text-muted); font-size:12.5px; text-align:center; padding:24px;">No connected channels yet. Configure Telegram, Discord, Slack, or a Webhook above.</div>';
    return;
  }

  grid.innerHTML = list.map(ch => {
    const st = ch.status?.state || "disconnected";
    const stCls = st === "connected" ? "success" : st === "error" ? "danger" : st === "connecting" ? "warn" : "";
    const isLive = st === "connected";

    const usersHtml = (ch.allowedUsers || []).map(u =>
      '<span class="pill success" style="font-family:var(--mono);">user:' + esc(u) + ' <a href="#" onclick="channelRemoveAllow(\\'' + esc(ch.id) + '\\',\\'user\\',\\'' + esc(u) + '\\');return false;" style="color:inherit;text-decoration:none;margin-left:3px;">×</a></span>'
    ).join("");
    const chatsHtml = (ch.allowedChats || []).map(c =>
      '<span class="pill info" style="font-family:var(--mono);">chat:' + esc(c) + ' <a href="#" onclick="channelRemoveAllow(\\'' + esc(ch.id) + '\\',\\'chat\\',\\'' + esc(c) + '\\');return false;" style="color:inherit;text-decoration:none;margin-left:3px;">×</a></span>'
    ).join("");

    return '<div class="card" style="display:flex; flex-direction:column; gap:10px;">' +
      '<div class="card-head" style="margin-bottom:0;">' +
        '<div><div class="card-title">' + esc(ch.name) + '</div><div class="card-sub">' + esc(ch.platform) + (ch.status?.botUsername ? " · " + esc(ch.status.botUsername) : "") + '</div></div>' +
        '<span class="pill ' + stCls + '">' + esc(st) + '</span>' +
      '</div>' +
      '<div class="kv-list">' +
        '<div class="kv-row"><span class="kv-k">Messages</span><span class="kv-v">' + (ch.status?.messagesIn || 0) + ' in / ' + (ch.status?.messagesOut || 0) + ' out</span></div>' +
        '<div class="kv-row"><span class="kv-k">Agent</span><span class="kv-v">' + esc(ch.defaultAgent ? ("@" + ch.defaultAgent) : "active") + '</span></div>' +
        (ch.platform === "webhook" && ch.status?.webhookPath ? '<div class="kv-row"><span class="kv-k">Webhook</span><span class="kv-v">' + esc((STATE.daemonUrl || "") + ch.status.webhookPath) + '</span></div>' : '') +
      '</div>' +
      (ch.status?.lastError ? '<div class="callout callout-danger">' + esc(ch.status.lastError) + '</div>' : '') +
      (ch.pairingCode
        ? '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-code);">' +
            '<code style="font-family:var(--mono); font-size:11.5px;">/pair ' + esc(ch.pairingCode) + '</code>' +
            '<div style="display:flex; gap:4px;"><button class="btn-subtle-xs" onclick="copyTextSnippet(\\'/pair ' + esc(ch.pairingCode) + '\\',\\'pair code\\')">Copy</button><button class="btn-subtle-xs" onclick="rotatePairCodeUi(\\'' + esc(ch.id) + '\\')">Rotate</button></div>' +
          '</div>'
        : '<button class="btn btn-sm" onclick="rotatePairCodeUi(\\'' + esc(ch.id) + '\\')">Generate Pairing Code</button>') +
      '<div style="display:flex; gap:5px; flex-wrap:wrap;">' +
        (ch.allowAll ? '<span class="pill danger">Allow-All</span>' : '') +
        (usersHtml + chatsHtml || (!ch.allowAll ? '<span style="font-size:11.5px; color:var(--text-muted);">Deny by default — pair or allow an ID below</span>' : '')) +
      '</div>' +
      '<div style="display:flex; gap:6px;">' +
        '<input class="input mono" id="allow-' + esc(ch.id) + '" placeholder="Allow user/chat ID" style="flex:1; padding:5px 8px; font-size:11.5px;" />' +
        '<button class="btn btn-sm" onclick="channelAddAllow(\\'' + esc(ch.id) + '\\',\\'user\\')">+ User</button>' +
        '<button class="btn btn-sm" onclick="channelAddAllow(\\'' + esc(ch.id) + '\\',\\'chat\\')">+ Chat</button>' +
      '</div>' +
      '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:9px; border-top:1px solid var(--border);">' +
        '<div style="display:flex; align-items:center; gap:10px;">' +
          (isLive
            ? '<button class="btn btn-sm" onclick="stopChannelUi(\\'' + esc(ch.id) + '\\')">Stop</button>'
            : '<button class="btn btn-primary btn-sm" onclick="startChannelUi(\\'' + esc(ch.id) + '\\')">Start</button>') +
          '<label class="switch"><input type="checkbox" ' + (ch.allowAll ? "checked" : "") + ' onchange="toggleAllowAllUi(\\'' + esc(ch.id) + '\\', this.checked)" /><span class="switch-track"></span><span style="font-size:11.5px;">Allow all</span></label>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteChannelUi(\\'' + esc(ch.id) + '\\')">Delete</button>' +
      '</div>' +
    '</div>';
  }).join("");
}

/* ========================================================================
   API Actions
   ======================================================================== */
async function createChannelUi() {
  const platform = document.getElementById("chPlatform").value;
  const name = document.getElementById("chName").value.trim();
  const token = document.getElementById("chToken").value.trim();
  const appToken = document.getElementById("chAppToken").value.trim();
  const callbackUrl = document.getElementById("chCallbackUrl").value.trim();
  const defaultAgent = document.getElementById("chDefaultAgent").value;
  if (platform !== "webhook" && !token) return toast("Paste the bot token first.");
  if (platform === "slack" && !appToken) return toast("Paste the Slack App-Level token (xapp-...).");
  try {
    toast("Connecting " + platform + "…");
    const res = await api("/api/channels", {
      method: "POST",
      body: {
        platform,
        name: name || undefined,
        token: token || undefined,
        appToken: appToken || undefined,
        callbackUrl: callbackUrl || undefined,
        defaultAgent: defaultAgent || undefined,
        connectNow: true,
      },
    });
    document.getElementById("chToken").value = "";
    document.getElementById("chAppToken").value = "";
    document.getElementById("chName").value = "";
    const notice = document.getElementById("chCreatedNotice");
    if (res.webhookSecret) {
      const ep = (STATE.daemonUrl || window.location.origin) + "/api/channels/webhook/" + res.channel.id;
      const sampleCmd = 'curl -X POST "' + ep + '" -H "Authorization: Bearer ' + res.webhookSecret + '" -H "Content-Type: application/json" -d \\'{"text":"/pair ' + (res.channel.pairingCode || "") + '","senderId":"me"}\\'';
      notice.style.display = "block";
      notice.innerHTML = '<div class="md-code-wrap"><div class="md-code-head"><span>Webhook Ready (secret shown once)</span><button class="btn-subtle-xs" onclick="copyTextSnippet(' + JSON.stringify(sampleCmd).replace(/"/g, "&quot;") + ',\\'curl command\\')">Copy curl</button></div><pre class="md-code"><code>' + esc(sampleCmd) + '</code></pre></div>';
    } else if (res.channel?.pairingCode) {
      const pairCmd = "/pair " + res.channel.pairingCode;
      notice.style.display = "block";
      notice.innerHTML = '<div class="callout callout-success" style="display:flex; align-items:center; justify-content:space-between; gap:10px;"><div><div class="callout-title">Connected ' + esc(res.channel.status?.botUsername || "") + '</div><div>Send <code>' + esc(pairCmd) + '</code> to pair your account.</div></div><button class="btn btn-sm" onclick="copyTextSnippet(' + JSON.stringify(pairCmd).replace(/"/g, "&quot;") + ',\\'pairing command\\')">Copy</button></div>';
    } else {
      notice.style.display = "none";
    }
    toast("Connected " + (res.channel?.name || platform));
    refreshState();
  } catch (err) {
    toast("Bot error: " + err.message);
    refreshState();
  }
}

async function startChannelUi(id) {
  try {
    await api("/api/channels/" + encodeURIComponent(id) + "/start", { method: "POST" });
    toast("Channel started.");
    refreshState();
  } catch (err) { toast("Start error: " + err.message); refreshState(); }
}
async function stopChannelUi(id) {
  await api("/api/channels/" + encodeURIComponent(id) + "/stop", { method: "POST" });
  toast("Channel stopped.");
  refreshState();
}
async function deleteChannelUi(id) {
  await api("/api/channels/" + encodeURIComponent(id), { method: "DELETE" });
  toast("Channel removed.");
  refreshState();
}
async function rotatePairCodeUi(id) {
  const res = await api("/api/channels/" + encodeURIComponent(id) + "/pair-code", { method: "POST" });
  toast("New pairing code: /pair " + res.pairingCode);
  refreshState();
}
async function channelAddAllow(id, kind) {
  const inp = document.getElementById("allow-" + id);
  const val = (inp?.value || "").trim();
  if (!val) return toast("Enter a user or chat ID first.");
  await api("/api/channels/" + encodeURIComponent(id) + "/access", {
    method: "POST",
    body: kind === "chat" ? { addChat: val } : { addUser: val },
  });
  inp.value = "";
  toast("Authorized " + kind + " " + val);
  refreshState();
}
async function channelRemoveAllow(id, kind, val) {
  await api("/api/channels/" + encodeURIComponent(id) + "/access", {
    method: "POST",
    body: kind === "chat" ? { removeChat: val } : { removeUser: val },
  });
  refreshState();
}
async function toggleAllowAllUi(id, nextVal) {
  await api("/api/channels/" + encodeURIComponent(id) + "/access", {
    method: "POST",
    body: { allowAll: nextVal },
  });
  toast(nextVal ? "Allow-all enabled" : "Allowlist enforced");
  refreshState();
}

function autoGrowComposer() {
  const el = document.getElementById("chatInput");
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(180, Math.max(36, el.scrollHeight)) + "px";
}
function updateSendBtnState() {
  const inp = document.getElementById("chatInput");
  const btn = document.getElementById("sendBtn");
  if (!inp || !btn) return;
  btn.classList.toggle("empty", !inp.value.trim() && PENDING_ATTACHMENTS.length === 0);
}
document.getElementById("chatInput").addEventListener("input", () => {
  autoGrowComposer();
  updateSendBtnState();
});
document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (SEND_KEY_PREF === "ctrl-enter") {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); sendChat(); }
  } else {
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) { e.preventDefault(); sendChat(); }
  }
});
document.getElementById("chatScroll").addEventListener("scroll", updateScrollBottomBtn);

async function selectAgent(id) {
  await api("/api/agent", { method: "POST", body: { agentId: id } });
  toast("Switched to @" + id);
  refreshState();
}

let PENDING_ATTACHMENTS = [];

function isLikelyTextFile(file) {
  if ((file.type || "").startsWith("text/")) return true;
  if (/json|xml|yaml|yml|javascript|typescript|x-sh|x-python|sql|csv/i.test(file.type || "")) return true;
  return /\\.(txt|md|json|js|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|hpp|cs|php|sh|ps1|yaml|yml|toml|ini|conf|xml|html|css|scss|sql|log|env|csv|svg)$/i.test(file.name || "");
}

function renderComposerAttachments() {
  const tray = document.getElementById("composerAttachments");
  if (!tray) return;
  tray.classList.toggle("has-files", PENDING_ATTACHMENTS.length > 0);
  tray.innerHTML = PENDING_ATTACHMENTS.map((a, idx) =>
    '<div class="attach-chip" title="' + esc(a.name) + '">' +
      (a.previewUrl ? '<img class="attach-chip-thumb" src="' + esc(a.previewUrl) + '" alt="" />' : '<span>📎</span>') +
      '<span class="attach-chip-name">' + esc(a.name) + '</span>' +
      '<span class="attach-chip-size">' + fmtCompactNum(a.size) + 'B</span>' +
      '<button type="button" onclick="removePendingAttachment(' + idx + ')" title="Remove">×</button>' +
    '</div>'
  ).join("");
  updateSendBtnState();
}

function removePendingAttachment(idx) {
  PENDING_ATTACHMENTS.splice(idx, 1);
  renderComposerAttachments();
}

async function handleChatFilesSelected(fileList) {
  const files = Array.from(fileList || []);
  const inp = document.getElementById("chatFileInput");
  if (inp) inp.value = "";
  for (const f of files) {
    if (PENDING_ATTACHMENTS.length >= 8) {
      toast("Maximum 8 attachments per message.");
      break;
    }
    const isText = isLikelyTextFile(f) && f.size <= 256 * 1024;
    if (f.size > 4 * 1024 * 1024) {
      toast("Skipped " + f.name + " (exceeds 4MB limit)");
      continue;
    }
    if (isText) {
      const text = await f.text();
      PENDING_ATTACHMENTS.push({
        name: f.name,
        mimeType: f.type || "text/plain",
        size: f.size,
        content: text,
        encoding: "utf8",
      });
    } else {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(f);
      });
      const commaIdx = dataUrl.indexOf(",");
      const b64 = commaIdx === -1 ? dataUrl : dataUrl.slice(commaIdx + 1);
      PENDING_ATTACHMENTS.push({
        name: f.name,
        mimeType: f.type || "application/octet-stream",
        size: f.size,
        content: b64,
        encoding: "base64",
        previewUrl: (f.type || "").startsWith("image/") ? dataUrl : undefined,
      });
    }
  }
  renderComposerAttachments();
}

(() => {
  const box = document.getElementById("composerBox");
  if (!box) return;
  box.addEventListener("dragover", (e) => {
    e.preventDefault();
    box.classList.add("drag-over");
  });
  box.addEventListener("dragleave", () => box.classList.remove("drag-over"));
  box.addEventListener("drop", (e) => {
    e.preventDefault();
    box.classList.remove("drag-over");
    if (e.dataTransfer?.files?.length) handleChatFilesSelected(e.dataTransfer.files);
  });
  document.getElementById("chatInput")?.addEventListener("paste", (e) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      handleChatFilesSelected(files);
    }
  });
})();

async function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text && PENDING_ATTACHMENTS.length === 0) return;
  const attachments = PENDING_ATTACHMENTS.map(a => ({
    name: a.name,
    mimeType: a.mimeType,
    size: a.size,
    content: a.content,
    encoding: a.encoding,
  }));
  input.value = "";
  PENDING_ATTACHMENTS = [];
  renderComposerAttachments();
  autoGrowComposer();
  updateSendBtnState();
  try {
    await api("/api/chat", { method: "POST", body: { message: text, attachments } });
    scrollChatToBottom();
  } catch (err) { toast("Error: " + err.message); }
}

async function abortRun() {
  await api("/api/abort", { method: "POST" });
  setStreamingState(false);
  toast("Stopped generation.");
}

async function launchSwarm() {
  const goal = document.getElementById("swarmGoal").value.trim();
  if (!goal) return toast("Enter a swarm objective first.");
  const selected = [...document.querySelectorAll("#swarmAgentChecks input:checked")].map(i => i.value);
  if (selected.length === 0) return toast("Select at least one agent.");
  const tasks = selected.map(agent => ({ agent, objective: goal }));
  await api("/api/swarm", { method: "POST", body: { tasks } });
  toggleSwarmDrawer(true);
  toast("Dispatched " + tasks.length + " swarm agents.");
}

async function sendHttpForge() {
  try {
    const method = document.getElementById("httpMethod").value;
    const url = document.getElementById("httpUrl").value.trim();
    const headers = JSON.parse(document.getElementById("httpHeaders").value || "{}");
    const body = document.getElementById("httpBody").value;
    const followRedirects = document.getElementById("httpFollowRedirects").checked;
    const res = await api("/api/http/send", { method: "POST", body: { method, url, headers, body, followRedirects } });
    await refreshState();
    if (res.capture) inspectHttp(res.capture.id);
    toast(res.blockedReason ? "Scope blocked" : ("HTTP " + res.capture.status));
  } catch (err) { toast("HTTP error: " + err.message); }
}

async function escalateHttpToWebHunter() {
  if (!ACTIVE_HTTP) return toast("Select a capture first.");
  switchTab("console");
  await api("/api/chat", {
    method: "POST",
    body: {
      agentId: "web-hunter",
      message: "Audit HTTP capture " + ACTIVE_HTTP.id + " (" + ACTIVE_HTTP.method + " " + ACTIVE_HTTP.url + " -> " + ACTIVE_HTTP.status + "). Check for auth bypass, IDOR, injection, CORS, and header anomalies.",
    },
  });
}

async function runBinaryTriageUi() {
  const p = document.getElementById("reBinaryPath").value.trim();
  if (!p) return toast("Enter a binary path first.");
  try {
    await api("/api/re/triage", { method: "POST", body: { path: p } });
    toast("Binary triaged.");
    refreshState();
  } catch (err) { toast("Triage error: " + err.message); }
}

async function escalateBinaryToReverser(filePath) {
  switchTab("console");
  await api("/api/chat", {
    method: "POST",
    body: { agentId: "reverser", message: "Perform deep reverse-engineering security analysis on: " + filePath },
  });
}

async function runJsReconUi() {
  const p = document.getElementById("jsReconPath").value.trim() || STATE.session.workspace;
  try {
    const { recon } = await api("/api/re/js-recon", { method: "POST", body: { path: p } });
    const out = document.getElementById("jsReconOutput");
    out.dataset.hasData = "1";

    const eps = (recon.endpoints || []).slice(0, 60);
    const sinks = (recon.dangerousSinks || []).slice().sort((a, b) => b.count - a.count).slice(0, 12);
    const maxSink = Math.max(1, ...sinks.map(s => s.count));

    out.innerHTML =
      '<div class="card">' +
        '<div class="card-head" style="margin-bottom:9px;"><div class="card-title">Scan Summary</div><span class="nav-count">' + recon.filesScanned + ' files</span></div>' +
        '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;">' +
          '<div><div style="font-size:17px; font-weight:600; font-family:var(--mono);">' + fmtCompactNum(recon.bytesScanned) + '</div><div style="font-size:11px; color:var(--text-muted);">Bytes</div></div>' +
          '<div><div style="font-size:17px; font-weight:600; font-family:var(--mono); color:' + (recon.secrets.length ? "var(--danger)" : "var(--text)") + ';">' + recon.secrets.length + '</div><div style="font-size:11px; color:var(--text-muted);">Secrets</div></div>' +
          '<div><div style="font-size:17px; font-weight:600; font-family:var(--mono);">' + recon.endpoints.length + '</div><div style="font-size:11px; color:var(--text-muted);">Endpoints</div></div>' +
          '<div><div style="font-size:17px; font-weight:600; font-family:var(--mono); color:' + (recon.dangerousSinks.length ? "var(--warn)" : "var(--text)") + ';">' + recon.dangerousSinks.length + '</div><div style="font-size:11px; color:var(--text-muted);">Sinks</div></div>' +
        '</div>' +
      '</div>' +
      (recon.secrets.length
        ? '<div class="callout callout-danger"><div class="callout-title">Redacted Secrets (' + recon.secrets.length + ')</div><div>' + recon.secrets.map(s => '<code>[' + esc(s.type) + ']</code> ' + esc(s.file) + ' → <strong>' + esc(s.preview) + '</strong>').join("<br/>") + '</div></div>'
        : '<div class="callout callout-success"><div class="callout-title">Secrets</div><div>No hardcoded keys matched secret detectors.</div></div>') +
      '<div class="card">' +
        '<div class="card-head"><div class="card-title">Discovered Endpoints</div><span class="nav-count">' + recon.endpoints.length + '</span></div>' +
        (eps.length
          ? '<div style="display:flex; flex-direction:column; gap:4px; max-height:240px; overflow:auto; font-family:var(--mono); font-size:11.5px;">' + eps.map(e => '<div style="padding:4px 8px; border-radius:4px; background:var(--bg-code);">' + esc(e) + '</div>').join("") + '</div>'
          : '<div style="font-size:12px; color:var(--text-muted);">No endpoints extracted.</div>') +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><div class="card-title">Dangerous Sinks</div><span class="nav-count">' + recon.dangerousSinks.length + '</span></div>' +
        (sinks.length
          ? '<div style="display:flex; flex-direction:column; gap:8px;">' + sinks.map(d =>
              '<div style="display:grid; grid-template-columns:1fr 90px 36px; align-items:center; gap:10px; font-size:12px;">' +
                '<span style="font-family:var(--mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + esc(d.sink + " (" + d.file + ")") + '">' + esc(d.sink) + ' <span style="color:var(--text-muted);">' + esc(d.file) + '</span></span>' +
                '<div class="progress-track"><div class="progress-fill warn" style="width:' + Math.max(8, Math.round((d.count / maxSink) * 100)) + '%"></div></div>' +
                '<span style="font-family:var(--mono); text-align:right; color:var(--text-secondary);">' + d.count + '</span>' +
              '</div>'
            ).join("") + '</div>'
          : '<div style="font-size:12px; color:var(--text-muted);">No dangerous sinks flagged.</div>') +
      '</div>';

    toast("JS Recon complete (" + recon.filesScanned + " files).");
  } catch (err) { toast("JS Recon error: " + err.message); }
}

async function createFindingUi() {
  try {
    await api("/api/findings", {
      method: "POST",
      body: {
        title: document.getElementById("fTitle").value,
        severity: document.getElementById("fSeverity").value,
        target: document.getElementById("fTarget").value,
        cvssVector: document.getElementById("fCvss").value || undefined,
        summary: document.getElementById("fSummary").value,
        impact: document.getElementById("fImpact").value,
        reproduction: document.getElementById("fRepro").value,
      },
    });
    ["fTitle","fTarget","fCvss","fSummary","fImpact","fRepro"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("liveCvssScoreViz").textContent = "";
    document.getElementById("liveCvssBadge").textContent = "CVSS —";
    document.getElementById("liveCvssBadge").className = "pill";
    toast("Finding added.");
    refreshState();
  } catch (err) { toast("Error: " + err.message); }
}

async function updateFindingStatusUi(id, status) {
  await api("/api/findings/" + encodeURIComponent(id), { method: "PATCH", body: { status } });
  toast("Updated " + id + " → " + status);
  refreshState();
}

async function loadReport(fmt) {
  LAST_REPORT_FMT = fmt;
  ["redteam","hackerone","bugcrowd"].forEach(k => {
    document.getElementById("rptBtn-" + k)?.classList.toggle("active", k === fmt);
  });
  const data = await api("/api/report?format=" + fmt);
  LAST_REPORT_MD = data.markdown;
  document.getElementById("reportPreview").textContent = data.markdown;
  if (REPORT_RENDERED_MODE) {
    document.getElementById("reportRendered").innerHTML = renderRichMarkdown(data.markdown);
  }
  toast("Generated " + fmt + " report.");
}

function downloadReport() {
  if (!LAST_REPORT_MD) return toast("Generate a report first.");
  const blob = new Blob([LAST_REPORT_MD], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "yedogu-" + LAST_REPORT_FMT + "-report.md";
  a.click();
}

function openProviderConnectModal(id) {
  const p = (STATE?.providers || []).find(x => x.id === id);
  if (!p) return toast("Provider not found.");
  PRV_MODAL_ID = p.id;

  const iconEl = document.getElementById("prvModalIcon");
  const titleEl = document.getElementById("prvModalTitle");
  const metaEl = document.getElementById("prvModalMeta");
  const statusRow = document.getElementById("prvModalStatusRow");
  const envHint = document.getElementById("prvModalEnvHint");
  const keyInp = document.getElementById("prvModalKey");
  const eyeBtn = document.getElementById("prvModalEyeBtn");
  const urlInp = document.getElementById("prvModalBaseUrl");
  const modelsBox = document.getElementById("prvModalModelsBox");
  const discBtn = document.getElementById("prvModalDisconnectBtn");
  const refBtn = document.getElementById("prvModalRefreshBtn");
  const saveBtn = document.getElementById("prvModalSaveBtn");

  if (iconEl) iconEl.innerHTML = providerSvgIcon(p.id, 18);
  if (titleEl) titleEl.textContent = p.name;
  if (metaEl) metaEl.textContent = p.protocol + " · " + p.baseUrl;
  if (envHint) envHint.textContent = (p.envKeys && p.envKeys.length) ? ("(or set " + p.envKeys[0] + ")") : (p.local ? "(optional for local)" : "");
  if (keyInp) {
    keyInp.type = "password";
    keyInp.value = "";
    keyInp.placeholder = p.connected ? (p.apiKey || "Configured — paste new key to replace") : "Paste API key";
  }
  if (eyeBtn) eyeBtn.textContent = "Show";
  if (urlInp) urlInp.value = p.baseUrl || "";
  if (statusRow) {
    statusRow.innerHTML = p.connected
      ? '<span class="pill success">Connected via ' + esc(p.authSource || "config") + '</span><span style="font-size:11.5px; color:var(--text-muted);">' + (p.models?.length || 0) + ' model(s)</span>'
      : '<span class="pill">Not connected</span><span style="font-size:11.5px; color:var(--text-muted);">Models will auto-sync on connect</span>';
  }
  if (modelsBox) {
    const models = p.models || [];
    if (models.length) {
      modelsBox.style.display = "flex";
      modelsBox.innerHTML = models.slice(0, 12).map(m =>
        '<span class="prv-model-chip">' + esc(cleanModelName(m.id, m.name)) + '</span>'
      ).join("") + (models.length > 12 ? '<span class="prv-model-chip">+' + (models.length - 12) + ' more</span>' : '');
    } else {
      modelsBox.style.display = "none";
      modelsBox.innerHTML = "";
    }
  }
  if (discBtn) discBtn.style.display = p.connected ? "inline-flex" : "none";
  if (refBtn) refBtn.style.display = p.connected ? "inline-flex" : "none";
  if (saveBtn) saveBtn.textContent = p.connected ? "Update & Sync" : "Connect & Sync";

  const dlg = document.getElementById("providerConnectDlg");
  if (dlg && !dlg.open) dlg.showModal();
  setTimeout(() => keyInp?.focus(), 20);
}

function togglePrvModalKeyVisibility() {
  const inp = document.getElementById("prvModalKey");
  const btn = document.getElementById("prvModalEyeBtn");
  if (!inp || !btn) return;
  const next = inp.type === "password" ? "text" : "password";
  inp.type = next;
  btn.textContent = next === "text" ? "Hide" : "Show";
}

async function submitProviderConnectModal() {
  const id = PRV_MODAL_ID;
  if (!id) return;
  const p = (STATE?.providers || []).find(x => x.id === id);
  const key = document.getElementById("prvModalKey")?.value?.trim() || "";
  const baseUrl = document.getElementById("prvModalBaseUrl")?.value?.trim() || "";
  if (!key && !p?.local) return toast("Paste an API key first.");
  const btn = document.getElementById("prvModalSaveBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Connecting…"; }
  try {
    await api("/api/providers/connect", {
      method: "POST",
      body: { providerId: id, apiKey: key || "local-no-key-required", baseUrl: baseUrl || undefined },
    });
    toast("Connected " + (p?.name || id));
    document.getElementById("providerConnectDlg")?.close();
    await refreshState();
  } catch (err) {
    toast("Error: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Connect & Sync"; }
  }
}

async function disconnectFromProviderModal() {
  const id = PRV_MODAL_ID;
  if (!id) return;
  const p = (STATE?.providers || []).find(x => x.id === id);
  await disconnectProviderUi(id, p?.authSource || "");
  document.getElementById("providerConnectDlg")?.close();
}

async function refreshFromProviderModal() {
  const id = PRV_MODAL_ID;
  if (!id) return;
  const btn = document.getElementById("prvModalRefreshBtn");
  await refreshSingleProviderUi(id, btn);
  openProviderConnectModal(id);
}

async function connectProviderUi(id) {
  const inp = document.getElementById("pk-" + id);
  const key = inp?.value?.trim() || "";
  if (!key) return toast("Paste an API key first.");
  await api("/api/providers/connect", { method: "POST", body: { providerId: id, apiKey: key } });
  if (inp) inp.value = "";
  toast("Connected " + id);
  refreshState();
}

async function disconnectProviderUi(id, authSource) {
  const isCli = authSource === "codex-cli" || authSource === "claude-cli";
  const res = await api("/api/providers/disconnect", {
    method: "POST",
    body: { providerId: id, removeCliAuth: isCli },
  });
  toast(res.stillConnectedViaEnv ? ("Cleared saved key for " + id + " (env var still active)") : ("Removed credentials for " + id));
  refreshState();
}

let EDITING_CUSTOM_PROVIDER_ID = null;
let CUSTOM_PROVIDER_SAVING = false;

function editCustomProviderUi(id) {
  if (CUSTOM_PROVIDER_SAVING) return;
  const provider = (STATE.providers || []).find(p => p.id === id && p.custom);
  if (!provider) return toast("Custom provider was not found.");
  EDITING_CUSTOM_PROVIDER_ID = provider.id;
  document.getElementById("customProviderForm").reset();
  document.getElementById("cpId").value = provider.id;
  document.getElementById("cpId").readOnly = true;
  document.getElementById("cpName").value = provider.name;
  document.getElementById("cpProto").value = provider.protocol;
  document.getElementById("cpUrl").value = provider.baseUrl;
  document.getElementById("cpKey").placeholder = "Leave blank to keep saved key";
  document.getElementById("cpModel").value = provider.defaultModel;
  document.getElementById("cpModels").value = (provider.configuredModels || provider.models || []).filter(m => m.id !== provider.defaultModel).map(m => m.id).join(", ");
  document.getElementById("customProviderFormTitle").textContent = "Edit Custom Provider: " + provider.name;
  document.getElementById("cpSaveBtn").textContent = "Save changes";
  document.getElementById("cpCancelBtn").hidden = false;
  if (typeof renderCustomModelChips === "function") renderCustomModelChips();
  const disclosure = document.getElementById("customProviderDisclosure");
  disclosure.open = true;
  disclosure.scrollIntoView({ block: "nearest" });
  document.getElementById("cpName").focus();
}

function resetCustomProviderFormUi() {
  EDITING_CUSTOM_PROVIDER_ID = null;
  document.getElementById("customProviderForm").reset();
  document.getElementById("cpId").readOnly = false;
  document.getElementById("cpKey").placeholder = "API key (optional)";
  document.getElementById("customProviderFormTitle").textContent = "+ Add Custom OpenAI / Anthropic / Gemini Endpoint";
  document.getElementById("cpSaveBtn").textContent = "Add";
  document.getElementById("cpCancelBtn").hidden = true;
  if (typeof renderCustomModelChips === "function") renderCustomModelChips();
  const pr = document.getElementById("cpProbeResults");
  if (pr) { pr.style.display = "none"; pr.innerHTML = ""; }
  const ps = document.getElementById("cpProbeStatus");
  if (ps) ps.textContent = "";
}

function cancelCustomProviderEditUi() {
  if (CUSTOM_PROVIDER_SAVING) return;
  const id = EDITING_CUSTOM_PROVIDER_ID;
  resetCustomProviderFormUi();
  document.getElementById("customProviderDisclosure").open = false;
  const button = Array.from(document.querySelectorAll("[data-provider-id]")).find(el => el.dataset.providerId === id);
  button?.focus();
}

async function saveCustomProviderUi() {
  const form = document.getElementById("customProviderForm");
  if (CUSTOM_PROVIDER_SAVING || !form.reportValidity()) return;
  const editingId = EDITING_CUSTOM_PROVIDER_ID;
  CUSTOM_PROVIDER_SAVING = true;
  form.querySelectorAll("input,select,button").forEach(el => el.disabled = true);
  try {
    await api("/api/providers/custom", {
      method: editingId ? "PATCH" : "POST",
      body: {
        id: editingId || document.getElementById("cpId").value,
        name: document.getElementById("cpName").value,
        protocol: document.getElementById("cpProto").value,
        baseUrl: document.getElementById("cpUrl").value,
        apiKey: document.getElementById("cpKey").value,
        defaultModel: document.getElementById("cpModel").value,
        models: document.getElementById("cpModels").value.split(",").map(id => id.trim()).filter(Boolean),
      },
    });
    resetCustomProviderFormUi();
    document.getElementById("customProviderDisclosure").open = false;
    toast(editingId ? "Custom provider updated." : "Custom provider added.");
    await refreshState();
  } catch (err) { toast("Error: " + err.message); }
  finally {
    CUSTOM_PROVIDER_SAVING = false;
    form.querySelectorAll("input,select,button").forEach(el => el.disabled = false);
  }
}

async function pinAgentModel(agentId, model) {
  if (!model) return;
  await api("/api/model", { method: "POST", body: { agentId, model } });
  toast("Pinned @" + agentId + " → " + formatModelBadge(model));
  refreshState();
}

function openAddCustomProviderUi() {
  resetCustomProviderFormUi();
  const d = document.getElementById("customProviderDisclosure");
  if (d) {
    d.open = true;
    d.scrollIntoView({ block: "nearest" });
    document.getElementById("cpId")?.focus();
  }
}

const CUSTOM_PROVIDER_PRESETS = {
  openrouter: { id: "custom-openrouter", name: "OpenRouter Custom", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-sonnet-4-6" },
  together: { id: "together", name: "Together AI", protocol: "openai", baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  vllm: { id: "vllm", name: "vLLM Local", protocol: "openai", baseUrl: "http://127.0.0.1:8000/v1", model: "default" },
  litellm: { id: "litellm", name: "LiteLLM Proxy", protocol: "openai", baseUrl: "http://127.0.0.1:4000/v1", model: "gpt-4o" },
  lmstudio: { id: "lmstudio-custom", name: "LM Studio Custom", protocol: "openai", baseUrl: "http://127.0.0.1:1234/v1", model: "local-model" },
};

function applyCustomPreset(key) {
  const p = CUSTOM_PROVIDER_PRESETS[key];
  if (!p) return;
  if (!EDITING_CUSTOM_PROVIDER_ID) {
    document.getElementById("cpId").value = p.id;
  }
  document.getElementById("cpName").value = p.name;
  document.getElementById("cpProto").value = p.protocol;
  document.getElementById("cpUrl").value = p.baseUrl;
  document.getElementById("cpModel").value = p.model;
  document.getElementById("cpKey")?.focus();
}

function renderCustomModelChips() {
  const box = document.getElementById("cpModelsChips");
  const inp = document.getElementById("cpModels");
  if (!box || !inp) return;
  const ids = inp.value.split(",").map(s => s.trim()).filter(Boolean);
  box.innerHTML = ids.map(id =>
    '<span class="cp-chip">' + esc(id) + '<button type="button" onclick="removeCustomModelChip(\\'' + esc(id) + '\\')" title="Remove">×</button></span>'
  ).join("");
}

function removeCustomModelChip(id) {
  const inp = document.getElementById("cpModels");
  if (!inp) return;
  const next = inp.value.split(",").map(s => s.trim()).filter(x => x && x !== id);
  inp.value = next.join(", ");
  renderCustomModelChips();
}

function addProbedModelToCustom(id) {
  const defInp = document.getElementById("cpModel");
  const extraInp = document.getElementById("cpModels");
  if (!defInp || !extraInp) return;
  if (!defInp.value.trim() || defInp.value.trim() === "default-model-id" || defInp.value.trim() === "default") {
    defInp.value = id;
  } else if (defInp.value.trim() !== id) {
    const cur = extraInp.value.split(",").map(s => s.trim()).filter(Boolean);
    if (!cur.includes(id)) {
      cur.push(id);
      extraInp.value = cur.join(", ");
    }
  }
  renderCustomModelChips();
}

async function probeCustomProviderUi() {
  const url = document.getElementById("cpUrl")?.value?.trim();
  const proto = document.getElementById("cpProto")?.value || "openai";
  const key = document.getElementById("cpKey")?.value?.trim() || "";
  const statusEl = document.getElementById("cpProbeStatus");
  const resEl = document.getElementById("cpProbeResults");
  if (!url) return toast("Enter an endpoint URL first.");
  if (statusEl) statusEl.textContent = "Probing endpoint…";
  try {
    const res = await api("/api/providers/probe", { method: "POST", body: { protocol: proto, baseUrl: url, apiKey: key } });
    if (res.ok && res.models?.length) {
      if (statusEl) statusEl.textContent = "Found " + res.models.length + " available model(s) — click to add:";
      if (resEl) {
        resEl.style.display = "flex";
        resEl.innerHTML = res.models.slice(0, 24).map(m =>
          '<button type="button" class="prv-model-chip" onclick="addProbedModelToCustom(\\'' + esc(m.id) + '\\')">' + esc(cleanModelName(m.id, m.name)) + '</button>'
        ).join("");
      }
    } else {
      if (statusEl) statusEl.textContent = res.error ? ("Probe failed: " + res.error) : "No models returned by endpoint.";
      if (resEl) { resEl.style.display = "none"; resEl.innerHTML = ""; }
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = "Error: " + err.message;
  }
}

async function deleteCustomProviderUi(id) {
  try {
    await api("/api/providers/custom/" + encodeURIComponent(id), { method: "DELETE" });
    toast("Deleted custom provider " + id);
    await refreshState();
  } catch (err) { toast("Error: " + err.message); }
}

async function refreshSingleProviderUi(id, btn) {
  if (btn) btn.classList.add("spinning");
  try {
    const res = await api("/api/providers/refresh", { method: "POST", body: { providerId: id } });
    const first = res.refreshed?.[0];
    toast(first?.live ? ("Synced " + first.count + " model(s) from " + id) : (first?.error || ("Could not refresh " + id)));
    await refreshState();
  } catch (err) {
    toast("Refresh failed: " + err.message);
  } finally {
    if (btn) btn.classList.remove("spinning");
  }
}

async function toggleScopeSwitch(enforced) {
  const mode = enforced ? "enforced" : "advisory";
  document.getElementById("scopeModeSelect").value = mode;
  await api("/api/scope", { method: "POST", body: { mode } });
  toast("Scope mode: " + mode);
  refreshState();
}

async function updateScopeMode() {
  const mode = document.getElementById("scopeModeSelect").value;
  await api("/api/scope", { method: "POST", body: { mode } });
  toast("Scope mode: " + mode);
  refreshState();
}

async function addScopeRuleUi() {
  const kind = document.getElementById("scopeKind").value;
  const rule = document.getElementById("scopeRuleInput").value.trim();
  if (!rule) return;
  await api("/api/scope", { method: "POST", body: { action: "add", kind, rule } });
  document.getElementById("scopeRuleInput").value = "";
  refreshState();
}

async function removeScopeRuleUi(kind, rule) {
  await api("/api/scope", { method: "POST", body: { action: "remove", kind, rule } });
  refreshState();
}

async function connectMcpUi(name) {
  toast("Connecting " + name + "…");
  try {
    const res = await api("/api/mcp/connect", { method: "POST", body: { name } });
    toast("Connected " + name + " (" + (res.tools?.length || 0) + " tools)");
    refreshState();
  } catch (err) { toast("MCP error: " + err.message); }
}

async function newSession(projectId) {
  try {
    await api("/api/session/new", { method: "POST", body: projectId ? { projectId } : {} });
    ACTIVE_HTTP = null;
    switchTab("console");
    toast("Started new chat.");
    await refreshState();
    document.getElementById("chatInput")?.focus();
  } catch (err) { toast("Session error: " + err.message); }
}

async function switchSessionUi(sessionId) {
  if (!sessionId || STATE?.session?.id === sessionId) {
    switchTab("console");
    closeMobileSidebar();
    return;
  }
  try {
    await api("/api/session/switch", { method: "POST", body: { sessionId } });
    ACTIVE_HTTP = null;
    switchTab("console");
    await refreshState();
    scrollChatToBottom();
  } catch (err) { toast("Session error: " + err.message); }
}

/* ========================================================================
   Live SSE Event Stream
   ======================================================================== */
function setStreamingState(isStreaming) {
  const ind = document.getElementById("streamIndicator");
  if (ind) ind.style.display = isStreaming ? "inline-flex" : "none";
}

function connectSse() {
  const es = new EventSource("/api/events");
  es.addEventListener("message.start", (e) => {
    const evt = JSON.parse(e.data);
    setStreamingState(true);
    STREAM_BUFFERS[evt.payload.id] = { text: "", reasoning: "" };
    const box = document.getElementById("chatMessages");
    const scroller = document.getElementById("chatScroll");
    const follow = AUTO_SCROLL_PREF && isNearBottom(scroller);
    if (box.querySelector(".empty-hero")) box.innerHTML = "";
    const div = document.createElement("div");
    div.className = "msg-row msg-assistant";
    div.id = "msg-" + evt.payload.id;
    div.innerHTML =
      '<div class="msg-assistant-head">' +
        '<span class="agent-dot" style="background:var(--warn);"></span>' +
        '<span class="msg-agent-name">@' + esc(evt.payload.agentId) + '</span>' +
        '<span class="msg-model-name">' + esc(evt.payload.model) + '</span>' +
        '<span class="pill warn" style="margin-left:auto;">Live</span>' +
      '</div>' +
      '<div id="rs-' + esc(evt.payload.id) + '" style="display:none; padding:9px 11px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-code); font-family:var(--mono); font-size:11.5px; color:var(--text-secondary); white-space:pre-wrap; overflow-wrap:anywhere; max-height:150px; overflow:auto; margin-bottom:8px;"></div>' +
      '<div class="md-prose" id="bd-' + esc(evt.payload.id) + '"></div>';
    box.appendChild(div);
    if (follow) scrollChatToBottom();
  });

  es.addEventListener("message.delta", (e) => {
    const evt = JSON.parse(e.data);
    const id = evt.payload.id;
    if (!STREAM_BUFFERS[id]) STREAM_BUFFERS[id] = { text: "", reasoning: "" };
    STREAM_BUFFERS[id].text += evt.payload.delta;
    const el = document.getElementById("bd-" + id);
    const scroller = document.getElementById("chatScroll");
    if (el) {
      const follow = AUTO_SCROLL_PREF && isNearBottom(scroller);
      el.textContent = STREAM_BUFFERS[id].text;
      if (follow) scroller.scrollTop = scroller.scrollHeight;
      updateScrollBottomBtn();
    }
  });

  es.addEventListener("reasoning.delta", (e) => {
    const evt = JSON.parse(e.data);
    const id = evt.payload.id;
    if (!STREAM_BUFFERS[id]) STREAM_BUFFERS[id] = { text: "", reasoning: "" };
    STREAM_BUFFERS[id].reasoning += evt.payload.delta;
    const el = document.getElementById("rs-" + id);
    if (el) {
      el.style.display = "block";
      el.textContent = STREAM_BUFFERS[id].reasoning;
    }
  });

  const reloadEvents = ["message.done","tool.start","tool.done","http.captured","artifact.analyzed","finding.updated","scope.updated","swarm.updated","agent.changed","model.changed","provider.updated","channel.updated","session.updated"];
  for (const name of reloadEvents) {
    es.addEventListener(name, () => {
      if (name === "message.done") setStreamingState(false);
      refreshState();
    });
  }

  es.addEventListener("system.notice", (e) => {
    const evt = JSON.parse(e.data);
    toast(evt.payload?.message || "Notice");
    setStreamingState(false);
  });

  es.onerror = () => {
    const dot = document.getElementById("sseDot");
    if (dot) { dot.className = "status-dot err"; dot.title = "Reconnecting…"; }
    const st = document.getElementById("settingsSseStatus");
    if (st) { st.className = "pill danger"; st.textContent = "Reconnecting…"; }
  };
  es.onopen = () => {
    const dot = document.getElementById("sseDot");
    if (dot) { dot.className = "status-dot"; dot.title = "Synced"; }
    const st = document.getElementById("settingsSseStatus");
    if (st) { st.className = "pill success"; st.textContent = "Synced"; }
  };
}

/* ========================================================================
   Command Palette & Shortcuts
   ======================================================================== */
let cpItems = [];
let cpIdx = 0;

function buildPaletteItems() {
  const items = [
    { label: "New Chat", group: "Action", run: () => newSession() },
    { label: "New Project", group: "Action", run: () => openProjectModal() },
    { label: "Open Settings", group: "Action", run: () => openSettingsModal() },
    { label: "Toggle Sidebar", group: "Action", run: () => toggleSidebar() },
    { label: "Toggle Swarm Panel", group: "Action", run: () => { switchTab("console"); toggleSwarmDrawer(); } },
    { label: "Toggle Scope Enforcement", group: "Action", run: () => toggleScopeSwitch(STATE?.session?.scope?.mode !== "enforced") },
    { label: "Generate Red-Team Report", group: "Action", run: () => { switchTab("findings"); loadReport("redteam"); } },
    { label: "Stop Generation", group: "Action", run: () => abortRun() },
    { label: "Console", group: "View", run: () => switchTab("console") },
    { label: "HTTP Forge", group: "View", run: () => switchTab("http") },
    { label: "RE & JS Recon", group: "View", run: () => switchTab("re") },
    { label: "Findings & Report Studio", group: "View", run: () => switchTab("findings") },
    { label: "Providers & Scope", group: "View", run: () => switchTab("providers") },
    { label: "Channels & Bots", group: "View", run: () => switchTab("channels") },
  ];
  if (STATE?.sessions) {
    for (const s of STATE.sessions.slice(0, 12)) {
      items.push({ label: s.name || s.id, group: "Chat", run: () => switchSessionUi(s.id) });
    }
  }
  if (STATE?.agents) {
    for (const a of STATE.agents) {
      items.push({ label: "@" + a.id + " — " + a.title, group: "Agent", run: () => selectAgent(a.id) });
    }
  }
  for (const t of UI_THEMES) {
    items.push({ label: "Theme: " + t.name, group: "Theme", run: () => changeThemeUi(t.id) });
  }
  return items;
}

function renderCmdPalette() {
  const q = (document.getElementById("cpInput").value || "").trim().toLowerCase();
  const all = buildPaletteItems();
  cpItems = q ? all.filter(it => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q)) : all;
  if (cpIdx >= cpItems.length) cpIdx = 0;
  const list = document.getElementById("cpList");
  list.innerHTML = cpItems.length
    ? cpItems.map((it, i) =>
        '<div class="cp-item' + (i === cpIdx ? " active" : "") + '" onclick="runPaletteIdx(' + i + ')">' +
          '<span>' + esc(it.label) + '</span>' +
          '<span class="kbd">' + esc(it.group) + '</span>' +
        '</div>'
      ).join("")
    : '<div class="cp-item" style="color:var(--text-muted);">No matching commands</div>';
}

function openCmdPalette() {
  const dlg = document.getElementById("cmdPaletteDlg");
  document.getElementById("cpInput").value = "";
  cpIdx = 0;
  renderCmdPalette();
  if (!dlg.open) dlg.showModal();
  document.getElementById("cpInput").focus();
}

function runPaletteIdx(i) {
  const it = cpItems[i];
  document.getElementById("cmdPaletteDlg").close();
  if (it) it.run();
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    const dlg = document.getElementById("cmdPaletteDlg");
    if (dlg.open) dlg.close(); else openCmdPalette();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    const dlg = document.getElementById("settingsDlg");
    if (dlg.open) dlg.close(); else openSettingsModal();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
    e.preventDefault();
    toggleSidebar();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === ".") {
    e.preventDefault();
    switchTab("console");
    toggleSwarmDrawer();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
    e.preventDefault();
    cycleTheme();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && ["1", "2", "3", "4", "5"].includes(e.key)) {
    const groups = groupConnectedModels();
    const g = groups[Number(e.key) - 1];
    if (g && g.variants.length) {
      e.preventDefault();
      const v = g.variants.find(x => x.label === "medium") || g.variants[0];
      selectModelSpec(v.spec);
      return;
    }
  }
  if (e.key === "Escape") {
    document.getElementById("themeMenu")?.classList.remove("open");
    closeModelPicker();
    closeCtxMenu();
    closeMobileSidebar();
    return;
  }
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  const isTyping = tag === "input" || tag === "textarea" || tag === "select" || document.activeElement?.isContentEditable;
  if (!isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tabMap = { "1": "console", "2": "http", "3": "re", "4": "findings", "5": "providers", "6": "channels" };
    if (tabMap[e.key]) {
      e.preventDefault();
      switchTab(tabMap[e.key]);
    }
  }
});

document.getElementById("cpInput").addEventListener("input", () => { cpIdx = 0; renderCmdPalette(); });
document.getElementById("cpInput").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); if (cpItems.length) { cpIdx = (cpIdx + 1) % cpItems.length; renderCmdPalette(); } }
  else if (e.key === "ArrowUp") { e.preventDefault(); if (cpItems.length) { cpIdx = (cpIdx - 1 + cpItems.length) % cpItems.length; renderCmdPalette(); } }
  else if (e.key === "Enter") { e.preventDefault(); runPaletteIdx(cpIdx); }
});

try {
  if (localStorage.getItem("yedogu.sidebarCollapsed") === "1" && window.innerWidth > 820) {
    document.getElementById("appShell")?.classList.add("sidebar-collapsed");
  }
} catch {}

renderThemeMenu("obsidian");
renderJsReconEmpty();
updateSendBtnState();
(() => {
  const qs = new URLSearchParams(window.location.search);
  const t = qs.get("tab");
  if (t && TAB_LABELS[t]) switchTab(t);
  const th = qs.get("theme");
  if (th) applyWebTheme(th);
})();
refreshState().then(() => {
  const qs = new URLSearchParams(window.location.search);
  const th = qs.get("theme");
  if (th) applyWebTheme(th);
  if (!AUTO_REFRESHED_MODELS) {
    AUTO_REFRESHED_MODELS = true;
    api("/api/providers/refresh", { method: "POST", body: {} }).then(() => refreshState()).catch(() => {});
  }
});
connectSse();
</script>
</body>
</html>`;
}
